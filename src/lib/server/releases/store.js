import ReadyResource from 'ready-resource';
import Hyperbee from 'hyperbee2';
import c from 'compact-encoding';
import b4a from 'b4a';

const SEAT = 'gear/release-signer/v1';
const NAMESPACE = 'gear/releases/v1';

/**
 * @typedef {{
 *   key: string, name: string, namespace: string, signers: string[], quorum: number,
 *   repo: { name: string, key: string } | null, owner: boolean, follower?: boolean,
 *   labels: Record<string, string>, added: number
 * }} KeyRecord
 * @typedef {{
 *   name: string, tag: string, commit: string, tree: string,
 *   repo: { key: string, length: number }
 * }} Release
 * @typedef {{
 *   key: string, id: string, proposal: string, previous: number, mine: boolean,
 *   added: number, release: Release | null
 * }} ProposalRecord
 * @typedef {{ signer: string, response: string }} ResponseRecord
 */

export default class ReleaseStore extends ReadyResource {
	/** @param {any} store the root corestore */
	constructor(store) {
		super();
		this.store = store;
		this.bee = new Hyperbee(store.namespace(NAMESPACE));
	}

	async _open() {
		await this.bee.ready();
	}

	async _close() {
		await this.bee.close();
	}

	/** @returns {Promise<{ publicKey: Uint8Array, secretKey: Uint8Array }>} */
	async seat() {
		await this.ready();
		return this.store.createKeyPair(SEAT);
	}

	/** @param {string} key @returns {Promise<KeyRecord | null>} */
	getKey(key) {
		return this._get('key/' + key);
	}

	/** @returns {Promise<KeyRecord[]>} */
	listKeys() {
		return this._list('key/');
	}

	/** @param {KeyRecord} record */
	putKey(record) {
		return this._put('key/' + record.key, record);
	}

	/** @param {string} key @param {string} id @returns {Promise<ProposalRecord | null>} */
	getProposal(key, id) {
		return this._get('proposal/' + key + '/' + id);
	}

	/** @param {string} [key] @returns {Promise<ProposalRecord[]>} */
	listProposals(key) {
		return this._list(key ? 'proposal/' + key + '/' : 'proposal/');
	}

	/** @param {ProposalRecord} record */
	putProposal(record) {
		return this._put('proposal/' + record.key + '/' + record.id, record);
	}

	/** @param {string} key @param {string} id */
	async deleteProposal(key, id) {
		const responses = await this.listResponses(key, id);
		const w = this.bee.write();
		w.tryDelete(b4a.from('proposal/' + key + '/' + id));
		for (const { signer } of responses) {
			w.tryDelete(b4a.from('response/' + key + '/' + id + '/' + signer));
		}
		await w.flush();
	}

	/** @param {string} key @param {string} id @returns {Promise<ResponseRecord[]>} */
	listResponses(key, id) {
		return this._list('response/' + key + '/' + id + '/');
	}

	/** @param {string} key @param {string} id @param {ResponseRecord} record */
	putResponse(key, id, record) {
		return this._put('response/' + key + '/' + id + '/' + record.signer, record);
	}

	/** @param {string} path @returns {Promise<any>} */
	async _get(path) {
		await this.ready();
		const node = await this.bee.get(b4a.from(path));
		return node ? c.decode(c.json, node.value) : null;
	}

	/** @param {string} prefix ending in '/' @returns {Promise<any[]>} */
	async _list(prefix) {
		await this.ready();
		const range = { gte: b4a.from(prefix), lt: b4a.from(prefix.slice(0, -1) + '0') };
		const out = [];
		for await (const node of this.bee.createReadStream(range)) {
			out.push(c.decode(c.json, node.value));
		}
		return out;
	}

	/** @param {string} path @param {unknown} value */
	async _put(path, value) {
		await this.ready();
		const w = this.bee.write();
		w.tryPut(b4a.from(path), c.encode(c.json, value));
		await w.flush();
	}
}
