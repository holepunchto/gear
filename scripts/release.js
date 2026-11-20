#!/usr/bin/env node

// Collect the built distributables into a Pear deployment folder.
//
//   node scripts/release.js                           # every host found in out/
//   node scripts/release.js darwin-arm64 linux-x64    # just these
//
// Each host must already have been built with `npm run make -- --host <host>`.
// `pear build` writes the layout the updater reads:
//
//   <target>/
//     package.json          ← version the running app compares against
//     pear.json             ← updates.minver
//     by-arch/<host>/app/<artifact>
//
// The target defaults to out/release, which is not negotiable: `pear install`
// of a git+pear:// link clones this repo, runs `npm run make` then
// `npm run release <host>`, and then installs from `<repo>/out/release` — a
// hardcoded path in pear-install's _installFromSource. gip-transport uses the
// same location. Override with PEAR_TARGET when staging by hand, where pear
// prefers the deployment folder to sit outside the app directory.

import { existsSync, readFileSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.productName;

// Keep in step with scripts/make.js. Desktop hosts take `--<host>-app`;
// android takes `--android-arm64` and wants the OTA bundle, not the apk — the
// apk is what ships to the store, the bundle is what replicates.
const HOSTS = {
	'darwin-arm64': { flag: '--darwin-arm64-app', artifact: `${NAME}.app` },
	'darwin-x64': { flag: '--darwin-x64-app', artifact: `${NAME}.app` },
	'linux-arm64': { flag: '--linux-arm64-app', artifact: `${NAME}.AppImage` },
	'linux-x64': { flag: '--linux-x64-app', artifact: `${NAME}.AppImage` },
	'win32-arm64': { flag: '--win32-arm64-app', artifact: `${NAME}.msix` },
	'win32-x64': { flag: '--win32-x64-app', artifact: `${NAME}.msix` },
	'android-arm64': { flag: '--android-arm64', artifact: 'app.bundle' }
};

const TARGET = process.env.PEAR_TARGET || join(ROOT, 'out', 'release');

const requested = process.argv.slice(2);

for (const host of requested) {
	if (!HOSTS[host]) {
		console.error(`Unknown host: ${host}\nKnown: ${Object.keys(HOSTS).join(', ')}`);
		process.exit(1);
	}
}

const selected = requested.length ? requested : Object.keys(HOSTS);

const flags = [];
for (const host of selected) {
	const { flag, artifact } = HOSTS[host];
	const file = join(ROOT, 'out', host, artifact);

	if (!existsSync(file)) {
		// Only a hard error when the host was asked for by name — a bare run
		// collects whatever happens to be built.
		const message = `missing ${file} — run: npm run make -- --host ${host}`;
		if (requested.length) {
			console.error(message);
			process.exit(1);
		}
		console.warn(`Warning: ${message}`);
		continue;
	}

	flags.push(flag, file);
}

if (flags.length === 0) {
	console.error('Nothing to collect. Build at least one host first:\n  npm run make');
	process.exit(1);
}

if (pkg.upgrade.includes('<')) {
	console.error(
		`package.json#upgrade is still the placeholder (${pkg.upgrade}).\n` +
			"Set it to this repo's git+pear:// link for source installs, or allocate a\n" +
			'pear:// key with `pear touch` for prebuilt channels. Every build follows the\n' +
			'link it ships with.'
	);
	process.exit(1);
}

// Via npx rather than a global `pear`, matching gip-transport's release
// script: CI runners have node but no Pear install, and the deployment folder
// is all `pear stage` needs afterwards.
const args = [
	'--yes',
	'pear-build',
	...flags,
	'--target',
	TARGET,
	'--package',
	join(ROOT, 'package.json'),
	'--config',
	join(ROOT, 'pear.json')
];

console.log(`npx ${args.join(' ')}\n`);

const result = spawnSync('npx', args, {
	stdio: 'inherit',
	cwd: ROOT,
	shell: process.platform === 'win32'
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

// pear build copies the one artifact it was given, so the signing certificate
// make.js exported has to be placed by hand. It sits beside the MSIX because
// that is where pear-repo-updater looks for it when it stages an update; with
// no .cer the updater falls back to reading the signer out of the signature,
// which works the same but only for an already-signed package.
for (const host of selected) {
	if (!host.startsWith('win32-')) continue;
	const cer = join(ROOT, 'out', host, `${NAME}.cer`);
	if (!existsSync(cer)) continue;
	copyFileSync(cer, join(TARGET, 'by-arch', host, 'app', `${NAME}.cer`));
	console.log(`  + ${host}/app/${NAME}.cer`);
}

console.log(`\n✓ deployment folder: ${TARGET}`);
console.log('  source install installs straight from here');
console.log('  prebuilt channel: pear stage <channel> ' + TARGET);
console.log('                    pear seed <channel>   (public address or cone NAT)');
