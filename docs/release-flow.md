# Release flow

Releasing a version is a flow of steps on its own page, not a set of panels on the repo's Releases
tab. Today the tab shows everything at once: share links before anything is signed, "send this to
your co-signers" on a key you sign alone, a paste box and a Commit button that nothing asks for.

## The page

`/releases/<key>/<id>`, the proposal page, becomes the flow. A release can take days while
co-signers sign, so it has a URL to come back to. One step is open at a time. Done steps collapse to
a tick and a line saying what happened. Later steps are greyed out.

1. **Version.** The tag, its commit and what changed since the last release. Picking or making the
   tag happens before the page exists (step 0 below), so this step is always done here.
2. **Sign.** You sign, with your Gear key or your pear key (its password inline). Done already when
   proposing signed for you.
3. **Signatures.** Only when the quorum needs someone else. One row per signer: signed, or waiting.
   A waiting row holds what to send that signer (the Gear proposal, or the pear CLI request for a
   pear signer, both labelled) and a box to paste what they send back. No generic "send to
   co-signers" block.
4. **Publish.** Commits the release once enough have signed and waits for the blind peers to hold
   it ("seeded to 2 peers"). It runs on its own as soon as the last signature lands, unless
   "Publish when signed" is unticked; then the step is a Publish button.
5. **Done.** The release, with its git clone, npm install and share link. This is the only place
   links for the release appear.

Withdraw is a secondary action in a menu on the page, not a button beside Publish.

## Step 0: starting a release

The repo's Releases tab and the key page have one action, **Release a new version**. It picks a tag
(or tags a branch) and proposes it, then goes to the flow page.

On a key where you are the only signer needed (quorum 1 and you hold a seat), the action is **Sign &
release `<tag>`**: propose, sign and publish in one go, landing on the flow page at step 5. A pear
key asks for its password first.

## The Releases tab

A summary, not the flow:

- The key, compact.
- The latest signed release with its links. Before the first release there are no links: "Share
  links appear after your first release."
- A release in progress as one card: "`0.1.1` · step 3 of 5 · waiting on Kasper", linking to the
  flow page.
- Otherwise **Release a new version**.
- Move away from this key, collapsed, at the bottom.

The key page follows the same rules: no share links before the first release.

## Auto-publish

"Publish when signed" is a checkbox on the flow page, ticked by default, stored with the proposal on
this device. When ticked, whichever device holds the last signature publishes: the proposer when a
response is pasted, or when Gear starts with the signatures already there. Opening a page never
starts a publish. A co-signer who isn't the proposer only publishes if they hold enough signatures
themselves. A revoked key never publishes.

A publish runs until its commit settles, however long the blind peers take; the release is recorded
as published as soon as it is appended here. While one runs, the release can't be withdrawn and a
second Publish joins it. Everywhere else the status says "publishing" only while a publish runs on
this device, "publishing failed" after one failed, and "ready to publish" otherwise.
