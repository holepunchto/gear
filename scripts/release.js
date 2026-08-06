#!/usr/bin/env bare
import { spawnSync } from 'bare-subprocess';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'bare-fs';
import { join } from 'bare-path';
import { fileURLToPath } from 'bare-url';
import build from 'bare-build';
import { type as BUILD_TYPE } from 'bare-build/constants';
import { prebuilds as rawPrebuilds } from 'bare-native/runtime';
import paparam from 'paparam';
import process from 'bare-process';

const { command, flag, summary } = paparam;

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Load .env from project root if present
{
	const envPath = join(ROOT, '.env');
	if (existsSync(envPath)) {
		for (const line of readFileSync(envPath, 'utf8').split('\n')) {
			const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(.*)$/);
			if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
		}
	}
}

// require.asset always returns a plain path string (in both Node.js and Bare when loaded as
// a CJS dependency). Wrap the prebuilds so bare-build gets the { type, path } it expects,
// inferring the type from the file extension.
function loadRuntime() {
	const t = BUILD_TYPE;
	const raw = rawPrebuilds;
	return {
		prebuilds: Object.fromEntries(
			Object.entries(raw).map(([host, fn]) => [
				host,
				() => {
					const result = fn();
					const path = typeof result === 'string' ? result : result?.path;
					const type =
						path?.endsWith('.so') || path?.endsWith('.dll') ? t.SHARED_LIBRARY : t.EXECUTABLE;
					return { type, path, dependencies: result?.dependencies ?? [] };
				}
			])
		)
	};
}

const runtime = loadRuntime();

// ── Config ────────────────────────────────────────────────────────────────────

const DARWIN_IDENTITY = 'Developer ID Application: DOMINIC PAUL CASSIDY (DS9X2R5J6B)';
const BUNDLE_ID = 'io.gear.app';
const APP_NAME = 'Gear';
const NOTARIZE_PROFILE = process.env.NOTARIZE_PROFILE || 'gear';

// package.json is the single source of the marketing version. The build number
// (Android versionCode) must be a unique, monotonic integer per upload, so it
// comes from the git commit count, overridable with BUILD_NUMBER.
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const BUILD = process.env.BUILD_NUMBER || gitBuildNumber();

function gitBuildNumber() {
	try {
		return capture('git rev-list --count HEAD');
	} catch {
		return '1';
	}
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const cmd = command(
	'release',
	summary('Build and release Gear for all platforms'),
	flag('--darwin-arm64', 'Build for macOS ARM64'),
	flag('--android-arm64', 'Build for Android ARM64'),
	flag('--unsigned', 'Build macOS without signing or notarization (no membership needed)')
);

cmd.parse(process.argv.slice(2));
const { darwinArm64, androidArm64, unsigned } = cmd.flags;
const anySelected = darwinArm64 || androidArm64;

const platforms = {
	darwin: anySelected ? !!darwinArm64 : true,
	android: anySelected ? !!androidArm64 : true
};

// ── Logging ───────────────────────────────────────────────────────────────────

const T0 = Date.now();
const totalSteps = 1 + Object.values(platforms).filter(Boolean).length;
let step = 0;

function section(name) {
	const header = `[${++step}/${totalSteps}] ${name}`;
	console.log(`\n━━━ ${header} ${'━'.repeat(Math.max(2, 52 - header.length))}`);
}

function tick(label, ms) {
	console.log(`  ✓ ${label.padEnd(28)}${(ms / 1000).toFixed(1)}s`);
}

function arrow(p) {
	console.log(`  → ${p}`);
}

function warn(msg) {
	console.log(`  ⚠ ${msg}`);
}

async function timed(label, fn) {
	const t = Date.now();
	await fn();
	tick(label, Date.now() - t);
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function exec(cmd, { quiet = false } = {}) {
	const result = spawnSync(cmd, [], { shell: true, cwd: ROOT, stdio: quiet ? 'pipe' : 'inherit' });
	if (result.status !== 0) {
		const stderr = result.output?.[2];
		const detail = stderr ? '\n' + stderr.toString().trim() : '';
		throw new Error(`Command failed: ${cmd}${detail}`);
	}
}

function capture(cmd) {
	const result = spawnSync(cmd, [], { shell: true, cwd: ROOT, stdio: 'pipe' });
	if (result.status !== 0) {
		const stderr = result.output?.[2];
		throw new Error(`Command failed: ${cmd}${stderr ? '\n' + stderr.toString().trim() : ''}`);
	}
	return result.output[1].toString().trim();
}

// ── Paths ─────────────────────────────────────────────────────────────────────

function abs(...parts) {
	return join(ROOT, ...parts);
}

function tmp(...parts) {
	return abs('.release-tmp', ...parts);
}

function setup() {
	if (existsSync(abs('.release-tmp'))) rmSync(abs('.release-tmp'), { recursive: true });
	mkdirSync(abs('.release-tmp'), { recursive: true });
	mkdirSync(abs('out'), { recursive: true });
}

function cleanup() {
	if (existsSync(abs('.release-tmp'))) rmSync(abs('.release-tmp'), { recursive: true });
}

// ── Icon generation ───────────────────────────────────────────────────────────

function makeIcns() {
	const iconset = tmp('gear.iconset');
	mkdirSync(iconset);
	for (const [size, size2x] of [
		[16, 32],
		[32, 64],
		[128, 256],
		[256, 512],
		[512, 1024]
	]) {
		exec(`sips -z ${size} ${size} gear.png --out "${iconset}/icon_${size}x${size}.png"`, {
			quiet: true
		});
		exec(`sips -z ${size2x} ${size2x} gear.png --out "${iconset}/icon_${size}x${size}@2x.png"`, {
			quiet: true
		});
	}
	const icns = tmp('gear.icns');
	exec(`iconutil -c icns "${iconset}" -o "${icns}"`, { quiet: true });
	rmSync(iconset, { recursive: true });
	return icns;
}

// ── Darwin ────────────────────────────────────────────────────────────────────

async function buildDarwin(icns) {
	section('darwin-arm64');

	const bundle = abs(`out/gear-darwin-arm64/${APP_NAME}.app`);
	const dmg = abs('out/Gear-darwin-arm64.dmg');

	if (unsigned) {
		warn('building unsigned — not signed or notarized; other Macs need right-click → Open');
	}

	await timed(`bare-build (${unsigned ? 'unsigned' : 'signed'})`, async () => {
		for await (const _ of build('build/index.js', null, {
			base: ROOT,
			hosts: ['darwin-arm64'],
			out: abs('out/gear-darwin-arm64'),
			name: APP_NAME,
			version: VERSION,
			identifier: BUNDLE_ID,
			runtime,
			icon: icns,
			...(!unsigned && {
				sign: true,
				identity: DARWIN_IDENTITY,
				entitlements: abs('entitlements.plist'),
				hardenedRuntime: true
			})
		})) {
		}
	});

	if (!unsigned) {
		const zip = tmp('notarize.zip');
		await timed('notarize', async () => {
			exec(`ditto -c -k --keepParent "${bundle}" "${zip}"`);
			exec(`xcrun notarytool submit "${zip}" --keychain-profile "${NOTARIZE_PROFILE}" --wait`);
			rmSync(zip);
		});

		await timed('staple', async () => {
			exec(`xcrun stapler staple "${bundle}"`);
		});
	}

	await timed('dmg', async () => {
		if (existsSync(dmg)) rmSync(dmg);
		exec(`hdiutil create -volname "${APP_NAME}" -srcfolder "${bundle}" -ov -format UDZO "${dmg}"`, {
			quiet: true
		});
	});

	arrow(dmg);
}

// ── Android ───────────────────────────────────────────────────────────────────

async function buildAndroid() {
	section('android-arm64');

	const keystore = process.env.ANDROID_KEYSTORE;
	const kKey = process.env.ANDROID_KEYSTORE_KEY;
	const kPassword = process.env.ANDROID_KEYSTORE_PASSWORD;
	const canSign = !!(keystore && kKey && kPassword);

	if (!canSign) warn('ANDROID_KEYSTORE / _KEY / _PASSWORD not set — building unsigned');

	// Drive versionName (marketing) and versionCode (monotonic build) from the
	// single source, rather than the static values in manifest.xml.
	const manifest = tmp('manifest.xml');
	writeFileSync(
		manifest,
		readFileSync(abs('manifest.xml'), 'utf8')
			.replace(/android:versionName="[^"]*"/, `android:versionName="${VERSION}"`)
			.replace(/android:versionCode="[^"]*"/, `android:versionCode="${BUILD}"`)
	);

	await timed(`bare-build (${canSign ? 'signed' : 'unsigned'})`, async () => {
		for await (const _ of build('build/index.js', null, {
			base: ROOT,
			hosts: ['android-arm64'],
			out: abs('out/gear-android-arm64'),
			name: APP_NAME,
			version: VERSION,
			identifier: BUNDLE_ID,
			runtime,
			resources: abs('resources/android'),
			androidManifest: manifest,
			...(canSign && {
				sign: true,
				keystore,
				keystoreKey: kKey,
				keystorePassword: kPassword
			})
		})) {
		}
	});

	arrow(abs('out/gear-android-arm64/'));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	setup();

	section('vite build');
	const t0 = Date.now();
	exec('npm run build');
	tick('vite build', Date.now() - t0);

	const icns = platforms.darwin ? makeIcns() : null;

	if (platforms.darwin) await buildDarwin(icns);
	if (platforms.android) await buildAndroid();

	cleanup();
	console.log(
		`\n━━━ done in ${((Date.now() - T0) / 1000).toFixed(1)}s ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
	);
}

main().catch((err) => {
	console.error(`\n✗ ${err.message}`);
	if (err.cause) console.error(err.cause);
	console.error();
	process.exit(1);
});
