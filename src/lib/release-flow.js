// Where a release is in its flow, from what this device knows of it.

/** @param {string} key */
export function shortKey(key) {
	return key.slice(0, 4) + '…' + key.slice(-4);
}

/** @param {{ key: string, label: string | null, me: boolean }} s */
export function signerName(s) {
	return s.label ?? (s.me ? 'You' : shortKey(s.key));
}

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
 * What the publish step says once enough have signed. It only says
 * publishing while a publish runs on this device.
 * @param {{ publishing?: boolean, error?: string | null }} p
 */
export function publishStatus(p) {
	if (p.publishing) return 'publishing';
	return p.error ? 'publishing failed' : 'ready to publish';
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

/**
 * A release in progress as every page but its flow page says it: the step
 * it is at, its number of how many, and what it waits on. A co-signer's
 * proposal collects its signatures on the proposer's device, so a co-signer
 * can't name who is left.
 * @param {{
 *   quorum: number, length: number,
 *   signers: { key: string, label: string | null, me: boolean }[]
 * }} key
 * @param {{
 *   mine: boolean, signed: string[], length: number,
 *   publishing?: boolean, error?: string | null
 * }} p
 */
export function releaseProgress(key, p) {
	const { steps, current } = flowSteps({
		quorum: key.quorum,
		signers: key.signers,
		signed: p.signed,
		length: p.length,
		keyLength: key.length
	});
	const at = steps[current].id;
	return { at, step: current + 1, steps: steps.length, text: waitsOn(at, key, p) };
}

/**
 * @param {StepId} step
 * @param {Parameters<typeof releaseProgress>[0]} key
 * @param {Parameters<typeof releaseProgress>[1]} p
 */
function waitsOn(step, key, p) {
	if (step === 'sign') return 'waiting on your signature';
	if (step === 'publish') return publishStatus(p);
	if (step === 'done') return 'released';
	if (!p.mine) return 'the proposer collects the signatures';
	const waiting = key.signers.filter((s) => !s.me && !p.signed.includes(s.key)).map(signerName);
	const missing = key.quorum - p.signed.length;
	return `waiting on ${missing < waiting.length ? `${missing} of ` : ''}${waiting.join(', ')}`;
}
