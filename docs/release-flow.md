# Release flow

Releases live in the repo, the way tags do. You never leave the repo to release a version or to look
at one.

## The Releases tab

`/<repo>/releases` is a list, like the Tags tab.

- One row per signed release, newest first: the version, its seal ("1 of 1 signed", glowing for a
  multisig key), the tag, the short commit and the date. The repo's current release says Latest.
- Releases in progress are apricot rows at the top, each with one status line: "step 3 of 5 ·
  waiting on Kasper".
- Above the list, one quiet line per key: "Release key `name` · M of N · Key settings →". With more
  than one key, each row names its key.

## New release

A **New release** button, top right, opens a section on the tab, with Cancel, like New tag.

- Pick a tag newer than the last release (older ones are folded away), or tag a branch on a repo you
  own.
- Then **Propose**, or **Sign & release `<tag>`** on a key where you are the only signer needed. A
  seat held by a pear key asks for its password.
- With no release key yet, the section first sets one up: its name, which key you sign as, who
  signs and how many must agree. Then it goes on to the tag.
- Proposing opens the release's page. If your signature fails, a wrong password say, the release is
  kept and its page opens on the Sign step with the error.

While one of your releases is in progress on a key, there is no New release for it; its row is the
way back in. The key page's button opens New release on the tab.

## A release's page

`/<repo>/releases/<tag>`, under the repo's header and tabs with Releases active, and a "← Releases"
link at the top.

- **Signed:** how to install it, Browse files at the tag, the changes since the previous release,
  what was signed and by whom, and links to the releases either side.
- **In progress:** its steps, one open at a time: Version, Sign, Signatures (only when the quorum
  needs someone else), Publish, Done. The Signatures step holds what to send each co-signer and a
  box for what they send back. Publish runs on its own when the last signature lands, unless
  "Publish when signed" is unticked. Withdraw is in the menu.

At most one release per key and tag is in progress. When two keys of a repo have the same tag,
`?key=` picks one.

`/releases/<key>/<id>` and `/releases/<key>/tag/<tag>` redirect here when the repo is in your
library. Without it, for a follower or a co-signer who hasn't added the repo, they still show the
release on its own.

## Elsewhere

Everywhere else a release in progress is the same one line, linking to its page: "`0.1.1` · step 3
of 5 · waiting on Kasper". On a co-signer's device it says the proposer collects the signatures. The
Clone menu holds the latest release's install commands and the key's share link.

The key page, `/releases/<key>`, is for the key itself: its signers, sharing and following,
rotating, archiving and revoking, and its history. `/releases` is the inbox for proposals sent to
you and the directory of keys.

## Auto-publish

"Publish when signed" is ticked by default and stored with the release on this device. Whichever
device holds the last signature publishes. Opening a page never starts a publish. A revoked key never
publishes. While a publish runs the release can't be withdrawn, and its status says "publishing"
only on the device running it.
