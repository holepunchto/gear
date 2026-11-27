import process from 'process';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import Repo, { type Updater } from 'pear-repo';
import { persistent } from 'bare-storage';
import { isBare, platform } from 'which-runtime';
import type { GipDB } from './gip.js';
import { events } from './events.js';
import { log, logError } from './log.js';
import pkg from '../../../package.json' with { type: 'json' };
import manifest from '../../../pear.json' with { type: 'json' };

// P2P over-the-air updates for the packaged app.
//
// A separate channel from the Discover manifest in source.ts: that one carries
// config (a hyperconf block every client reseeds), this one tracks releases of
// Gear's own source repo.
//
// Deliberately pear-repo and not pear-runtime. Two reasons:
//
//   1. package.json#upgrade is a git+pear:// link, which pear-runtime cannot
//      consume — pear-link does not parse the scheme, and a gip remote holds
//      git objects rather than a by-arch tree to mirror.
//   2. requiring pear-runtime at all breaks the packaged app. Its index.js
//      does `require('#run')` at module scope, which pulls in bare-worker and
//      bare-thread, and bare-thread then throws at boot:
//        Uncaught Error: Module protocol of version undefined is not supported
//      That is for a run() static this app never calls.
//
// pear-repo watches the repo over the gip stack Gear already has, and rebuilds
// from source on a new release tag — with the build steps pear.json#make.lifecycle
// declares, which are this project's own npm scripts.

const NAME = pkg.productName;

// 'available' is where an update waits for the user: the release has been
// resolved to an immutable checkout but nothing has been built, because
// building it is minutes of CPU and, on Windows, a certificate the user may
// have to approve. Both follow the click, not the tag.
export type UpdateState =
	| { status: 'idle' }
	| { status: 'checking' }
	| { status: 'available'; version: string }
	| { status: 'current'; version: string }
	| { status: 'building'; version: string; label: string; step: number; steps: number }
	| { status: 'applied'; version: string }
	| { status: 'failed'; error: string; version?: string };

let state: UpdateState = { status: 'idle' };
let failedTag: string | null = null;

export function getUpdateState(): UpdateState {
	return state;
}

function setState(next: UpdateState) {
	state = next;
	events.emit('update', next);
}

// What a rebuild is doing, in the order it does it. The names are the operation
// tags pear-repo pushes, forwarded by the updater; the text is ours. A spawned
// lifecycle step arrives as 'script' whichever step it is, so which one it is
// comes off the payload rather than the tag.
const STEPS = 6;

function describe(phase: string, data: Record<string, unknown>): { label: string; step: number } {
	switch (phase) {
		case 'cloning':
			return { label: 'Cloning the release', step: 1 };
		case 'toolchain':
		case 'surveyed':
			return { label: 'Resolving dependencies', step: 2 };
		case 'script':
			if (data.step === 'make') return { label: 'Building the app', step: 3 };
			if (data.step === 'release') return { label: 'Packaging the release', step: 4 };
			return { label: 'Installing dependencies', step: 2 };
		case 'compiling':
			return { label: 'Building the app', step: 3 };
		case 'releasing':
			return { label: 'Packaging the release', step: 4 };
		case 'released':
		case 'installing':
			return { label: 'Staging the build', step: 5 };
		case 'app':
			return { label: `Placing ${data.app ?? 'the app'}`, step: 5 };
		case 'final':
			return { label: 'Build complete', step: 5 };
		// The last step is the only one that touches the installed app, so the
		// bar reaches the end when the swap starts, not when the build does.
		case 'swapping':
			return { label: 'Installing', step: 6 };
		default:
			return { label: phase, step: 1 };
	}
}

// The build's own output, kept so a page opened or reloaded mid-build shows
// what has happened rather than starting blank. Bounded: a compile is noisy and
// this sits in memory for the life of the process.
const LOG_LIMIT = 300;
let buildLog: string[] = [];

export function getBuildLog(): string[] {
	return buildLog;
}

function appendLog(text: string) {
	const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
	const kept = lines.filter((line) => line !== '');
	if (kept.length === 0) return;

	buildLog = [...buildLog, ...kept].slice(-LOG_LIMIT);
	events.emit('build-log', kept);
}

/**
 * What gets swapped, per platform. `name` is the built artifact's filename, as
 * produced by `npm run release <host>`; `app` is the live copy to replace.
 *
 *   - macOS   the .app bundle, three levels up from Contents/MacOS/<exe>
 *   - Linux   the AppImage file, which only the APPIMAGE env var knows
 *   - Windows no live path to replace: the staged MSIX is handed to the package
 *             manager, which owns where the app lives. `bundled` is what turns
 *             updates on in the absence of an `app`.
 *
 * Android is absent on purpose: a source rebuild needs a toolchain, and the
 * APK is installed by the system. It is handled on the android-handoff branch.
 */
function target(): { name: string; app?: string; bundled?: boolean } | null {
	switch (platform) {
		case 'darwin':
			return { name: `${NAME}.app`, app: path.resolve(process.execPath, '../../..') };
		case 'linux': {
			const appImage = process.env.APPIMAGE;
			if (!appImage) return null; // running unpackaged from an AppDir
			return { name: `${NAME}.AppImage`, app: appImage };
		}
		case 'win32':
			return { name: `${NAME}.msix`, bundled: true };
		default:
			return null;
	}
}

/**
 * Updates only make sense for a build that was shipped. Under `vite dev` the
 * process is node, and under `bare build/index.js` the executable is still
 * bare — in both cases there is nothing to replace, and the updater would
 * rebuild only to swap over a path that isn't the app.
 */
function packaged(): boolean {
	if (!isBare) return false;
	const exe = path.basename(process.execPath).replace(/\.exe$/i, '');
	return exe !== 'bare' && exe !== 'node';
}

const g = globalThis as unknown as { __pear?: { repo: Repo; updater: Updater } | null };

function stack(db: GipDB): { store?: unknown; swarm?: unknown } {
	const held = db as unknown as { _store?: unknown; swarm?: unknown };
	if (!held._store || !held.swarm) return {};
	return { store: held._store, swarm: held.swarm };
}

export function startUpdater(db: GipDB): Repo | null {
	if (g.__pear !== undefined) return g.__pear?.repo ?? null;
	g.__pear = null;

	if (process.env.GEAR_NO_UPDATES) {
		log('updates disabled (GEAR_NO_UPDATES)');
		return null;
	}

	if (!packaged()) {
		log('updates disabled — not a packaged build');
		return null;
	}

	if (!pkg.upgrade || pkg.upgrade.includes('<')) {
		log('updates disabled — package.json#upgrade is not set');
		return null;
	}

	const t = target();
	if (!t) {
		log(`updates disabled — no swap target on ${platform}`);
		return null;
	}

	// The gip stack is passed in whole: the updater tracks Gear's own repo on
	// it, which means no second swarm, no second corestore, and the repo shows
	// up in the library like any other.
	//
	// The lifecycle comes from pear.json#make, so a rebuild runs the same two
	// scripts a release here runs, and there is one place that says so.
	const repo = new Repo({
		dir: storageDir(),
		lifecycle: manifest.make.lifecycle,
		confirm: false,
		...stack(db)
	});

	let pear: Updater;

	try {
		pear = new Repo.Updater({
			repo,
			dir: storageDir(),
			upgrade: pkg.upgrade,
			version: pkg.version,
			...t
		});
	} catch (err) {
		log(`updates disabled — ${(err as Error).message}`);
		repo.close().catch(() => {});
		return null;
	}

	g.__pear = { repo, updater: pear };
	setState({ status: 'checking' });

	repo.ready().catch((err: Error) => logError('updater failed to start', err));

	// An unhandled 'error' here takes the process down. It also has to move the
	// UI off whatever it was showing: a rebuild that throws emits this and
	// nothing else, so without it the page sits on "Building…" forever.
	pear.on('error', (err: Error) => {
		logError('updater', err);
		if (state.status === 'checking' || state.status === 'building') {
			setState({ status: 'failed', error: err.message, version: pear.release?.version });
		}
	});

	// The rebuild is a detached npm build with no terminal behind it, so this is
	// the only place its output exists at all. It goes to the log the UI shows
	// as well as the app log, because "what is happening" during a multi-minute
	// build is mostly what the build itself is saying.
	pear.on('build-output', ({ chunk }: { chunk: string }) => {
		appendLog(chunk);
		const line = chunk.trimEnd();
		if (line) log('build:', line);
	});

	pear.on('update-scheduled', (delay: number) => {
		log(`update scheduled in ${Math.round(delay / 1000)}s`);
		if (state.status === 'checking') setState({ status: 'current', version: pkg.version });
	});

	// A release was found. Nothing is built yet and nothing will be until the
	// user asks for it.
	pear.on('updated', ({ version, tag }: { version: string; tag: string }) => {
		log(`update ${version} available (${tag})`);
		failedTag = null;
		if (state.status === 'building' || state.status === 'applied') return;
		setState({ status: 'available', version });
	});

	pear.on('building', ({ version }: { version: string }) => {
		log(`rebuilding ${version} from source`);
		buildLog = [];
		appendLog(`Building ${version} from source`);
		setState({ status: 'building', version, label: 'Starting', step: 1, steps: STEPS });
	});

	// Steps rather than bytes: a source rebuild has no total to divide by, so
	// what the UI gets is pear-repo's own account of which part is running.
	pear.on('build-progress', ({ phase, ...data }: { phase: string }) => {
		const { label, step } = describe(phase, data as Record<string, unknown>);
		appendLog(label);
		log(`build ${step}/${STEPS}: ${label}`);
		if (state.status === 'building') setState({ ...state, label, step });
	});

	recheck(pear).then(() => {
		if (state.status !== 'checking') return;
		const release = pear.release;
		if (release) setState({ status: 'available', version: release.version });
		else setState({ status: 'current', version: pkg.version });
	});

	log(`updater watching ${pkg.upgrade} (current ${pkg.version}, target ${t.name})`);
	return repo;
}

/**
 * Build the pending release and install it. This is the click.
 *
 * Everything expensive or intrusive is in here rather than in the background
 * check: the source rebuild, and on Windows a signing certificate that may need
 * administrator. A UAC dialog moments after someone pressed "Install update" is
 * expected; the same dialog arriving because a tag was pushed is not.
 */
const CHECK_WAIT = 15_000;

async function recheck(pear: Updater) {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const waited = new Promise<void>((resolve) => {
		timer = setTimeout(() => {
			log('update check timed out — building the release already found');
			resolve();
		}, CHECK_WAIT);
	});

	try {
		await Promise.race([pear.check(), waited]);
	} catch (err) {
		logError('update check failed', err);
	} finally {
		clearTimeout(timer);
	}
}

export async function checkUpdate(): Promise<
	{ ok: true; found?: string; none?: string } | { ok: false; error: string }
> {
	const pear = g.__pear?.updater ?? null;
	if (!pear) return { ok: false, error: 'Updates are not enabled in this build' };
	if (state.status === 'building') return { ok: false, error: 'An update is already building' };

	const before = state;
	const had = state.status === 'failed' ? failedTag : (pear.release?.tag ?? null);

	log('checking for a newer release');
	setState({ status: 'checking' });
	await recheck(pear);

	const release = pear.release;

	if (!release) {
		log('no release tags on the repository');
		failedTag = null;
		setState({ status: 'current', version: pkg.version });
		return { ok: true, none: pkg.version };
	}

	if (release.tag !== had) {
		log(`${release.version} found`);
		failedTag = null;
		setState({ status: 'available', version: release.version });
		return { ok: true, found: release.version };
	}

	log(`nothing newer than ${release.version}`);
	setState(before);
	return { ok: true, none: release.version };
}

export async function applyUpdate(): Promise<{ ok: true } | { ok: false; error: string }> {
	const pear = g.__pear?.updater ?? null;
	if (!pear) return { ok: false, error: 'Updates are not enabled in this build' };
	if (state.status === 'building') return { ok: false, error: 'An update is already building' };

	// The pending release is the updater's, not the UI state's: after a failed
	// build the state carries an error rather than a version, and that is exactly
	// when the user presses this again.
	const version = pear.release?.version as string | undefined;
	const built = pear.release?.tag ?? null;
	if (!version) return { ok: false, error: 'No update is waiting' };

	try {
		await pear.applyUpdate();
		failedTag = null;
		log(`update ${version} applied — restart to run it`);
		appendLog(`Installed ${version} — restart to run it`);
		setState({ status: 'applied', version });
		return { ok: true };
	} catch (err) {
		const error = (err as Error).message;
		logError('applying update failed', err);
		appendLog(`Failed: ${error}`);
		// applyUpdate clears its own `applied` flag on failure, so the release is
		// still pending and pressing the button again retries it.
		const waiting = pear.release;

		if (waiting && waiting.tag !== built) {
			failedTag = null;
			log(`${waiting.version} arrived while ${version} was building`);
			setState({ status: 'available', version: waiting.version });
			return { ok: false, error };
		}

		failedTag = built;
		setState({ status: 'failed', error, version });
		return { ok: false, error };
	}
}

/**
 * Does not touch the gip stack that was passed in — the updater only tracks a
 * repo on it.
 */
export async function closeUpdater() {
	const held = g.__pear;
	g.__pear = undefined;
	if (!held) return;
	await held.updater.close().catch(() => {});
	await held.repo.close().catch(() => {});
}

/**
 * The MSIX package name, which is bare-build's `--identifier`. It lives in the
 * make scripts rather than in a field of its own, so it is read back out of them
 * instead of kept as a second copy that can drift.
 */
function identifier(): string | null {
	for (const script of Object.values(pkg.scripts ?? {})) {
		const match = /--identifier\s+(\S+)/.exec(String(script));
		if (match) return match[1];
	}
	return null;
}

/**
 * How to start the replacement that an applied update put on disk, as a command
 * for the platform's own shell.
 *
 *   - macOS   `open -n` on the swapped bundle, which starts a fresh instance
 *   - Linux   the AppImage path, which the swap replaced in place
 *   - Windows the installed package, by the AUMID the shell launches packages
 *             through. The installer owns where the app lives and the family
 *             name carries a hash of the publisher, so it is looked up at
 *             launch rather than guessed; `App` is the Application Id
 *             bare-build writes into the manifest.
 */
function launchCommand(): string | null {
	// Same reasoning as the updater itself: under `vite dev` or `bare build/...`
	// there is no app to start, and on macOS the path would resolve three levels
	// up from the interpreter into something that is not a bundle.
	if (!packaged()) return null;

	if (platform === 'win32') {
		const id = identifier();
		if (!id) return null;
		return [
			`$family = (Get-AppxPackage -Name ${psQuote(id)}).PackageFamilyName`,
			`if (-not $family) { throw 'no installed package named ${id}' }`,
			'Start-Process "shell:AppsFolder\\$family!App"'
		].join('; ');
	}

	const app = target()?.app;
	if (!app) return null;
	if (platform === 'darwin') return `open -n ${quote(app)}`;
	if (platform === 'linux') return quote(app);
	return null;
}

export function canRestart(): boolean {
	return launchCommand() !== null;
}

function storageDir(): string {
	const dir = process.env.GEAR_STORAGE ?? path.join(persistent(), NAME);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

/**
 * Where the relaunch reports to. By the time it runs this process is gone, so
 * there is nothing of ours left to catch a failure — it goes to a file beside
 * the store rather than to a log no one is reading.
 */
function relaunchLog(): string | null {
	try {
		return path.join(storageDir(), 'relaunch.log');
	} catch (err) {
		logError('relaunch log unavailable', err);
		return null;
	}
}

/**
 * Hold off until this process is actually gone, then launch. Waiting on the pid
 * rather than for a fixed delay is what keeps the two instances apart: both open
 * the same gip store and it takes an exclusive lock, so a replacement that
 * starts too early dies on "File descriptor could not be locked". Bounded at 20s
 * either way, so a shutdown that hangs cannot leave a process spinning forever.
 */
const WAIT_TICKS = 100;

function spawnPosixRelaunch(command: string, out: string | null) {
	// `kill -0` signals nothing; it is the portable liveness test.
	const wait = `i=0; while kill -0 ${process.pid} 2>/dev/null && [ $i -lt ${WAIT_TICKS} ]; do sleep 0.2; i=$((i+1)); done; sleep 0.3`;
	const redirect = out ? `>${quote(out)} 2>&1` : '>/dev/null 2>&1';

	const child = spawn('/bin/sh', ['-c', `{ ${wait}; ${command}; } ${redirect} &`], {
		detached: true,
		stdio: 'ignore'
	});
	child.unref?.();
}

function spawnWindowsRelaunch(command: string, out: string | null) {
	// The script goes in a file because inline it would have to survive two
	// levels of quoting, cmd's and PowerShell's. scripts/make.js writes a .ps1
	// for its one elevated step for the same reason.
	const script = path.join(storageDir(), 'relaunch.ps1');
	fs.writeFileSync(
		script,
		[
			`Wait-Process -Id ${process.pid} -Timeout ${(WAIT_TICKS * 0.2) | 0} -ErrorAction SilentlyContinue`,
			'Start-Sleep -Milliseconds 300',
			'try {',
			`  ${command}`,
			'} catch {',
			out ? `  $_ | Out-File -FilePath ${psQuote(out)}` : '  exit 1',
			'}',
			''
		].join('\n')
	);

	// `start` hands the work to a process cmd does not wait for, so cmd exits at
	// once and the PowerShell that waits is no longer a child of ours. The empty
	// string is `start`'s title argument, which otherwise eats the command.
	const child = spawn(
		'cmd.exe',
		['/d', '/s', '/c', 'start', '', '/b', 'powershell', '-NoProfile', '-File', script],
		{ detached: true, stdio: 'ignore', windowsHide: true }
	);
	child.unref?.();
}

/**
 * Start the updated app and stop this one.
 *
 * The replacement cannot be a plain child of this process. bare-subprocess
 * registers a teardown callback that SIGTERMs every live child when Bare shuts
 * down (bare_subprocess__on_teardown, in its binding.c), and this process shuts
 * down gracefully precisely because it handles SIGTERM — so a child waiting for
 * us to exit is killed before it can relaunch anything, which is exactly what
 * happened: the app closed and nothing came back. `detached` does not cover it;
 * that is about process groups, not that callback.
 *
 * Handing the work to something the shell does not wait for is what gets past
 * it: the process we spawn exits immediately, so come teardown there is no child
 * of ours left to kill, and the one that waits has been reparented away from us.
 * Both platforms do that, each in its own shell — `&` under sh, `start` under
 * cmd.
 */
export function restart(): { ok: true } | { ok: false; error: string } {
	const command = launchCommand();
	if (!command) return { ok: false, error: 'Restarting is not supported on this build' };

	const out = relaunchLog();

	try {
		if (platform === 'win32') spawnWindowsRelaunch(command, out);
		else spawnPosixRelaunch(command, out);
	} catch (err) {
		logError('relaunch failed', err);
		return { ok: false, error: (err as Error).message };
	}

	log(`relaunching: ${command}${out ? ` (output: ${out})` : ''}`);

	// Long enough for the response to reach the page that asked for this.
	setTimeout(() => {
		log('restarting');
		try {
			// SIGTERM rather than exit: the entry point's own shutdown handler
			// closes the native window, which is what lets the UI event loop
			// unwind instead of the process being torn out from under it.
			process.kill(process.pid, 'SIGTERM');
		} catch {
			process.exit(0);
		}
	}, 300);

	return { ok: true };
}

// A single-quoted shell string, which has one escape: '\'' for '.
function quote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

// PowerShell's single-quoted string, where the one escape is '' for '.
function psQuote(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}
