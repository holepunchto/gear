# Release keys

A release key is a multisig mirror of a repo's own gip core. Its blocks are the
repo core's blocks up to the last length M of N named signers agreed on. Anyone
holding the key can read it, and it is a gip repo: `git clone git+pear://<release
key>/<repo>` gets the repo as signed. Nobody, the owner included, can extend it
alone.

Because the release key is just a signed copy of the repo, tools that take a
`git+pear://` link work with it unchanged. Swap the repo key for the release
key and `git clone`, `npm install git+file://pear/…`, `pear install
git+pear://…` and pear-repo-updater all read the signed state.

## Built on

`hyper-multisig` (2.5.0) is what `pear multisig` uses. It is a thin layer over
`hypercore/lib/multisig`. `createCore` makes the key, `requestCore(repoCore,
length)` makes a signing request for the repo at a length, and `commitCore`
copies the repo's blocks into the release core with the assembled signature.

## Model

```
repo core (writable, the owner's)           release core (multisig, read-only)
  0 ……… 41  v1.8.0 first appears at 41        0 ……… 41   ← quorum-signed
 42 ……… 77  v1.9.0 first appears at 77       42 ……… 77   ← quorum-signed
 78 ……… 90  unreleased commits                (not signed)
```

- **Key.** `Hypercore.key(manifest)`. The manifest is the signer public keys, a
  namespace (`gear/releases/<name>`) and the quorum, so the key follows from
  those alone.
- **Propose a release of tag T.** Find the repo length L where T first appears.
  Tags only accumulate, so this bisects, like pear-repo-updater: about 11 reads
  for 4000 blocks, capped at 64 probes. Only lengths that end a write can be
  read (a write that spans several blocks keeps its tree in the last one, and
  each block says how many of its write follow it), so every probe reads the
  end of the write its length falls in, and L always ends one. Then
  `requestCore(repoCore, L)`. The
  proposal is a z32 envelope `{ source: repo core key, request, namespace }`.
  The repo core is the source, so there are no staging cores.
- **Inspect and sign.** A signer replicates the repo core to L and checks:
  - the request's tree hash is the repo's at L, and L ends a write;
  - the release key's current length L0 is below L, and the repo's tree hash
    at L0 is the release core's (it extends, never rewrites);
  - the repo at L adds at least one tag over L0 (T, when the caller names it),
    and moves none the key already holds.

  `inspect` returns the tags it adds with their commits and trees, and the
  signer signs `signable(myPub, request)` with their seat.

- **Commit.** Anyone holding a quorum of responses calls `commitCore`. It
  passes `skipTargetChecks` only while the release core is empty.
- **Read.** Open the release core as a gip repo at its length (gip-remote's
  schema over hyperbee2, as the clone does). The latest release is the newest
  tag present, by semver, then by tag time. Every tag present is signed. A
  key that released several times shows every tag in it as covered; Gear
  doesn't invent per-release boundaries it can't read from the core.

A proposal is stale once the release key reaches its length: `inspect`,
`sign` and `commit` all refuse it ("release key is at N"). Two proposals for
different tags don't conflict as long as neither has been overtaken: a
release of v1.9.0 at 77 can commit after v1.8.0 at 41 did, and copies
blocks 42 to 77.

## Decisions

1. **Signers and quorum never change for a key.** Changing them changes the
   key. See [Rotation](#rotation-and-revocation).
2. **A seat is one device keypair**, derived from the corestore
   (`store.createKeyPair('gear/release-signer/v1')`), or a `pear multisig`
   key (below).
3. **Any signer can propose.** The source is the repo core everyone can read.
4. **Seeding is required.** hyper-multisig's checks stay on: request and
   commit need 2 peers with full copies of the repo core, and a commit to a
   non-empty release core needs 2 full copies of it, then waits for 2 full
   copies of the result. The hp-relay blind peers already mirror repos, and
   Gear adds every release core it opens to blind peering.
5. **Transport.** Proposals and responses are short z32 strings moved by
   paste.

## Where the code lives

`src/lib/server/releases/`, a plain-JS module that imports nothing from Gear:
it takes a corestore and a swarm, and returns plain data. `repo.js` reads a
gip repo core at a length (tags, HEAD, and the bisection). Tests use brittle
and run under `bare`.

## API

`src/lib/server/releases/index.js`. One instance per release key.

```js
const key = new ReleaseKey(store, swarm, { signers, namespace, quorum, blind });
await key.ready(); // key.key, key.length

const followed = new ReleaseKey(store, swarm, { key: releaseKey, blind });
await followed.follow(); // → { head, tags }; signers and quorum from the manifest

const proposal = await key.propose(repoKey, 'v1.9.0'); // z32 { source, request, namespace }
ReleaseKey.describe(proposal); // → { id, key, source, signers, quorum, namespace, length }
ReleaseKey.verify(proposal, response); // → signer public key, or throws
await key.inspect(proposal, { tag }); // → { length, base, tags, head, request }
const response = await key.sign(proposal, seatKeyPair, { tag }); // inspects first, always
await key.commit(proposal, responses); // → new length
await key.repo(); // → { head, tags } at the key's length
```

The signing request holds the repo length, fork, tree hash and target
manifest but not the source core's key, so the envelope carries it. The
manifest holds only a hash of the namespace, so the envelope carries that too,
and `describe` refuses a namespace that doesn't hash to it. A proposal's id is
the hash of its request.

Reads of remote bytes are bounded: every block read has the key's timeout, a
repo with more than 10,000 tags is refused, and the bisection stops at 64
probes.

Tests: `npm test` runs `src/lib/server/releases/test.js` under Bare against a
hyperdht testnet with two seeders standing in for blind peers, with the real
seeding checks on. It covers a 2-of-3 mirror release, a second release
extending the first, a stale proposal, a tag missing at the proposed length, a
request whose tree hash doesn't match its source, a commit below quorum,
opening the release core as a gip-remote `Remote` and reading its tags and
HEAD, following by key alone, and pear multisig keys.

## Local store

`src/lib/server/releases/store.js` keeps what this device knows: the keys it
owns, signs for or follows, pending proposals, and the responses collected for
them, on a hyperbee in its own corestore namespace (`gear/releases/v1`). That
core is never announced or mirrored. It also derives the seat key.

Archiving, retiring and revoking are entries of their own (`archived/<key>`,
`retired/<key>`, `revoked/<key>`) next to the key record, so writing back a record read earlier
can't undo them.

Keys made before release keys were mirrors held custom release records. They
aren't opened any more: Gear lists them as "old release format" with Archive
only.

## Sharing and following

A release key is public. Gear shares it as a clone link:

```
git+pear://<release key>/<repo>
```

"Follow a release key" takes that link or a bare key. Following opens the core
by key, waits for its first block (which carries the manifest, so the follower
learns the signers and quorum) and reads it as a gip repo. A core that isn't
multisig, or whose content isn't a gip repo, is refused.

## Installing a release

The repo's Clone menu and a release page give the release key's commands:

```
git clone git+pear://<release key>/<repo>
git clone git+pear://0.<length>.<release key>/<repo>
npm install git+file://pear/0.<length>.<release key>/<repo>#<tag>
pear install git+pear://<release key>/<repo>       # repos with make and release scripts
```

npm can't parse `git+pear://` (`EUNSUPPORTEDPROTOCOL`). With `git=git+pear`
and `allow-git=all` in the project's `.npmrc`, npm runs gip's `git+pear`
executable instead of `git`, which maps `file://pear/` back to `git+pear://`.

## Rotation and revocation

Rotating is for when the old key or its signers can't be trusted any more: a
lost or compromised seat, people leaving. So the old key is thrown away, not
handed over.

- **Rotate to new signers…** creates a new key with the chosen signers and
  quorum. It starts empty: its first release is a normal proposal, which the
  new signers inspect and sign themselves. The form defaults to the newest tag.
  Gear doesn't sign the old key's length on the new key's behalf.
- **The old key is revoked on this device.** A revoked key shows "Revoked:
  don't trust" and is never used for badges, the Clone menu, Discover or the
  latest release, and can't propose or sign. Its history stays viewable behind
  the warning. Revoking is one-way. Archive stays a separate, neutral "hide
  it".
- **Followers aren't told.** Revocation is local: without a signed pointer,
  Gear can't tell other devices. The rotate flow ends with "share the new key
  with anyone using the old one" and the link. A followed key has "Mark as
  revoked", for when someone tells you it's no longer trusted.
- **Installed apps** follow `upgrade` in their package.json, and so does
  pear-repo-updater for `git+pear://` apps. When the repo is an app (it has an
  `upgrade` field, or `make` and `release` scripts), the rotate flow says
  so: to move installed copies, release one more version on the old key with
  `"upgrade": "git+pear://<new release key>/<repo>"`, and it notes when
  package.json already points at the old key. For that last release the old
  key is retired rather than revoked: it can still propose and sign, it stays
  in the badges and the Clone menu until the new key has a release, so the
  install and its last release don't vanish mid-rotation, and its page has
  "Revoke now" for when the release is out.
- **A compromised key** can't be trusted with that path, since whoever holds
  it could sign their own redirect. The rotate form asks whether the old key
  is compromised; if so, the old key is revoked at once, and the flow says to
  ship a new install or share the new key directly instead. A repo that isn't
  an app has no reason to release on the old key, so its old key is revoked
  at once too.

A possible follow-up is a signed pointer inside the repo, so followers can
find the new key without being told.

## pear multisig keys

A seat can be a `pear multisig` key. Both are z32 ed25519 public keys, so
`pear multisig keys get <name>` prints a key that pastes straight into the
signer list.

That signer signs with the CLI: `pear multisig sign <request> <name>` takes the
raw signing request inside a Gear proposal (`ReleaseKey.request(proposal)`).
The response is the same `SignRequest.encodeResponse` that `ReleaseKey.sign`
makes, so "Paste a signature" takes it.

Gear hands out its own signatures as `gear:<response>`, so a pasted one teaches
the proposer that the seat signs in Gear. A pear CLI response comes unmarked. A
pending proposal's send area has a copy for Gear co-signers (the proposal) and
one for the pear CLI (the full `pear multisig sign <request> <name>` command).
The CLI signs whatever request it is shown without inspecting the repo, so a
pear signer should inspect the proposal in Gear first.

### Signing as a pear key

On desktop Gear can sign with a pear key itself. It lists `~/.pear/*.public`
(`GEAR_PEAR_DIR` points elsewhere) and key setup asks "You sign as": this
device's Gear key or one of those pear keys. Proposing and signing then ask for
the key's password, inspect the proposal, read `~/.pear/<name>` and sign with
hypercore-sign-lib. The password reaches the local server only in the loopback
form post and is never stored or logged.

## Risks to check on Bare

- `hyper-multisig/lib/core.js` calls the global `Buffer.from`. Bare 1.37 has
  the global and the tests pass there. Not yet checked on the device runtime
  (bare-ndk, Bare 1.29.4).
- `hyper-multisig` and `hypercore-signing-request` load `hyperdrive` at the
  top, so it is in the dependency tree. Check the Android adapter bundles it.
- A release core duplicates the repo's blocks up to its length on every
  device and blind peer that holds both.
