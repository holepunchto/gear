// @ts-nocheck
import ReadyResource from 'ready-resource';
import HyperMultisig from 'hyper-multisig';
import SignRequest from 'hypercore-signing-request';
import crypto from 'hypercore-crypto';
import c from 'compact-encoding';
import b4a from 'b4a';
import z32 from 'z32';
import { Proposal } from './messages.js';
import { repoAt, rootAt, tagAt, firstLength, sameTag } from './repo.js';

// hyper-multisig joins the source and target topics itself on every request
// and commit and never leaves them. The key joins what it needs and drops it
// after, so the multisig gets a swarm that does nothing.
const QUIET = { join() {}, leave() {} };

export default class ReleaseKey extends ReadyResource {
	constructor(
		store,
		swarm,
		{ key = null, signers = [], namespace = null, quorum = 0, blind = null, timeout = 10000 }
	) {
		super();
		this.store = store;
		this.swarm = swarm;
		this.followKey = key;
		this.signers = signers.map((key) => z32.encode(key));
		this.namespace = namespace;
		this.quorum = quorum;
		this.blind = blind;
		this.timeout = timeout;
		this.multisig = new HyperMultisig(store, QUIET);
		this.core = null;
		this.discovery = null;
	}

	/** @param {string} proposal */
	static describe(proposal) {
		const { source, namespace, request } = c.decode(Proposal, z32.decode(proposal));
		const { key, length, manifest } = SignRequest.decode(request);
		/** @type {{ publicKey: Uint8Array, namespace: Uint8Array }[]} */
		const seats = manifest.signers;
		const hashed = crypto.hash(b4a.from(namespace));
		if (!seats.every((s) => b4a.equals(s.namespace, hashed))) {
			throw new Error('Proposal namespace does not match its key');
		}
		return {
			id: z32.encode(crypto.hash(request)),
			key,
			source,
			namespace,
			length,
			quorum: manifest.quorum,
			signers: seats.map((s) => s.publicKey)
		};
	}

	/**
	 * The raw signing request inside a proposal, z32. It is what
	 * `pear multisig sign` takes.
	 * @param {string} proposal
	 */
	static request(proposal) {
		return z32.encode(c.decode(Proposal, z32.decode(proposal)).request);
	}

	/** @param {string} proposal @param {string} response */
	static verify(proposal, response) {
		const { request } = c.decode(Proposal, z32.decode(proposal));
		const res = SignRequest.decodeResponse(z32.decode(response));
		if (!b4a.equals(res.requestHash, crypto.hash(request))) {
			throw new Error('Response is for another proposal');
		}

		/** @type {{ signable: Uint8Array }[]} */
		const signables = SignRequest.signable(res.publicKey, SignRequest.decode(request));
		const valid =
			signables.length === res.signatures.length &&
			signables.every((s, i) => crypto.verify(s.signable, res.signatures[i], res.publicKey));
		if (!valid) throw new Error('Response signature is invalid');

		return res.publicKey;
	}

	get key() {
		return this.core.key;
	}

	get length() {
		return this.core.length;
	}

	async _open() {
		if (this.followKey) {
			this.core = this.store.get({ key: this.followKey });
			await this.core.ready();
		} else {
			const { core } = await this.multisig.createCore(this.signers, this.namespace, {
				quorum: this.quorum
			});
			this.core = core;
			this.quorum = core.manifest.quorum;
		}
		this.discovery = this.swarm.join(this.core.discoveryKey);
		// A key opened to follow is only mirrored once follow() has checked it.
		if (this.blind && this.core.manifest) this.blind.addCore(this.core);
	}

	async _close() {
		await this.discovery.destroy();
		await this.core.close();
	}

	/**
	 * Opened by key alone: learns the signers and quorum from the manifest,
	 * which arrives with the first block, and reads the signed repo. Throws
	 * when no peer serves the key in time, or it isn't a multisig core holding
	 * a gip repo. A timeout of 0 waits for the first block however long it
	 * takes.
	 */
	async follow({ timeout = this.timeout } = {}) {
		await this.ready();
		await this.core.get(0, { timeout });
		const manifest = this.core.manifest;
		if (!manifest || manifest.signers.length === 0) throw new Error('Not a release key');

		await this.core.update();
		const repo = await this.repo().catch(() => null);
		if (!repo || (!repo.head && repo.tags.length === 0)) throw new Error('Not a release key');

		this.signers = manifest.signers.map((s) => z32.encode(s.publicKey));
		this.quorum = manifest.quorum;
		if (this.blind) this.blind.addCore(this.core);
		return repo;
	}

	/** The signed repo: HEAD and every tag at the key's length. */
	async repo() {
		await this.ready();
		return repoAt(this.store, this.core.key, this.core.length, { timeout: this.timeout });
	}

	/**
	 * Proposes signing the repo up to where `tag` first appears in it. The
	 * repo core is the source: the release core mirrors its blocks.
	 * @param {Uint8Array} repoKey
	 * @param {string} tag
	 */
	async propose(repoKey, tag) {
		await this.ready();
		await this.core.update();

		const source = await this._source(repoKey);
		try {
			const base = this.core.length;
			const end = source.core.length;
			if (base > end) throw new Error('Release key is ahead of the repo');
			await this._extends(source.core, base);

			const now = await tagAt(this.store, repoKey, end, tag, { timeout: this.timeout });
			if (!now) throw new Error(`No tag ${tag} in the repo`);
			if (await tagAt(this.store, repoKey, base, tag, { timeout: this.timeout })) {
				throw new Error(`${tag} is already signed on this key`);
			}

			const length = await firstLength(this.store, repoKey, tag, base, end, {
				timeout: this.timeout
			});
			const first = await tagAt(this.store, repoKey, length, tag, { timeout: this.timeout });
			if (!sameTag(first, now)) throw new Error(`${tag} was moved since it was first pushed`);

			const { request } = await this.multisig
				.requestCore(this.signers, this.namespace, source.core, length, {
					quorum: this.quorum,
					peerUpdateTimeout: this.timeout
				})
				.done();

			return z32.encode(
				c.encode(Proposal, { source: repoKey, request, namespace: this.namespace })
			);
		} finally {
			await source.close();
		}
	}

	/**
	 * Replicates the repo to the proposed length and checks it: the request's
	 * tree hash is the repo's there, the repo extends what this key already
	 * signed, and it adds at least one tag (`tag`, when given) without moving
	 * any the key already holds. Returns the tags it adds.
	 */
	async inspect(proposal, { tag = null } = {}) {
		await this.ready();
		const { source: repoKey, request } = c.decode(Proposal, z32.decode(proposal));
		const req = SignRequest.decode(request);

		if (!b4a.equals(req.key, this.core.key)) throw new Error('Proposal is for another release key');
		if (req.fork !== this.core.fork) throw new Error('Proposal is on another fork');

		await this.core.update();
		const base = this.core.length;
		if (req.length <= base) {
			throw new Error(`Proposal signs the repo at ${req.length}, release key is at ${base}`);
		}

		const source = await this._source(repoKey);
		try {
			await source.core.get(req.length - 1, { timeout: this.timeout });
			if (!b4a.equals(await source.core.treeHash(req.length), req.treeHash)) {
				throw new Error('Proposal does not match the repo');
			}
			const opts = { timeout: this.timeout };
			if ((await rootAt(this.store, repoKey, req.length, opts)) !== req.length) {
				throw new Error('Proposal ends in the middle of a repo write');
			}
			await this._extends(source.core, base);

			const [before, after] = await Promise.all([
				repoAt(this.store, repoKey, base, opts),
				repoAt(this.store, repoKey, req.length, opts)
			]);
			const signed = new Map(before.tags.map((t) => [t.name, t]));
			for (const t of after.tags) {
				const old = signed.get(t.name);
				if (old && !sameTag(old, t)) throw new Error(`Proposal moves the signed tag ${t.name}`);
			}
			const tags = after.tags.filter((t) => !signed.has(t.name));
			if (tag !== null && !tags.some((t) => t.name === tag)) {
				throw new Error(`No new tag ${tag} in the repo at ${req.length}`);
			}
			if (tags.length === 0) throw new Error('Proposal adds no tag');

			return { repo: repoKey, length: req.length, base, tags, head: after.head, request: req };
		} finally {
			await source.close();
		}
	}

	async sign(proposal, keyPair, opts) {
		const { request } = await this.inspect(proposal, opts);
		const encoded = c.decode(Proposal, z32.decode(proposal)).request;

		const signatures = SignRequest.signable(keyPair.publicKey, request).map(({ signable }) =>
			crypto.sign(signable, keyPair.secretKey)
		);

		return z32.encode(
			SignRequest.encodeResponse({
				version: request.version,
				requestHash: crypto.hash(encoded),
				publicKey: keyPair.publicKey,
				signatures
			})
		);
	}

	/**
	 * Mirrors the repo into the release core up to the proposed length with
	 * the assembled signature. Waits for two full copies of the result, with
	 * no bound of its own.
	 */
	async commit(proposal, responses) {
		await this.ready();
		await this.core.update();
		const { source: repoKey, request } = c.decode(Proposal, z32.decode(proposal));
		const { length } = SignRequest.decode(request);
		if (length <= this.core.length) {
			throw new Error(
				`Proposal signs the repo at ${length}, release key is at ${this.core.length}`
			);
		}

		const source = await this._source(repoKey);
		try {
			await this.multisig
				.commitCore(this.signers, this.namespace, source.core, z32.encode(request), responses, {
					quorum: this.quorum,
					skipTargetChecks: this.core.length === 0,
					peerUpdateTimeout: this.timeout
				})
				.done();
			return this.core.length;
		} finally {
			await source.close();
		}
	}

	// The release core only ever extends the repo: up to its length, the
	// repo's tree hash must be its own.
	async _extends(repo, length) {
		if (length === 0) return;
		await repo.get(length - 1, { timeout: this.timeout });
		if (!b4a.equals(await repo.treeHash(length), await this.core.treeHash(length))) {
			throw new Error('The repo was rewritten since this key last signed it');
		}
	}

	// A session on the repo core, looked up on the swarm while it is open.
	async _source(key) {
		const core = this.store.get({ key });
		await core.ready();
		const found = core.findingPeers();
		const discovery = this.swarm.join(core.discoveryKey, { server: false, client: true });
		discovery
			.flushed()
			.then(() => this.swarm.flush())
			.then(found, found);
		if (!core.writable) await within(core.update({ wait: true }), this.timeout);
		return {
			core,
			async close() {
				await discovery.destroy();
				await core.close();
			}
		};
	}
}

// Settles when `promise` does or after `ms`, whichever comes first.
async function within(promise, ms) {
	let timer;
	const timeout = new Promise((resolve) => (timer = setTimeout(resolve, ms)));
	try {
		await Promise.race([promise, timeout]);
	} finally {
		clearTimeout(timer);
	}
}
