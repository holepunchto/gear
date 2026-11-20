import test from 'brittle';
import Corestore from 'corestore';
import b4a from 'b4a';
import ReleaseStore from './store.js';

test('the seat key is derived from the corestore', async function (t) {
	const dir = await t.tmp();

	const first = await open(t, dir);
	const seat = await first.releases.seat();
	t.ok(b4a.equals(seat.publicKey, (await first.releases.seat()).publicKey));
	t.absent(b4a.equals(seat.publicKey, (await first.store.createKeyPair('gip')).publicKey));
	await first.close();

	const again = await open(t, dir);
	t.ok(b4a.equals((await again.releases.seat()).publicKey, seat.publicKey));
});

test('keys survive a restart', async function (t) {
	const dir = await t.tmp();

	const first = await open(t, dir);
	await first.releases.putKey(key('a', 'gear/stable'));
	await first.releases.putKey(key('b', 'gear/beta'));
	await first.close();

	const { releases } = await open(t, dir);
	t.is((await releases.getKey('a'))?.name, 'gear/stable');
	t.alike(
		(await releases.listKeys()).map((k) => k.key),
		['a', 'b']
	);
	t.is(await releases.getKey('c'), null);
});

test('proposals list per key and drop their responses with them', async function (t) {
	const { releases } = await open(t, await t.tmp());

	await releases.putProposal(proposal('a', 'p1'));
	await releases.putProposal(proposal('a', 'p2'));
	await releases.putProposal(proposal('b', 'p3'));

	t.alike(
		(await releases.listProposals('a')).map((p) => p.id),
		['p1', 'p2']
	);
	t.is((await releases.listProposals()).length, 3);

	await releases.putResponse('a', 'p1', { signer: 's1', response: 'r1' });
	await releases.putResponse('a', 'p1', { signer: 's1', response: 'r1' });
	await releases.putResponse('a', 'p1', { signer: 's2', response: 'r2' });
	await releases.putResponse('a', 'p2', { signer: 's1', response: 'r3' });
	t.is((await releases.listResponses('a', 'p1')).length, 2);

	await releases.deleteProposal('a', 'p1');
	t.is(await releases.getProposal('a', 'p1'), null);
	t.is((await releases.listResponses('a', 'p1')).length, 0);
	t.is((await releases.listResponses('a', 'p2')).length, 1);
});

test('archiving survives a restart and is undone by unarchive', async function (t) {
	const dir = await t.tmp();

	const first = await open(t, dir);
	await first.releases.putKey(key('a', 'gear/stable'));
	await first.releases.archive('a');
	t.is((await first.releases.getKey('a'))?.archived, true);
	await first.close();

	const { releases } = await open(t, dir);
	t.is((await releases.getKey('a'))?.archived, true);
	t.alike(
		(await releases.listKeys()).map((k) => [k.key, k.archived]),
		[['a', true]]
	);

	await releases.unarchive('a');
	t.is((await releases.getKey('a'))?.archived, false);
});

test('archived, revoked and old-format keys are left out of the active keys', async function (t) {
	const { releases } = await open(t, await t.tmp());

	await releases.putKey(key('a', 'gear/stable'));
	await releases.putKey(key('b', 'gear/beta'));
	await releases.putKey(key('c', 'gear/old'));
	await releases.putKey({ ...key('d', 'gear/old'), mirror: undefined });
	await releases.putKey(key('e', 'gear/stable'));
	await releases.archive('a');
	await releases.revoke('c');
	await releases.retire('e', 'b');

	t.alike(
		(await releases.activeKeys()).map((k) => k.key),
		['b', 'e'],
		'a retired key still makes its last release'
	);
	t.is((await releases.listKeys()).length, 5);
	t.is((await releases.getKey('e'))?.retiredTo, 'b');
});

test('revoking survives a restart and a write of a record read before it', async function (t) {
	const dir = await t.tmp();

	const first = await open(t, dir);
	await first.releases.putKey(key('a', 'gear/stable'));
	const read = await first.releases.getKey('a');
	await first.releases.revoke('a');
	if (read) await first.releases.putKey(read);
	t.is((await first.releases.getKey('a'))?.revoked, true);
	await first.close();

	const { releases } = await open(t, dir);
	t.alike(
		(await releases.listKeys()).map((k) => [k.key, k.revoked]),
		[['a', true]]
	);
});

test('putting a key read before archiving keeps it archived', async function (t) {
	const { releases } = await open(t, await t.tmp());

	await releases.putKey(key('a', 'gear/stable'));
	const read = await releases.getKey('a');
	await releases.archive('a');
	if (read) await releases.putKey({ ...read, repo: { name: 'gear', key: 'r' } });

	const after = await releases.getKey('a');
	t.is(after?.archived, true);
	t.is(after?.repo?.name, 'gear');

	await releases.unarchive('a');
	if (after) await releases.putKey(after);
	t.is((await releases.getKey('a'))?.archived, false);
});

/** @param {any} t @param {string} dir */
async function open(t, dir) {
	const store = new Corestore(dir);
	const releases = new ReleaseStore(store);
	await releases.ready();
	const close = async () => {
		await releases.close();
		await store.close();
	};
	t.teardown(close);
	return { store, releases, close };
}

/** @param {string} k @param {string} name */
function key(k, name) {
	return {
		key: k,
		name,
		namespace: 'gear/releases/' + name,
		signers: ['s1', 's2'],
		quorum: 2,
		repo: null,
		owner: true,
		labels: {},
		added: 0,
		mirror: true
	};
}

/** @param {string} k @param {string} id */
function proposal(k, id) {
	return {
		key: k,
		id,
		proposal: 'z32',
		length: 1,
		base: 0,
		mine: true,
		added: 0,
		tag: null,
		release: null
	};
}
