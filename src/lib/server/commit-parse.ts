import { CommitParser } from 'conventional-commits-parser';
import { emojify } from 'node-emoji';

/**
 * Normalised parsed-commit shape we pass through SSR loaders to the UI.
 * Matches what `<CommitMessage>` and `<CommitBody>` expect — keep in sync.
 *
 * `type === null` means the message wasn't a conventional commit; the UI
 * falls back to rendering the raw header verbatim. We always carry the
 * original `header` so a malformed/unparseable message still surfaces.
 *
 * The parser also extracts body/footer/notes/references/mentions, but we
 * deliberately don't ship them — pills mined from footers duplicated the
 * text right next to them (three `@anthropic` badges from Co-Authored-By
 * emails). `body` is simply everything after the header, verbatim.
 */
export type ParsedCommit = {
	type: string | null;
	scope: string | null;
	subject: string;
	header: string;
	body: string | null;
	hasBreaking: boolean;
	raw: string;
};

const parser = new CommitParser();

// Match `type(scope)!:` style breaking-change indicators on the header line.
// The parser surfaces footer-style "BREAKING CHANGE: …" notes already, but
// the bang form is widespread (and shorter) and we want to flag it too.
const BANG_RE = /^([a-zA-Z][\w-]*)(\([^)]+\))?!:/;

export function parseCommitMessage(raw: string): ParsedCommit {
	// Render :rocket:-style shortcodes up front so every surface (subject,
	// body, tooltips) gets real emoji.
	const safe = emojify(raw ?? '');

	// Strip the bang before passing to the parser — otherwise it can confuse
	// the type extraction in some versions. We track the bang separately.
	const bangBreaking = BANG_RE.test(safe);
	const stripped = bangBreaking ? safe.replace('!:', ':') : safe;

	const p = parser.parse(stripped) as {
		header?: string | null;
		notes?: { title: string; text: string }[];
		type?: string | null;
		scope?: string | null;
		subject?: string | null;
	};

	const noteBreaking = (p.notes ?? []).some((n) => /^BREAKING[ -]CHANGE/i.test(n.title));

	// Header may be empty for some empty messages; first line of raw is the
	// reliable fallback.
	const [firstLine, ...restLines] = safe.split('\n');
	const header = (p.header && p.header.trim()) || (firstLine ?? '').trim();
	const body = restLines.join('\n').trim();

	return {
		type: p.type ?? null,
		scope: p.scope ?? null,
		// `subject` is the post-prefix part on a conventional header. For
		// non-conventional commits it's null — we substitute the whole header
		// so consumers can always render *something*.
		subject: (p.subject && p.subject.trim()) || header,
		header,
		body: body || null,
		hasBreaking: bangBreaking || noteBreaking,
		raw: safe
	};
}
