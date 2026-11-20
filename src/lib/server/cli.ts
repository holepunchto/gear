import process from 'process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { isAndroid, isIOS, isWindows } from 'which-runtime';
import Install from 'pear-install';

// The gip CLI and the git remote helper that comes with it, as a Pear link.
// Installing it is pear-install fetching the prebuilt binaries for this host off
// the swarm, so it needs neither npm nor a toolchain — which matters because the
// thing being installed is what makes `git clone git+pear://` work in the first
// place, and telling someone to install Node first to get it is a worse answer.
export const CLI_LINK = 'pear://gipjk71nbuj3zasm4ywczb93zqk5xbfup16c6d5j8w8yeja4ob6o';

// The equivalent for someone who would rather run it themselves.
export const INSTALL_COMMAND = `npx pear-install ${CLI_LINK}`;

// Where pear-install puts a package's `bin` entries. On Windows it nests them
// under the app's name, which is gip-transport's productName, not its name.
const BIN_DIR = isWindows
	? path.join(
			process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
			'Programs',
			'gip'
		)
	: path.join(os.homedir(), '.local', 'bin');

const HELPER = 'git-remote-git+pear' + (isWindows ? '.exe' : '');

const SHELL = process.env.SHELL || '/bin/zsh';

function sh(cmd: string, timeout: number) {
	const result = spawnSync(SHELL, ['-lc', cmd], { stdio: 'pipe', timeout });
	return {
		ok: result.status === 0,
		stdout: result.output?.[1]?.toString().trim() ?? '',
		stderr: result.output?.[2]?.toString().trim() ?? ''
	};
}

export type CliStatus = { installed: boolean; path: string | null; npm: boolean };

export function cliStatus(): CliStatus | null {
	if (isAndroid || isIOS) return null;

	// Looked for in two places because they answer different questions. The file
	// is whether it is installed; the shell is whether git will find it, which is
	// what actually matters for cloning. They disagree right after an install:
	// pear-install appends its bin directory to the user's PATH, and neither an
	// already-open shell nor this process has picked that up yet — so the file
	// check is what stops a successful install from reporting as a failure.
	const installed = path.join(BIN_DIR, HELPER);
	if (fs.existsSync(installed)) {
		return { installed: true, path: installed, npm: sh('command -v npm', 10_000).ok };
	}

	const helper = sh(`command -v '${HELPER}'`, 10_000);
	const npm = sh('command -v npm', 10_000);
	return {
		installed: helper.ok,
		path: helper.ok ? (helper.stdout.split('\n').pop() ?? null) : null,
		npm: npm.ok
	};
}

export async function installCli(): Promise<{ ok: boolean; error?: string }> {
	// interactive: false because there is no terminal behind this — it runs inside
	// the packaged app, from a button. Anything the install would otherwise stop
	// to ask would hang on a prompt nobody can see.
	const install = new Install({ link: CLI_LINK, interactive: false });

	try {
		await install.ready();
	} catch (err) {
		const message = (err as Error).message?.trim();
		return { ok: false, error: message || 'install failed' };
	} finally {
		await install.close().catch(() => {});
	}

	if (!cliStatus()?.installed) {
		return { ok: false, error: `installed, but no ${HELPER} in ${BIN_DIR}` };
	}

	return { ok: true };
}
