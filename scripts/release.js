#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import process from 'node:process';
import Repo from 'pear-repo';

const ROOT = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.productName;
const HOSTS = Repo.HOSTS;

const TARGET = process.env.PEAR_TARGET || join(ROOT, 'out', 'release');
const MADE = join(ROOT, 'out', 'make');

const requested = process.argv.slice(2);

for (const host of requested) {
	if (!HOSTS[host]) {
		console.error(`Unknown host: ${host}\nKnown: ${Object.keys(HOSTS).join(', ')}`);
		process.exit(1);
	}
}

const built = existsSync(MADE) ? readdirSync(MADE).filter((name) => HOSTS[name]) : [];

// A host asked for by name has to be there; a bare run collects whatever is.
for (const host of requested) {
	if (built.includes(host)) continue;
	console.error(`missing ${join(MADE, host)} — run: npm run make -- --host ${host}`);
	process.exit(1);
}

const selected = requested.length ? requested : built;

if (selected.length === 0) {
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

const local = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
	.filter(([, spec]) => String(spec).startsWith('file:'))
	.map(([name, spec]) => ({ name, spec, at: resolve(ROOT, String(spec).slice('file:'.length)) }))
	.filter(({ at }) => at !== ROOT && !at.startsWith(ROOT + sep));

if (local.length > 0 && !process.env.GEAR_LOCAL_DEPS) {
	console.error(
		'package.json depends on paths that only exist on this machine:\n' +
			local.map(({ name, spec }) => `  ${name}: ${spec}`).join('\n') +
			'\n\nAn update rebuilds from a fresh clone and runs npm install there, so a file:\n' +
			'spec resolves to nothing and the build dies on the missing package. Point these\n' +
			'at a git+pear:// link or a published version before releasing.\n' +
			'Set GEAR_LOCAL_DEPS=1 to release anyway — the release will not be installable.'
	);
	process.exit(1);
}

// pear.json#make.lifecycle.release is `npm run release`, which is this script —
// so the step is nulled out here and pear-repo does its own collecting instead
// of spawning the command that is already running.
const repo = new Repo({
	root: ROOT,
	confirm: false,
	inherit: true,
	lifecycle: { release: null },
	release: { config: 'pear.json' }
});

let failed = null;

try {
	for await (const { tag, data } of repo.release({ hosts: selected, to: TARGET })) {
		if (tag === 'error') failed = data.message;
		else if (tag === 'releasing') console.log(`collecting ${data.apps.length} into ${TARGET}`);
		else if (tag === 'mirrored') console.log(`  ${data.to}`);
	}
} finally {
	await repo.close().catch(() => {});
}

if (failed !== null) {
	console.error(failed);
	process.exit(1);
}

for (const host of selected) {
	if (!host.startsWith('win32-')) continue;
	const cer = join(ROOT, 'out', 'cer', host, `${NAME}.cer`);
	if (!existsSync(cer)) continue;
	copyFileSync(cer, join(TARGET, 'by-arch', host, 'app', `${NAME}.cer`));
	console.log(`  + ${host}/app/${NAME}.cer`);
}

console.log(`\n✓ deployment folder: ${TARGET}`);
console.log('  source install installs straight from here');
console.log('  prebuilt channel: pear stage <channel> ' + TARGET);
console.log('                    pear seed <channel>   (public address or cone NAT)');
