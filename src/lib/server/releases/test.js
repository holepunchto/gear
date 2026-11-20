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
import { Remote } from 'gip-remote';
import { generateKeys, sign } from 'hypercore-sign-lib';
import fs from 'fs';
import path from 'path';
import ReleaseKey from './index.js';
import { listPearKeys, signWithPearKey } from '../pear-keys.js';
import { Proposal } from './messages.js';
import { rootAt } from './repo.js';

test('2 of 3 signers mirror the repo up to a tag, anyone commits', async function (t) {
	const { dc, kd, am, repo } = await create(t);
	const at = await repo.release('1.0.0');
	await repo.commit('after the tag');

	const proposal = await dc.key.propose(repo.key, 'v1.0.0');
	t.is(ReleaseKey.describe(proposal).length, at, 'signs the length the tag first appears at');

	const inspected = await kd.key.inspect(proposal, { tag: 'v1.0.0' });
	t.alike(
		inspected.tags.map((tag) => tag.name),
		['v1.0.0']
	);
	t.is(inspected.tags[0].commit, repo.tags.get('v1.0.0'));
	t.is(inspected.base, 0);

	const responses = [await dc.key.sign(proposal, dc.seat), await kd.key.sign(proposal, kd.seat)];
	t.is(await am.key.commit(proposal, responses), at);
	t.ok(repo.core.length > at, 'the repo moved on past the release');

	await dc.key.core.update({ wait: true });
	t.is(dc.key.length, at);
	t.ok(b4a.equals(await dc.key.core.treeHash(at), await repo.core.treeHash(at)));
});

test('a second release extends the first', async function (t) {
	const { dc, kd, am, repo } = await create(t);
	const first = await repo.release('1.0.0');
	await publish(dc, 'v1.0.0', [dc, am], repo);

	await repo.commit('more');
	await repo.tag('v1.1.0-rc.1');
	const second = await repo.release('1.1.0');

	await kd.key.core.update({ wait: true });
	const proposal = await kd.key.propose(repo.key, 'v1.1.0');
	const inspected = await am.key.inspect(proposal);
	t.is(inspected.base, first);
	t.is(inspected.length, second);
	t.alike(inspected.tags.map((tag) => tag.name).sort(), ['v1.1.0', 'v1.1.0-rc.1']);

	t.is(
		await kd.key.commit(proposal, [
			await kd.key.sign(proposal, kd.seat),
			await am.key.sign(proposal, am.seat)
		]),
		second
	);

	const signed = await kd.key.repo();
	t.alike(signed.tags.map((tag) => tag.name).sort(), ['v1.0.0', 'v1.1.0', 'v1.1.0-rc.1']);
});

test('a proposal overtaken by a later release is refused', async function (t) {
	const { dc, kd, am, repo } = await create(t);
	await repo.release('1.0.0');
	await repo.commit('more');
	await repo.release('1.1.0');

	const stale = await dc.key.propose(repo.key, 'v1.0.0');
	const staleResponses = [await dc.key.sign(stale, dc.seat), await kd.key.sign(stale, kd.seat)];
	const later = await kd.key.propose(repo.key, 'v1.1.0');
	await kd.key.commit(later, [
		await kd.key.sign(later, kd.seat),
		await am.key.sign(later, am.seat)
	]);

	await am.key.core.update({ wait: true });
	await t.exception(am.key.inspect(stale), /release key is at/);
	await t.exception(am.key.sign(stale, am.seat), /release key is at/);
	await t.exception(dc.key.commit(stale, staleResponses), /release key is at/);
	await t.exception(dc.key.propose(repo.key, 'v1.0.0'), /already signed/);
});

test('inspect refuses a tag the repo lacks at the length, or a foreign tree hash', async function (t) {
	const { dc, kd, repo, owner } = await create(t);
	await repo.release('1.0.0');
	await repo.commit('more');
	await repo.release('1.1.0');

	const proposal = await dc.key.propose(repo.key, 'v1.0.0');
	await t.exception(kd.key.inspect(proposal, { tag: 'v1.1.0' }), /No new tag v1.1.0/);
	await t.exception(kd.key.sign(proposal, kd.seat, { tag: 'v1.1.0' }), /No new tag v1.1.0/);

	// The same request, said to come from another repo that is long enough.
	const other = await gipRepo(t, owner, 'other');
	for (let i = 0; i < 6; i++) await other.release(`0.${i}.0`);
	const envelope = c.decode(Proposal, z32.decode(proposal));
	const swapped = z32.encode(c.encode(Proposal, { ...envelope, source: other.key }));
	await t.exception(kd.key.inspect(swapped), /does not match the repo/);
});

test('a tag first pushed in a write that spans blocks', async function (t) {
	const { dc, kd, repo, owner } = await create(t);
	for (let i = 0; i < 3; i++) await repo.commit('big ' + i, { blob: 256 * 1024 });
	const first = await repo.release('1.0.0');
	for (let i = 3; i < 6; i++) await repo.commit('big ' + i, { blob: 256 * 1024 });
	await repo.commit('tagged', { blob: 256 * 1024 });
	const second = await repo.tag('v1.1.0');
	let inside = 0;
	for (let length = 1; length <= second; length++) {
		if ((await rootAt(owner.store, repo.key, length, { timeout: 1000 })) !== length) inside++;
	}
	t.ok(inside > 0, `${inside} lengths fall inside a write`);

	const proposal = await dc.key.propose(repo.key, 'v1.1.0');
	t.is(ReleaseKey.describe(proposal).length, second);
	t.alike((await kd.key.inspect(proposal)).tags.map((tag) => tag.name).sort(), [
		'v1.0.0',
		'v1.1.0'
	]);
	t.is(ReleaseKey.describe(await dc.key.propose(repo.key, 'v1.0.0')).length, first);
	t.is(
		await dc.key.commit(proposal, [
			await dc.key.sign(proposal, dc.seat),
			await kd.key.sign(proposal, kd.seat)
		]),
		second
	);
});

test('commit below quorum is rejected', async function (t) {
	const { dc, kd, repo } = await create(t);
	await repo.release('1.0.0');

	const proposal = await dc.key.propose(repo.key, 'v1.0.0');
	await t.exception(
		dc.key.commit(proposal, [await kd.key.sign(proposal, kd.seat)]),
		/Insufficient quorum/
	);
	t.is(dc.key.length, 0);
});

test('the release key clones as the repo it signed', async function (t) {
	const { dc, kd, repo, bootstrap } = await create(t);
	await repo.release('1.0.0');
	await repo.commit('two');
	const at = await repo.release('1.1.0');
	await publish(dc, 'v1.1.0', [dc, kd], repo);
	await repo.commit('unreleased');
	await repo.tag('v2.0.0-beta');

	const p = await peer(t, bootstrap);
	const remote = new Remote(p.store.session(), { name: 'signed', key: dc.key.key });
	t.teardown(() => remote.close(), { order: -1 });
	p.swarm.join(remote.discoveryKey, { server: false, client: true });
	await remote.ready();
	await remote.core.update({ wait: true });

	t.is(remote.core.length, at);
	t.is(await remote.getHead(), 'main');
	const refs = await remote.getAllRefs();
	t.alike(refs.find((r) => r.ref === 'refs/heads/main')?.oid, repo.tags.get('v1.1.0'));
	t.alike(
		refs
			.filter((r) => r.ref.startsWith('refs/tags/'))
			.map((r) => r.ref)
			.sort(),
		['refs/tags/v1.0.0', 'refs/tags/v1.1.0']
	);
});

test('a non-signer cannot sign', async function (t) {
	const { dc, kd, repo } = await create(t);
	await repo.release('1.0.0');

	const proposal = await dc.key.propose(repo.key, 'v1.0.0');
	await t.exception(kd.key.sign(proposal, crypto.keyPair()), /not a declared signer/);
});

test('a signer opens the key from the proposal alone', async function (t) {
	const { dc, kd, repo, bootstrap } = await create(t);
	await repo.release('1.0.0');

	const proposal = await dc.key.propose(repo.key, 'v1.0.0');
	const described = ReleaseKey.describe(proposal);
	t.ok(b4a.equals(described.key, dc.key.key));
	t.ok(b4a.equals(described.source, repo.key));
	t.is(described.quorum, 2);
	t.is(described.id.length, 52);

	const envelope = c.decode(Proposal, z32.decode(proposal));
	const renamed = z32.encode(c.encode(Proposal, { ...envelope, namespace: 'gear/other' }));
	t.exception(() => ReleaseKey.describe(renamed), /namespace does not match/);

	const p = await peer(t, bootstrap);
	const key = new ReleaseKey(p.store, p.swarm, described);
	t.teardown(() => key.close(), { order: -1 });

	const response = await key.sign(proposal, kd.seat);
	t.is(
		await dc.key.commit(proposal, [response, await dc.key.sign(proposal, dc.seat)]),
		described.length
	);
});

test('a follower opens the key from the key alone', async function (t) {
	const { dc, kd, repo, bootstrap } = await create(t);
	await repo.release('1.0.0');
	await publish(dc, 'v1.0.0', [dc, kd], repo);

	const p = await peer(t, bootstrap);
	const key = new ReleaseKey(p.store, p.swarm, { key: dc.key.key });
	t.teardown(() => key.close(), { order: -1 });

	const signed = await key.follow();
	t.alike(
		signed.tags.map((tag) => tag.name),
		['v1.0.0']
	);
	t.is(signed.head.branch, 'main');
	t.is(key.quorum, 2);
	t.alike(key.signers, dc.key.signers);
});

test('following a core that is not a release key fails', async function (t) {
	const { bootstrap, owner } = await create(t);

	const plain = owner.store.get({ name: 'not-releases' });
	await plain.append(b4a.from('hello'));
	owner.swarm.join(plain.discoveryKey);
	await owner.swarm.flush();

	const p = await peer(t, bootstrap);
	const key = new ReleaseKey(p.store, p.swarm, { key: plain.key });
	t.teardown(() => key.close(), { order: -1 });
	await t.exception(key.follow(), /Not a release key/);
});

test('a response is verified against its proposal offline', async function (t) {
	const { dc, kd, repo } = await create(t);
	await repo.release('1.0.0');
	await repo.commit('more');
	await repo.release('1.1.0');

	const proposal = await dc.key.propose(repo.key, 'v1.0.0');
	const other = await dc.key.propose(repo.key, 'v1.1.0');
	const response = await kd.key.sign(proposal, kd.seat);

	t.ok(b4a.equals(ReleaseKey.verify(proposal, response), kd.seat.publicKey));
	t.exception(() => ReleaseKey.verify(other, response), /another proposal/);

	const forged = z32.decode(response);
	forged[forged.byteLength - 1] ^= 1;
	t.exception(() => ReleaseKey.verify(proposal, z32.encode(forged)), /signature is invalid/);
});

test('a pear multisig key signs next to a gear seat', async function (t) {
	const pear = await generateKeys(password('hunter2'));
	const { dc, kd, repo } = await create(t, [crypto.keyPair(), { publicKey: pear.publicKey }]);
	const at = await repo.release('1.0.0');

	const proposal = await dc.key.propose(repo.key, 'v1.0.0');

	// What `pear multisig sign <request>` does with the request it is shown.
	const request = z32.decode(ReleaseKey.request(proposal));
	const response = z32.encode(await sign(request, pear.secretKey, password('hunter2')));

	t.ok(b4a.equals(ReleaseKey.verify(proposal, response), pear.publicKey));
	t.is(await kd.key.commit(proposal, [await dc.key.sign(proposal, dc.seat), response]), at);
});

test('a pear key in its directory signs in gear', async function (t) {
	const dir = await t.tmp();
	const pear = await generateKeys(password('hunter2'));
	fs.writeFileSync(path.join(dir, 'gip.public'), pear.publicKey);
	fs.writeFileSync(path.join(dir, 'gip'), pear.secretKey);
	fs.writeFileSync(path.join(dir, 'lonely.public'), crypto.keyPair().publicKey);

	t.alike(await listPearKeys(dir), [{ name: 'gip', key: z32.encode(pear.publicKey) }]);
	t.alike(await listPearKeys(path.join(dir, 'missing')), []);

	const { dc, kd, repo } = await create(t, [crypto.keyPair(), { publicKey: pear.publicKey }]);
	const at = await repo.release('1.0.0');
	const proposal = await dc.key.propose(repo.key, 'v1.0.0');
	const request = z32.decode(ReleaseKey.request(proposal));

	await t.exception(signWithPearKey(dir, 'gip', request, 'wrong'), /decryption failed/);
	const response = z32.encode(await signWithPearKey(dir, 'gip', request, 'hunter2'));

	t.ok(b4a.equals(ReleaseKey.verify(proposal, response), pear.publicKey));
	t.is(await kd.key.commit(proposal, [await dc.key.sign(proposal, dc.seat), response]), at);
});

// A testnet with two seeders standing in for blind peers, a repo owner and a
// peer per seat, each holding the release key.
async function create(t, seats = [crypto.keyPair(), crypto.keyPair(), crypto.keyPair()]) {
	const { bootstrap } = await createTestnet(3, { teardown: t.teardown });

	const seeders = [await peer(t, bootstrap), await peer(t, bootstrap)];
	const blind = {
		copies: [],
		addCore(core) {
			for (const s of seeders) {
				const copy = s.store.get({ key: core.key });
				s.swarm.join(copy.discoveryKey);
				copy.download({ start: 0, end: -1 });
				this.copies.push(copy);
			}
		},
		// Until both seeders hold `core` up to its length.
		async synced(core) {
			for (const copy of this.copies) {
				if (!b4a.equals(copy.key, core.key)) continue;
				while (copy.contiguousLength < core.length) await new Promise((r) => setTimeout(r, 20));
			}
		}
	};

	const owner = { ...(await peer(t, bootstrap)), blind };
	const repo = await gipRepo(t, owner, 'demo');

	const opts = {
		signers: seats.map((s) => s.publicKey),
		namespace: 'gear/releases/demo',
		quorum: 2,
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
	return { dc, kd, am, repo, owner, bootstrap };
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

// A writable gip repo on `owner`, announced and mirrored by the seeders. Its
// commits are fake objects, which gip indexes all the same. `release(v)`
// commits and tags v<v>, and returns the length the tag first appears at.
async function gipRepo(t, owner, name) {
	const remote = new Remote(owner.store.session(), name);
	await remote.ready();
	t.teardown(() => remote.close(), { order: -1 });
	owner.swarm.join(remote.discoveryKey);
	owner.blind.addCore(remote.core);

	const TREE = 'c'.repeat(40);
	const BLOB = 'b'.repeat(40);
	const tree = b4a.concat([b4a.from('100644 README\0'), b4a.from(BLOB, 'hex')]);
	const base = new Map([
		[BLOB, object('blob', b4a.from('hello\n'))],
		[TREE, object('tree', tree)]
	]);
	const tags = new Map();
	let head = null;

	// `blob` adds an incompressible file of that many bytes, so the write
	// spans several blocks.
	async function commit(message, { blob = 0 } = {}) {
		const who = 'Dev <dev@example.com> 1700000000 +0000';
		const objects = new Map(base);
		let tree = TREE;
		if (blob) {
			const bytes = crypto.randomBytes(blob);
			const blobOid = b4a.toString(crypto.hash(bytes), 'hex').slice(0, 40);
			const entries = b4a.concat([b4a.from('100644 big\0'), b4a.from(blobOid, 'hex')]);
			tree = b4a.toString(crypto.hash(entries), 'hex').slice(0, 40);
			objects.set(blobOid, object('blob', bytes));
			objects.set(tree, object('tree', entries));
		}
		const data = b4a.from(
			`tree ${tree}\n${head ? `parent ${head}\n` : ''}author ${who}\ncommitter ${who}\n\n${message}\n`
		);
		const oid = b4a.toString(crypto.hash(data), 'hex').slice(0, 40);
		objects.set(oid, object('commit', data));
		await remote.push('main', oid, objects);
		if (!head) await remote.setHead('main');
		head = oid;
		return oid;
	}

	async function tag(name) {
		await remote.push('tags/' + name, head, new Map());
		tags.set(name, head);
		await owner.blind.synced(remote.core);
		return remote.core.length;
	}

	async function release(version) {
		await commit('release ' + version);
		return tag('v' + version);
	}

	return { key: remote.key, core: remote.core, tags, commit, tag, release };
}

function object(type, data) {
	return { type, size: data.byteLength, data };
}

// A password in secure memory, the way the pear CLI hands it over.
function password(text) {
	const pwd = sodium.sodium_malloc(b4a.byteLength(text));
	b4a.write(pwd, text);
	return pwd;
}

// Proposes and commits a release of `tag`, signed by `signers` in order.
async function publish(proposer, tag, signers, repo) {
	await proposer.key.core.update();
	const proposal = await proposer.key.propose(repo.key, tag);
	const responses = [];
	for (const s of signers) responses.push(await s.key.sign(proposal, s.seat));
	return proposer.key.commit(proposal, responses);
}
