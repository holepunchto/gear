import ReadyResource from 'ready-resource';
import HyperMultisig from 'hyper-multisig';
import SignRequest from 'hypercore-signing-request';
import crypto from 'hypercore-crypto';
import c from 'compact-encoding';
import b4a from 'b4a';
import z32 from 'z32';
import { Record, Proposal, RELEASE } from './messages.js';

export default class ReleaseKey extends ReadyResource {
	constructor(store, swarm, { signers, namespace, quorum, blind = null, timeout = 10000 }) {
		super();
		this.store = store;
		this.swarm = swarm;
		this.signers = signers.map((key) => z32.encode(key));
		this.namespace = namespace;
		this.quorum = quorum;
		this.blind = blind;
		this.timeout = timeout;
		this.multisig = new HyperMultisig(store, swarm);
		this.core = null;
	}

	get key() {
		return this.core.key;
	}

	get length() {
		return this.core.length;
	}

	async _open() {
		const { core } = await this.multisig.createCore(this.signers, this.namespace, {
			quorum: this.quorum
		});
		this.core = core;
		this.quorum = core.manifest.quorum;
		this.swarm.join(core.discoveryKey);
		if (this.blind) this.blind.addCore(core);
	}

	async _close() {
		this.swarm.leave(this.core.discoveryKey);
		await this.core.close();
	}

	async get(index) {
		await this.ready();
		return c.decode(Record, await this.core.get(index, { timeout: this.timeout }));
	}

	async propose(release) {
		await this.ready();
		await this.core.update();

		const previous = this.core.length;
		const staging = this.store.get({ keyPair: crypto.keyPair() });
		await staging.ready();

		try {
			for (let i = 0; i < previous; i++) {
				await staging.append(await this.core.get(i, { timeout: this.timeout }));
			}
			await staging.append(c.encode(Record, { ...release, type: RELEASE, previous }));

			this.swarm.join(staging.discoveryKey);
			if (this.blind) this.blind.addCore(staging);

			const { request } = await this.multisig
				.requestCore(this.signers, this.namespace, staging, staging.length, {
					quorum: this.quorum,
					peerUpdateTimeout: this.timeout
				})
				.done();

			return z32.encode(c.encode(Proposal, { source: staging.key, request }));
		} finally {
			await staging.close();
		}
	}

	async inspect(proposal) {
		await this.ready();
		const { source, request } = c.decode(Proposal, z32.decode(proposal));
		const req = SignRequest.decode(request);

		if (!b4a.equals(req.key, this.core.key)) throw new Error('Proposal is for another release key');
		if (req.fork !== this.core.fork) throw new Error('Proposal is on another fork');

		await this.core.update();
		const previous = this.core.length;
		if (req.length !== previous + 1) {
			throw new Error(`Proposal appends at ${req.length - 1}, release key is at ${previous}`);
		}

		const staging = this.store.get({ key: source });
		await staging.ready();
		this.swarm.join(staging.discoveryKey, { server: false, client: true });

		try {
			const last = await staging.get(req.length - 1, { timeout: this.timeout });
			if (!b4a.equals(await staging.treeHash(req.length), req.treeHash)) {
				throw new Error('Proposal does not match its source');
			}
			if (previous > 0) {
				await staging.get(previous - 1, { timeout: this.timeout });
				if (!b4a.equals(await staging.treeHash(previous), await this.core.treeHash(previous))) {
					throw new Error('Proposal rewrites earlier releases');
				}
			}

			const record = c.decode(Record, last);
			if (record.type !== RELEASE || record.previous !== previous) {
				throw new Error('Proposal record does not follow the latest release');
			}
			return { record, request: req };
		} finally {
			this.swarm.leave(staging.discoveryKey);
			await staging.close();
		}
	}

	async sign(proposal, keyPair) {
		const { request } = await this.inspect(proposal);
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

	async commit(proposal, responses) {
		await this.ready();
		const { source, request } = c.decode(Proposal, z32.decode(proposal));
		const staging = this.store.get({ key: source });
		await staging.ready();

		try {
			const { length } = SignRequest.decode(request);
			const record = c.decode(Record, await staging.get(length - 1, { timeout: this.timeout }));

			await this.multisig
				.commitCore(this.signers, this.namespace, staging, z32.encode(request), responses, {
					quorum: this.quorum,
					skipTargetChecks: record.previous === 0,
					peerUpdateTimeout: this.timeout
				})
				.done();

			return this.core.length;
		} finally {
			this.swarm.leave(staging.discoveryKey);
			await staging.close();
		}
	}
}
