# Redesign plan

Bring the Gear Refresh mockup into the app. The canvas is at
https://claude.ai/artifact/G55XcybrSZQWU2a7JyWDzs and its board sources are in
the `project/*.dc.html` files. The work stays in SvelteKit. Whether to go
native is a separate question (see `native-ui-plan.md`), and the tokens and
components carry over either way.

Order: cheap, frontend-only wins first. Anything that needs new data or new
backend work goes last. Each phase is one PR, stacked on the one before.

## Design language (from the mockup)

- **Surfaces:** background `#070b09`; surfaces `#0c1410`, `#0f1813`,
  `#111c17`, `#17241d`. Use depth instead of borders, and hairlines only
  where content needs a grid.
- **Text:** `#e8f1ec`, secondary `#9aaca3`, tertiary `#6f8279`.
- **Mint is light.** Only live things glow: peers, sync, arriving blocks.
  Static UI stays quiet. Apricot is for attention that isn't an error.
- **Type:** Space Grotesk for names and headings, Inter for UI, JetBrains Mono
  only for hashes, URLs and code.
- **Commit chips:** feat is mint, fix is apricot, chore is neutral.
- **Motion:** small and purposeful (block arrive flash, counter tick, slow
  ring), all turned off under `prefers-reduced-motion`.

## Phases

### 1. Tokens and fonts

- Rewrite `src/routes/layout.css` `@theme` with surface and text tokens and a
  glow utility (`shadow-glow`, `text-glow`). Keep the accent, pear and apricot
  scales.
- Self-host woff2 files subset to Latin: Space Grotesk (500, 600), Inter
  (variable or 400/500/600) and JetBrains Mono (400, 500). The app is offline
  and assets are embedded in `build/assets.js`, which is 652K today. Budget
  about 150K for fonts and say what it cost in the PR.
- Add a `prefers-reduced-motion` reset.
- Done when every page still renders and only the colours and type have
  changed.

### 2. App shell

- Header: logo; nav with Library, Discover and Settings; search as a quiet
  field; a peer pill that glows mint when peers > 0; the avatar. Replace the
  black header bar with the background colour plus a hairline.
- Phone width: a bottom nav (Library, Discover, Search, Settings), search moves
  out of the header, and safe-area insets apply so nothing is clipped under the
  bar.
- Reference boards: Main (header) and PhoneRepo (bottom nav).

### 3. Repo hero and tabs

- Hero: the repo name in Space Grotesk, an Owner chip when the repo is
  writable, stats (length, peers, commits), and Fork and Clone buttons. Fork
  keeps today's "create writable copy" behaviour.
- Clone becomes a button with a chevron and an anchored popover: the
  `git clone git+pear://…` line, a Copy action with "Copied" feedback, and
  "Show QR for phone". QR needs a small dependency or a short encoder; justify
  it in the PR, or leave QR out of this phase. Remove the old clone line and
  card.
- Tabs become a segmented control with quiet counts: Files, Commits, Branches,
  Tags. Forks and Releases come later.
- Reference board: Main.

### 4. Live sync visuals

All of this is driven by data the SSE stream already sends: `repo` stats
(length, peers) and `append:<name>` events (from, to, added).

- Replication panel: a 64-cell block strip for the newest blocks of the repo
  core, where cells added by an `append` event flash with the `arrive`
  keyframe.
- Peer constellation: an SVG of nodes driven by the peer count only. We don't
  have per-peer identities, so don't invent them.
- Counters tick when length or peers change.
- Live activity aside: the session's append events ("+3 blocks · just now"),
  kept in client memory only and capped at about 20. Nothing is persisted.
- Reference board: Main (replication panel and Live activity).

### 5. Files, commits, commit detail, branches, tags

- File table: a surface row style, mono only for hashes, and relative times in
  the tertiary text colour.
- Commits list and detail: restyle the commit-type chips (the classes are in
  `CommitMessage.svelte`, the parser in `commit-parse.ts`), group by day, and
  put short hashes in mono.
- Branches and tags (`RefList.svelte`): the same row style.
- Reference boards: Main (files), PhoneCommits.

### 6. Library and Discover

- Library hero ("Your library") with the network panel (global peers and blind
  peers from `GlobalStats`).
- Repo cards: name, length, peers and a sync ring. With today's data the ring
  shows peers and live state only. A true "percent synced" needs a server field
  (`contiguousLength` / `length`), which is a small `+page.server.ts` addition
  that belongs in this phase.
- Discover section on the same page, styled as cards. The release line ("◆
  2.4.0 · 2/3 signed") waits for phase 10. Show "tags only" (the latest tag, if
  any) until then.
- Reference board: Library (leave out the "Your releases" strip for now).

### 7. Phone pass and Settings

- Go through every page at 390px: the bottom nav, no horizontal scroll,
  tap targets of at least 44px, and the repo tabs scrolling horizontally.
- Restyle Settings with the new surfaces; its behaviour is unchanged.
- Reference boards: PhoneRepo, PhoneCommits.

### 8. Polish

- Empty states, loading skeletons for streamed data (the discover manifest),
  focus rings in mint, and hover and press states.
- A quick contrast check on secondary and tertiary text over every surface.

Phases 1–8 are frontend only. The phases below need backend work and product
decisions, so they come after.

### 9. Forks (A: track a fork)

- Server: paste a fork link, then track the fork in a local list; its refs
  replicate in as `forks/<name>/*`; compute ahead and behind against the main
  branch.
- UI: the Forks tab (with a "2 new" badge), tracked forks table, Review page
  with the diff, and merge (fast-forward first).
- Open questions: where the tracked list lives (gip local db or a gear store),
  and how merge works in gip (fast-forward only to start?).
- Reference boards: Forks, ForkReview.
- B (sending a fork to the owner by mailbox) comes later and needs mailbox
  transport (PhoneSendFork).

### 10. Releases

- Wire up `src/lib/server/releases` (see `release-keys.md`): a seat key from
  the corestore, blind peering, and a local list of keys and pending
  proposals.
- Routes and UI: the Releases tab, the Library "Your releases" strip, the
  release keys list, the New key wizard, the Collecting signatures page, the
  phone Sign screen, and Discover release lines.
- Paste or QR transport first; mailbox later.
- Reference boards: Releases, ReleaseNew, ReleaseDetail, PhoneSign.

## Per-PR checks

- `npm run build` passes, and `build/assets.js` size is noted when it changes.
- `npm run check` and `npm run lint` show no new errors. Both baselines are
  already red, so compare against `main`.
- Look at the page in the running app (`npm run dev`) at desktop width and at
  390px, side by side with the reference board.
- Each PR holds one phase and nothing else.
