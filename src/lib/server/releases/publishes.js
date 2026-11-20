// Publishes running on this device, and the last failure of each, by id.
// A publish counts as running until its commit settles, however long that
// takes, so a second start joins it instead of committing again. Neither
// outlives the app.
export default class Publishes {
	/** @param {(id: string) => void} [onchange] called when one starts or settles */
	constructor(onchange = () => {}) {
		/** @type {Map<string, Promise<unknown>>} */
		this.running = new Map();
		/** @type {Map<string, string>} */
		this.failed = new Map();
		this.onchange = onchange;
	}

	/** @param {string} id */
	state(id) {
		return { publishing: this.running.has(id), error: this.failed.get(id) ?? null };
	}

	/**
	 * Runs `publish` for `id`, or joins the one running. A failure is kept,
	 * as `message(err)`, until the next start.
	 * @template T
	 * @param {string} id
	 * @param {() => Promise<T>} publish
	 * @param {(err: unknown) => string} message
	 * @returns {Promise<T>}
	 */
	start(id, publish, message) {
		const joined = this.running.get(id);
		if (joined) return /** @type {Promise<T>} */ (joined);
		this.failed.delete(id);
		const running = publish()
			.catch((err) => {
				this.failed.set(id, message(err));
				throw err;
			})
			.finally(() => {
				this.running.delete(id);
				this.onchange(id);
			});
		this.running.set(id, running);
		this.onchange(id);
		return running;
	}
}
