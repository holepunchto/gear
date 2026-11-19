import c from 'compact-encoding';

export const RELEASE = 0;
export const ROTATE = 1;

const Artifact = {
	preencode(state, a) {
		c.string.preencode(state, a.name);
		c.fixed32.preencode(state, a.sha256);
	},
	encode(state, a) {
		c.string.encode(state, a.name);
		c.fixed32.encode(state, a.sha256);
	},
	decode(state) {
		return { name: c.string.decode(state), sha256: c.fixed32.decode(state) };
	}
};

const Artifacts = c.array(Artifact);

export const Record = {
	preencode(state, r) {
		c.uint.preencode(state, r.type);
		c.uint.preencode(state, r.previous);
		if (r.type === ROTATE) {
			c.fixed32.preencode(state, r.to);
			return;
		}
		c.string.preencode(state, r.name);
		c.string.preencode(state, r.tag);
		c.buffer.preencode(state, r.commit);
		c.buffer.preencode(state, r.tree);
		c.fixed32.preencode(state, r.repo.key);
		c.uint.preencode(state, r.repo.length);
		Artifacts.preencode(state, r.artifacts);
	},
	encode(state, r) {
		c.uint.encode(state, r.type);
		c.uint.encode(state, r.previous);
		if (r.type === ROTATE) {
			c.fixed32.encode(state, r.to);
			return;
		}
		c.string.encode(state, r.name);
		c.string.encode(state, r.tag);
		c.buffer.encode(state, r.commit);
		c.buffer.encode(state, r.tree);
		c.fixed32.encode(state, r.repo.key);
		c.uint.encode(state, r.repo.length);
		Artifacts.encode(state, r.artifacts);
	},
	decode(state) {
		const type = c.uint.decode(state);
		const previous = c.uint.decode(state);
		if (type === ROTATE) return { type, previous, to: c.fixed32.decode(state) };
		if (type !== RELEASE) throw new Error('Unknown release record type: ' + type);
		return {
			type,
			previous,
			name: c.string.decode(state),
			tag: c.string.decode(state),
			commit: c.buffer.decode(state),
			tree: c.buffer.decode(state),
			repo: { key: c.fixed32.decode(state), length: c.uint.decode(state) },
			artifacts: Artifacts.decode(state)
		};
	}
};

export const Proposal = {
	preencode(state, p) {
		c.uint.preencode(state, 1);
		c.fixed32.preencode(state, p.source);
		c.buffer.preencode(state, p.request);
	},
	encode(state, p) {
		c.uint.encode(state, 1);
		c.fixed32.encode(state, p.source);
		c.buffer.encode(state, p.request);
	},
	decode(state) {
		const version = c.uint.decode(state);
		if (version !== 1) throw new Error('Unknown proposal version: ' + version);
		return { source: c.fixed32.decode(state), request: c.buffer.decode(state) };
	}
};
