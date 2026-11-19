// @ts-nocheck
import test from 'brittle';
import { newerTags, compareVersions } from './newer-tags.js';

// a ← b ← c ← d on main, x forks off b.
const PARENTS = { a: null, b: 'a', c: 'b', d: 'c', x: 'b' };
const parent = async (oid) => PARENTS[oid] ?? null;

test('tags after the release on its history are newer, older ones are not', async function (t) {
	const tags = [
		{ name: 'v1.9.1', commit: 'd' },
		{ name: 'v1.9.0', commit: 'c' },
		{ name: 'v1.8.1', commit: 'b' }
	];
	t.alike(await newerTags({ tag: 'v1.9.0', commit: 'c' }, tags, parent), ['v1.9.1']);
});

test('a descendant is newer whatever it is called', async function (t) {
	const tags = [{ name: 'nightly', commit: 'd' }];
	t.alike(await newerTags({ tag: 'v1.9.0', commit: 'c' }, tags, parent), ['nightly']);
});

test('off the release history, semver decides', async function (t) {
	const tags = [
		{ name: 'v2.0.0', commit: 'x' },
		{ name: 'v1.8.2', commit: 'x' },
		{ name: 'v1.9.0-beta.1', commit: 'missing' }
	];
	t.alike(await newerTags({ tag: 'v1.9.0', commit: 'c' }, tags, parent), ['v2.0.0']);
});

test('a walk past the cap falls back to semver', async function (t) {
	const tags = [
		{ name: 'v1.8.9', commit: 'd' },
		{ name: 'v1.9.1', commit: 'd' }
	];
	t.alike(await newerTags({ tag: 'v1.9.0', commit: 'a' }, tags, parent, 2), ['v1.9.1']);
});

test('every tag is newer than no release', async function (t) {
	const tags = [{ name: 'v0.1.0', commit: 'a' }];
	t.alike(await newerTags(null, tags, parent), ['v0.1.0']);
});

test('semver order', function (t) {
	t.is(compareVersions('v1.10.0', 'v1.9.0'), 1);
	t.is(compareVersions('1.9.0', 'v1.9.0'), 0);
	t.is(compareVersions('v1.9.0-rc.1', 'v1.9.0'), -1);
	t.is(compareVersions('v1.9.0-rc.2', 'v1.9.0-rc.10'), -1);
	t.is(compareVersions('v1.9.0-alpha', 'v1.9.0-alpha.1'), -1);
	t.is(compareVersions('nightly', 'v0.0.1'), -1);
});
