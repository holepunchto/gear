import { CommitParser } from 'conventional-commits-parser';

/**
 * Normalised parsed-commit shape we pass through SSR loaders to the UI.
 * Matches what `<CommitMessage>` expects — keep them in sync.
 *
 * `type === null` means the message wasn't a conventional commit; the UI
 * falls back to rendering the raw header verbatim. We always carry the
 * original `header` so a malformed/unparseable message still surfaces.
 */
export type ParsedCommit = {
	type: string | null;
	scope: string | null;
	subject: string;
	header: string;
	body: string | null;
	footer: string | null;
	notes: { title: string; text: string }[];
	mentions: string[];
	references: { action: string | null; owner: string | null; repository: string | null; issue: string | null; raw: string; prefix: string | null }[];
	hasBreaking: boolean;
	raw: string;
};

const parser = new CommitParser();

// Match `type(scope)!:` style breaking-change indicators on the header line.
// The parser surfaces footer-style "BREAKING CHANGE: …" notes already, but
// the bang form is widespread (and shorter) and we want to flag it too.
const BANG_RE = /^([a-zA-Z][\w-]*)(\([^)]+\))?!:/;

export function parseCommitMessage(raw: string): ParsedCommit {
	const safe = raw ?? '';

	// Strip the bang before passing to the parser — otherwise it can confuse
	// the type extraction in some versions. We track the bang separately.
	const bangBreaking = BANG_RE.test(safe);
	const stripped = bangBreaking ? safe.replace('!:', ':') : safe;

	const p = parser.parse(stripped) as {
		header?: string | null;
		body?: string | null;
		footer?: string | null;
		notes?: { title: string; text: string }[];
		mentions?: string[];
		references?: ParsedCommit['references'];
		type?: string | null;
		scope?: string | null;
		subject?: string | null;
	};

	const noteBreaking = (p.notes ?? []).some((n) => /^BREAKING[ -]CHANGE/i.test(n.title));

	// Header may be empty for some empty messages; first line of raw is the
	// reliable fallback.
	const firstLine = safe.split('\n', 1)[0] ?? '';
	const header = (p.header && p.header.trim()) || firstLine.trim();

	return {
		type: p.type ?? null,
		scope: p.scope ?? null,
		// `subject` is the post-prefix part on a conventional header. For
		// non-conventional commits it's null — we substitute the whole header
		// so consumers can always render *something*.
		subject: (p.subject && p.subject.trim()) || header,
		header,
		body: p.body && p.body.trim() ? p.body.trim() : null,
		footer: p.footer && p.footer.trim() ? p.footer.trim() : null,
		notes: p.notes ?? [],
		mentions: p.mentions ?? [],
		references: p.references ?? [],
		hasBreaking: bangBreaking || noteBreaking,
		raw: safe
	};
}
