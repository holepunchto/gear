// @ts-nocheck
import c from 'compact-encoding';

// What a proposer hands to co-signers: the signing request, the repo core it
// signs (the request only holds its length, fork and tree hash) and the
// namespace, which the manifest only holds a hash of.
const VERSION = 2;

export const Proposal = {
	preencode(state, p) {
		c.uint.preencode(state, VERSION);
		c.fixed32.preencode(state, p.source);
		c.buffer.preencode(state, p.request);
		c.string.preencode(state, p.namespace);
	},
	encode(state, p) {
		c.uint.encode(state, VERSION);
		c.fixed32.encode(state, p.source);
		c.buffer.encode(state, p.request);
		c.string.encode(state, p.namespace);
	},
	decode(state) {
		const version = c.uint.decode(state);
		if (version !== VERSION) throw new Error('Unknown proposal version: ' + version);
		return {
			source: c.fixed32.decode(state),
			request: c.buffer.decode(state),
			namespace: c.string.decode(state)
		};
	}
};
