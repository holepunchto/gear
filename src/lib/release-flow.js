// Where a release is in its flow, from what this device knows of it.

/**
 * Publish on its own: "Publish when signed" is ticked, enough signatures are
 * here, the key isn't there yet, and no publish is running or failed. A
 * failed one waits for the user to try again.
 * @param {{
 *   autoPublish?: boolean, publishing?: boolean, error?: string | null,
 *   signed: string[], quorum: number, length: number, keyLength: number
 * }} p
 */
export function shouldPublish(p) {
	if (p.autoPublish === false || p.publishing || p.error) return false;
	return p.signed.length >= p.quorum && p.keyLength < p.length;
}

/**
 * @typedef {'version' | 'sign' | 'signatures' | 'publish' | 'done'} StepId
 * @typedef {'done' | 'open' | 'todo' | 'skipped'} StepState
 */

/**
 * A release's steps and which one is open. Sign is there when this device
 * holds a seat, Signatures when the quorum needs anyone else. One step is
 * open at a time; `current` is its index, or the last step's once published.
 * @param {{
 *   quorum: number, signers: { key: string, me: boolean }[], signed: string[],
 *   length: number, keyLength: number
 * }} p
 * @returns {{ steps: { id: StepId, state: StepState }[], current: number }}
 */
export function flowSteps(p) {
	const seat = p.signers.some((s) => s.me);
	const signedByMe = p.signers.some((s) => s.me && p.signed.includes(s.key));
	const published = p.keyLength >= p.length;
	const enough = published || p.signed.length >= p.quorum;

	/** @type {{ id: StepId, state: StepState }[]} */
	const steps = [{ id: 'version', state: 'done' }];
	if (seat) {
		steps.push({ id: 'sign', state: signedByMe ? 'done' : enough ? 'skipped' : 'open' });
	}
	if (p.quorum > (seat ? 1 : 0)) {
		steps.push({
			id: 'signatures',
			state: enough ? 'done' : seat && !signedByMe ? 'todo' : 'open'
		});
	}
	steps.push({ id: 'publish', state: published ? 'done' : enough ? 'open' : 'todo' });
	steps.push({ id: 'done', state: published ? 'done' : 'todo' });

	const open = steps.findIndex((s) => s.state === 'open');
	return { steps, current: open === -1 ? steps.length - 1 : open };
}
