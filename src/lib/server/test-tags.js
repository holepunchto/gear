// @ts-nocheck
import test from 'brittle';
import Corestore from 'corestore';
import { Remote } from 'gip-remote';
import b4a from 'b4a';
import { createTag, tagNameError, TagError } from './tags.js';

const BLOB = 'b'.repeat(40);
const TREE = 'c'.repeat(40);
const FIRST = '1'.repeat(40);
const SECOND = '2'.repeat(40);

test('a tag points at a branch head or a commit', async function (t) {
	const remote = await repo(t);

	t.is(await createTag(remote, 'v1.0.0', 'main'), SECOND);
	t.is(await createTag(remote, 'v0.9.0', FIRST), FIRST);

	const refs = await remote.getAllRefs();
	t.ok(refs.some((r) => r.ref === 'refs/tags/v1.0.0' && r.oid === SECOND));
	t.ok(refs.some((r) => r.ref === 'refs/tags/v0.9.0' && r.oid === FIRST));
});

test('an existing tag, an unknown target or a bad name is refused', async function (t) {
	const remote = await repo(t);
	await createTag(remote, 'v1.0.0', 'main');

	await t.exception(createTag(remote, 'v1.0.0', FIRST), /already exists/);
	await t.exception(createTag(remote, 'v2.0.0', 'nope'), /No branch or commit/);
	await t.exception(createTag(remote, 'v 2', 'main'), TagError);
	t.is((await remote.getAllRefs()).length, 3);
});

test('tag names follow git', function (t) {
	for (const name of ['v1.0.0', 'release/2026-11', 'a.b_c-d', 'v1@2']) {
		t.is(tagNameError(name), null, name);
	}
	for (const name of [
		'',
		'has space',
		'-v1',
		'a..b',
		'a~1',
		'a^',
		'a:b',
		'a?',
		'a*',
		'a[0]',
		'a\\b',
		'v1.lock',
		'a/.b',
		'a//b',
		'/a',
		'a/',
		'a.',
		'@',
		'a@{1}'
	]) {
		t.ok(tagNameError(name), JSON.stringify(name));
	}
});

// A writable repo with two commits on main.
async function repo(t) {
	const store = new Corestore(await t.tmp());
	const remote = new Remote(store.session(), 'demo');
	await remote.ready();
	t.teardown(async () => {
		await remote.close();
		await store.close();
	});

	const tree = b4a.concat([b4a.from('100644 README\0'), b4a.from(BLOB, 'hex')]);
	const objects = new Map([
		[BLOB, object('blob', b4a.from('hello\n'))],
		[TREE, object('tree', tree)],
		[FIRST, object('commit', commit(null, 'first'))],
		[SECOND, object('commit', commit(FIRST, 'second'))]
	]);
	await remote.push('main', SECOND, objects);
	return remote;
}

function commit(parent, message) {
	const who = 'Dev <dev@example.com> 1700000000 +0000';
	return b4a.from(
		`tree ${TREE}\n${parent ? `parent ${parent}\n` : ''}author ${who}\ncommitter ${who}\n\n${message}\n`
	);
}

function object(type, data) {
	return { type, size: data.byteLength, data };
}
