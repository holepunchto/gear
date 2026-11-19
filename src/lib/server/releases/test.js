import test from 'brittle';
import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';
import createTestnet from 'hyperdht/testnet.js';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import ReleaseKey from './index.js';

test('2 of 3 signers release, anyone commits', async function (t) {
	const { dc, kd, am } = await create(t);

	const proposal = await dc.key.propose(release('1.0.0'));
	const { record } = await kd.key.inspect(proposal);
	t.is(record.name, '1.0.0');
	t.is(record.previous, 0);

	const responses = [await dc.key.sign(proposal, dc.seat), await kd.key.sign(proposal, kd.seat)];
	t.is(await am.key.commit(proposal, responses), 1);

	await dc.key.core.update({ wait: true });
	t.is(dc.key.length, 1);
	t.is((await dc.key.get(0)).tag, 'v1.0.0');
});

test('any signer proposes the next release on top of the last', async function (t) {
	const { dc, kd, am } = await create(t);

	const first = await dc.key.propose(release('1.0.0'));
	await dc.key.commit(first, [
		await dc.key.sign(first, dc.seat),
		await am.key.sign(first, am.seat)
	]);

	await kd.key.core.update({ wait: true });
	const second = await kd.key.propose(release('1.1.0'));
	const { record } = await am.key.inspect(second);
	t.is(record.previous, 1);

	await kd.key.commit(second, [
		await kd.key.sign(second, kd.seat),
		await am.key.sign(second, am.seat)
	]);
	t.is(kd.key.length, 2);
	t.is((await kd.key.get(1)).name, '1.1.0');
});

test('commit below quorum is rejected', async function (t) {
	const { dc, kd } = await create(t);

	const proposal = await dc.key.propose(release('1.0.0'));
	await t.exception(
		dc.key.commit(proposal, [await kd.key.sign(proposal, kd.seat)]),
		/Insufficient quorum/
	);
	t.is(dc.key.length, 0);
});

test('a proposal overtaken by another release is refused', async function (t) {
	const { dc, kd, am } = await create(t);

	const stale = await dc.key.propose(release('1.0.0'));
	const winner = await kd.key.propose(release('1.0.1'));
	await kd.key.commit(winner, [
		await kd.key.sign(winner, kd.seat),
		await am.key.sign(winner, am.seat)
	]);

	await am.key.core.update({ wait: true });
	await t.exception(am.key.sign(stale, am.seat), /appends at 0, release key is at 1/);
});

test('a non-signer cannot sign', async function (t) {
	const { dc, kd } = await create(t);

	const proposal = await dc.key.propose(release('1.0.0'));
	await t.exception(kd.key.sign(proposal, crypto.keyPair()), /not a declared signer/);
});

async function create(t) {
	const { bootstrap } = await createTestnet(3, { teardown: t.teardown });

	const seeders = [await peer(t, bootstrap), await peer(t, bootstrap)];
	const blind = {
		addCore(core) {
			for (const s of seeders) {
				const copy = s.store.get({ key: core.key });
				s.swarm.join(copy.discoveryKey);
				copy.download({ start: 0, end: -1 });
			}
		}
	};

	const seats = [crypto.keyPair(), crypto.keyPair(), crypto.keyPair()];
	const opts = {
		signers: seats.map((s) => s.publicKey),
		namespace: 'gip-transport/stable',
		quorum: 2,
		blind
	};

	const [dc, kd, am] = await Promise.all(
		seats.map(async (seat) => {
			const p = await peer(t, bootstrap);
			const key = new ReleaseKey(p.store, p.swarm, opts);
			await key.ready();
			t.teardown(() => key.close(), { order: -1 });
			return { key, seat };
		})
	);

	t.ok(b4a.equals(dc.key.key, am.key.key));
	return { dc, kd, am };
}

async function peer(t, bootstrap) {
	const store = new Corestore(await t.tmp());
	const swarm = new Hyperswarm({ bootstrap });
	swarm.on('connection', (conn) => store.replicate(conn));
	t.teardown(async () => {
		await swarm.destroy();
		await store.close();
	});
	return { store, swarm };
}

function release(name) {
	return {
		name,
		tag: 'v' + name,
		commit: crypto.randomBytes(20),
		tree: crypto.randomBytes(20),
		repo: { key: crypto.randomBytes(32), length: 334 },
		artifacts: []
	};
}
