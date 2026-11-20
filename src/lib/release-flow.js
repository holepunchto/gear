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
