// @ts-nocheck
import test from 'brittle';
import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';
import createTestnet from 'hyperdht/testnet.js';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import z32 from 'z32';
import c from 'compact-encoding';
import sodium from 'sodium-native';
import { generateKeys, sign } from 'hypercore-sign-lib';
import ReleaseKey from './index.js';
import { Proposal, ROTATE } from './messages.js';

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

test('a signer opens the key from the proposal alone', async function (t) {
	const { dc, kd, bootstrap } = await create(t);

	const proposal = await dc.key.propose(release('1.0.0'));
	const described = ReleaseKey.describe(proposal);
	t.ok(b4a.equals(described.key, dc.key.key));
	t.is(described.quorum, 2);
	t.is(described.length, 1);
	t.is(described.source.byteLength, 32);

	const envelope = c.decode(Proposal, z32.decode(proposal));
	const renamed = z32.encode(c.encode(Proposal, { ...envelope, namespace: 'gear/other' }));
	t.exception(() => ReleaseKey.describe(renamed), /namespace does not match/);

	const p = await peer(t, bootstrap);
	const key = new ReleaseKey(p.store, p.swarm, described);
	t.teardown(() => key.close(), { order: -1 });

	const response = await key.sign(proposal, kd.seat);
	t.is(await dc.key.commit(proposal, [response, await dc.key.sign(proposal, dc.seat)]), 1);

	await key.core.update({ wait: true });
	t.is((await key.get(0)).name, '1.0.0');
});

test('a follower opens the key from the key alone', async function (t) {
	const { dc, kd, bootstrap } = await create(t);

	for (const name of ['1.0.0', '1.1.0']) {
		const proposal = await dc.key.propose(release(name));
		await dc.key.commit(proposal, [
			await dc.key.sign(proposal, dc.seat),
			await kd.key.sign(proposal, kd.seat)
		]);
	}

	const p = await peer(t, bootstrap);
	const key = new ReleaseKey(p.store, p.swarm, { key: dc.key.key });
	t.teardown(() => key.close(), { order: -1 });

	const latest = await key.follow();
	t.is(latest.name, '1.1.0');
	t.is(key.length, 2);
	t.is((await key.get(0)).name, '1.0.0');
	t.is(key.quorum, 2);
	t.alike(key.signers, dc.key.signers);
});

test('following a core that is not a release key fails', async function (t) {
	const { bootstrap } = await createTestnet(3, { teardown: t.teardown });
	const writer = await peer(t, bootstrap);
	const core = writer.store.get({ name: 'not-releases' });
	await core.append(b4a.from('hello'));
	writer.swarm.join(core.discoveryKey);
	await writer.swarm.flush();

	const p = await peer(t, bootstrap);
	const key = new ReleaseKey(p.store, p.swarm, { key: core.key });
	t.teardown(() => key.close(), { order: -1 });

	await t.exception(key.follow());
});

test('a response is verified against its proposal offline', async function (t) {
	const { dc, kd } = await create(t);

	const proposal = await dc.key.propose(release('1.0.0'));
	const other = await dc.key.propose(release('1.0.1'));
	const response = await kd.key.sign(proposal, kd.seat);

	t.ok(b4a.equals(ReleaseKey.verify(proposal, response), kd.seat.publicKey));
	t.exception(() => ReleaseKey.verify(other, response), /another proposal/);

	const forged = z32.decode(response);
	forged[forged.byteLength - 1] ^= 1;
	t.exception(() => ReleaseKey.verify(proposal, z32.encode(forged)), /signature is invalid/);
});

test('a 1 of 1 key rotates to a 2 of 3 key', async function (t) {
	const seat = crypto.keyPair();
	const old = await create(t, [seat], { quorum: 1 });
	await publish(old.dc.key, '1.0.0', [seat]);

	const seats = [seat, crypto.keyPair(), crypto.keyPair()];
	const next = await create(t, seats, { net: old.net });

	const rotate = await old.dc.key.proposeRotate(next.dc.key.key);
	const { record } = await old.dc.key.inspect(rotate);
	t.is(record.type, ROTATE);
	t.is(record.previous, 1);
	t.ok(b4a.equals(record.to, next.dc.key.key));

	t.is(await old.dc.key.commit(rotate, [await old.dc.key.sign(rotate, seat)]), 2);
	t.ok(b4a.equals(await old.dc.key.rotatedTo(), next.dc.key.key));
	t.is((await old.dc.key.get(0)).name, '1.0.0');

	const p = await next.kd.key.propose(release('2.0.0'));
	t.is(
		await next.kd.key.commit(p, [
			await next.kd.key.sign(p, seats[1]),
			await next.am.key.sign(p, seats[2])
		]),
		1
	);
});

test('an empty key rotates', async function (t) {
	const seat = crypto.keyPair();
	const old = await create(t, [seat], { quorum: 1 });
	const to = crypto.randomBytes(32);

	const rotate = await old.dc.key.proposeRotate(to);
	t.is(await old.dc.key.commit(rotate, [await old.dc.key.sign(rotate, seat)]), 1);
	t.ok(b4a.equals(await old.dc.key.rotatedTo(), to));
});

test('a rotated key takes no more releases', async function (t) {
	const { dc, kd } = await create(t);

	const stale = await dc.key.propose(release('1.0.0'));
	const staleResponses = [await dc.key.sign(stale, dc.seat), await kd.key.sign(stale, kd.seat)];

	const rotate = await kd.key.proposeRotate(crypto.randomBytes(32));
	await kd.key.commit(rotate, [
		await dc.key.sign(rotate, dc.seat),
		await kd.key.sign(rotate, kd.seat)
	]);
	await dc.key.core.update({ wait: true });

	await t.exception(dc.key.propose(release('1.1.0')), /rotated/);
	await t.exception(dc.key.proposeRotate(crypto.randomBytes(32)), /rotated/);
	await t.exception(dc.key.inspect(stale), /rotated/);
	await t.exception(dc.key.commit(stale, staleResponses), /rotated/);
	t.is(dc.key.length, 1);
});

test('inspect refuses a rotation that names the wrong previous entry', async function (t) {
	const { dc, kd } = await create(t);

	// What a misbehaving proposer could stage: the record claims entry #5.
	const bad = await dc.key._propose({ type: ROTATE, previous: 5, to: crypto.randomBytes(32) });
	await t.exception(kd.key.inspect(bad), /does not follow the latest release/);
	await t.exception(kd.key.sign(bad, kd.seat), /does not follow the latest release/);

	const self = await dc.key.proposeRotate(dc.key.key);
	await t.exception(kd.key.inspect(self), /same key/);
});

test('a follower walks to the key a release key rotated to', async function (t) {
	const old = await create(t);
	await publish(old.dc.key, '1.0.0', [old.dc.seat, old.kd.seat], old.kd.key);

	const f = await peer(t, old.bootstrap);
	const followed = new ReleaseKey(f.store, f.swarm, { key: old.dc.key.key });
	t.teardown(() => followed.close(), { order: -1 });
	t.is((await followed.follow()).name, '1.0.0');
	t.is(await followed.rotatedTo(), null);

	const seats = [crypto.keyPair(), crypto.keyPair()];
	const next = await create(t, seats, { net: old.net });
	const rotate = await old.dc.key.proposeRotate(next.dc.key.key);
	await old.dc.key.commit(rotate, [
		await old.dc.key.sign(rotate, old.dc.seat),
		await old.kd.key.sign(rotate, old.kd.seat)
	]);
	await publish(next.dc.key, '2.0.0', seats, next.kd.key);

	while (followed.length < 2) await followed.core.update({ wait: true });
	const to = await followed.rotatedTo();
	t.ok(b4a.equals(to, next.dc.key.key));

	const successor = new ReleaseKey(f.store, f.swarm, { key: to });
	t.teardown(() => successor.close(), { order: -1 });
	t.is((await successor.follow()).name, '2.0.0');
	t.is(successor.quorum, 2);
	t.alike(successor.signers, next.dc.key.signers);
});

test('a pear multisig key signs next to a gear seat', async function (t) {
	const pear = await generateKeys(password('hunter2'));
	const { dc, kd } = await create(t, [crypto.keyPair(), { publicKey: pear.publicKey }]);

	const proposal = await dc.key.propose(release('1.0.0'));

	// What `pear multisig sign <request>` does with the request it is shown.
	const request = z32.decode(ReleaseKey.request(proposal));
	const response = z32.encode(await sign(request, pear.secretKey, password('hunter2')));

	t.ok(b4a.equals(ReleaseKey.verify(proposal, response), pear.publicKey));
	t.is(await kd.key.commit(proposal, [await dc.key.sign(proposal, dc.seat), response]), 1);
	t.is((await dc.key.get(0)).name, '1.0.0');
});

async function create(
	t,
	seats = [crypto.keyPair(), crypto.keyPair(), crypto.keyPair()],
	{ quorum = 2, net = null } = {}
) {
	const { bootstrap, blind } = net ?? (await network(t));

	const opts = {
		signers: seats.map((s) => s.publicKey),
		namespace: 'gip-transport/stable',
		quorum,
		blind
	};

	const [dc, kd = dc, am = kd] = await Promise.all(
		seats.map(async (seat) => {
			const p = await peer(t, bootstrap);
			const key = new ReleaseKey(p.store, p.swarm, opts);
			await key.ready();
			t.teardown(() => key.close(), { order: -1 });
			return { key, seat };
		})
	);

	t.ok(b4a.equals(dc.key.key, am.key.key));
	return { dc, kd, am, bootstrap, net: { bootstrap, blind } };
}

// A testnet with two seeders standing in for blind peers.
async function network(t) {
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
	return { bootstrap, blind };
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

// A password in secure memory, the way the pear CLI hands it over.
function password(text) {
	const pwd = sodium.sodium_malloc(b4a.byteLength(text));
	b4a.write(pwd, text);
	return pwd;
}

// Proposes and commits a release, signed by `seats` in order.
async function publish(key, name, seats, other = key) {
	const proposal = await key.propose(release(name));
	const responses = [];
	for (const [i, seat] of seats.entries()) {
		responses.push(await (i === 0 ? key : other).sign(proposal, seat));
	}
	return key.commit(proposal, responses);
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
