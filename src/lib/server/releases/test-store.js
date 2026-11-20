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
		added: 0
	};
}

/** @param {string} k @param {string} id */
function proposal(k, id) {
	return {
		key: k,
		id,
		proposal: 'z32',
		previous: 0,
		mine: true,
		added: 0,
		release: null
	};
}
