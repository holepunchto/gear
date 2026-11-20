# Release keys

A release key is a hypercore that only M of N named signers can append to. Each
entry is one release: a tag, the commit it points at, and the repo key and length
it was cut from. Anyone holding the key can read and verify the releases. Nobody,
the owner included, can append alone.

Tags stay the stand-in until this ships.

## Built on

`hyper-multisig` (2.5.0) is what `pear multisig` uses. It is a thin layer over
`hypercore/lib/multisig`, which gear already has (hypercore 11.35.1).

A spike proved the full loop in Node: a 2-of-3 key, two releases signed by two
signers each, a reader replicating and verifying with only the key, and a commit
under quorum rejected (`Insufficient quorum: 0 / 2`).

## Model

```
proposer's staging core (writable, plain)        release core (multisig, read-only)
  #0 release 1.8.0                                  #0 release 1.8.0   ← quorum-signed
  #1 release 1.8.1                                  #1 release 1.8.1   ← quorum-signed
  #2 release 1.9.0   ── request(length 3) ──►       (waits for signatures)
```

- **Key.** `Hypercore.key(manifest)`. The manifest is the signer public keys, a
  namespace and the quorum, so the key follows from those alone.
- **Propose.** The proposer appends a release record to their staging core and
  makes a signing request for the new length. A request is about 240 bytes and
  holds the staging core's key, length and tree hash.
- **Sign.** A signer decodes the request and replicates the staging core to that
  length. They check that the tree hash matches, read and check the record (the
  commit exists in the repo at that length, the artifact hash matches), then sign
  `signable(myPub, request)` with their seat key. The response is about 100 bytes.
- **Commit.** Anyone holding a quorum of responses copies the new staging entries
  into the release core along with the assembled signature. The committer does
  not have to be a signer.
- **Read.** Any peer opens the release key, and the hypercore verifies the
  multisig on replication. The latest release is the last entry, and the release
  count is the core's length.

### Release record

```
{ version: 1,
  name: '1.9.0',
  tag: 'v1.9.0',
  commit: <sha1>,
  tree: <sha1>,
  repo: { key, length },          // gip repo core it was cut from
  artifacts: [{ name, sha256 }],  // optional
  previous: <release core length at proposal> }
```

`previous` pins each release to the history before it. A signer who sees a
`previous` that doesn't match the release core's length knows a proposal skipped
or raced another one.

## Decisions

1. **Signers and quorum never change for a key.** Changing them changes the key.
   Rotating means making a new key and appending a final
   `{ type: ROTATE, previous, to: <newKey> }` entry to the old one, signed by the
   old quorum. Readers follow the pointer. See [Rotation](#rotation).
2. **A seat is one device keypair.** Gear derives it from its corestore
   (`store.createKeyPair('gear/release-signer/v1')`), so no password key file is
   involved. Adding a second device of your own adds a seat, so do it when the
   key is created.
3. **Any signer can propose.** A staging core is valid as long as its prefix
   matches the release core's tree hash. A new proposer, or one who has lost
   their device, starts a staging core by copying the release core and then
   appending. This is the same recovery path pear documents for a lost
   provision drive.
4. **Seeding is required.** By default, request and commit each need at least 2
   peers holding full copies of the staging and release cores, and the commit
   waits for 2 full copies of the result. Gear mirrors both cores to its blind
   peers before proposing. `force` is only for tests.
5. **Transport.** Requests and responses are short z32 strings. v1 moves them
   by paste or QR code. v2 moves them through the mailbox: a request goes to
   each signer's mailbox, and responses go back to the proposer's.

## Where the code lives

Release keys are not git data, so they don't belong in `gip-remote` (the repo
database) or `gip-transport` (the git remote helper).

- **Now:** a plain-JS module in gear, `src/lib/server/releases/`. It imports
  nothing from gear: it takes a corestore and a swarm, and returns plain data.
  Tests use brittle and run under `bare`.
- **Later:** move it unchanged into a `gip-releases` package once the CLI needs
  it (`git pear release propose|sign|commit`).

## API

`src/lib/server/releases/index.js`. One instance per release key.

```js
const key = new ReleaseKey(store, swarm, { signers, namespace, quorum, blind });
await key.ready(); // key.key, key.length

const followed = new ReleaseKey(store, swarm, { key: releaseKey, blind });
await followed.follow(); // → latest release record; signers and quorum from the manifest

const proposal = await key.propose(release); // z32 envelope { source, request, namespace }
ReleaseKey.describe(proposal); // → { key, source, signers, quorum, namespace, length }
ReleaseKey.verify(proposal, response); // → signer public key, or throws
const { record } = await key.inspect(proposal); // replicates the source and checks it
const response = await key.sign(proposal, seatKeyPair); // inspects first, always
await key.commit(proposal, responses); // → new length
await key.get(index); // → release record, or { type: ROTATE, previous, to }

const rotation = await key.proposeRotate(newKey); // same sign and commit flow
await key.rotatedTo(); // → the new key once the rotation is in, else null
```

A signing request does not carry the source core's key: it holds only the
length, fork, tree hash and the target manifest. So a proposal is an envelope
around `{ source, request, namespace }`.

The manifest names the signers and the quorum but holds only a hash of the
namespace, so the envelope carries the namespace too. A signer who has never
seen the key opens it from `ReleaseKey.describe(proposal)`, which refuses a
namespace that doesn't hash to the one in the manifest.

`ReleaseKey.verify` checks a pasted response without the network: it was made
over this proposal's request, by a declared signer, and its signatures hold.

Each proposal gets a fresh staging core with a random keypair. Truncating a
staging core would bump its fork and invalidate signatures, so a staging core is
never rewritten. To withdraw a proposal, drop its envelope. Two proposals racing
the same release are both valid, the first to commit wins, and the other then
fails `inspect` ("appends at N, release key is at N+1").

Tests: `npm test` runs `src/lib/server/releases/test.js` under Bare against a
hyperdht testnet with two seeders standing in for blind peers. It covers a
2-of-3 release, a second release from another proposer, a commit below quorum, a
stale proposal, a non-signer, and rotation: a 1-of-1 key rotating to a 2-of-3,
an empty key rotating, a rotated key refusing more entries, a rotation with the
wrong `previous`, and a follower walking to the new key. The same file passes under `brittle-node`.

### Not done yet

- Mailbox transport for proposals and responses.
- Checking a release record against the repo (does the commit exist at
  `repo.length`?). That belongs in gear, on top of `inspect`.
- `inspect` joins and then leaves the staging topic without ref-counting, so a
  proposer that signs its own proposal stops announcing its staging core. The
  blind peers still serve it.

## Local store

`src/lib/server/releases/store.js` keeps what this device knows: the keys it
owns or signs for, pending proposals, and the responses collected for them. It
is a hyperbee on its own corestore namespace (`gear/releases/v1`). That core is
never announced or mirrored, so it stays on this device. It also derives the
seat key, `store.createKeyPair('gear/release-signer/v1')`. When the private
profile exists, the records move there behind the same methods; the seat stays
per device.

### Archiving

Archiving a key is local and reversible. The store keeps it as its own entry
(`archived/<key>`) next to the key record, so writing back a record read
earlier can't undo it, and reads report it as `archived`. An archived key is
left out of `activeKeys()`, which is what a repo's Releases tab, the badges and
Your releases read from; it is listed under Archived on Release keys with
Unarchive. Proposing from it is refused. Gear keeps it open and seeded, so
co-signers and followers lose nothing, and a pending proposal on it can still
be signed and committed. Nothing is ever deleted.

## Sharing and following

A release key is public: anyone holding it can read and verify its releases.
Gear shares one as the repo's clone link with the key added:

```
git+pear://0.<length>.<repo key>/<repo>?release=<z32 release key>
```

The link is pinned to the repo length the latest release was cut from, so it
still clones: gip's helper reads only `?storage=` from the query and leaves
`?release=` alone. A key with no release yet links the repo unpinned, and one
with no repo is shared as the bare z32 key. "Follow a release key" takes the
link, a bare key, or an older `release+pear://<key>/<name>` link. A follower
found by link goes by the repo's name.

Following opens the core by key alone, `new ReleaseKey(store, swarm, { key })`,
and `follow()` reads the first and the latest release. The manifest arrives
with the first block, so the follower learns the signers and the quorum without
being told; a test checks this against a testnet. A core whose first block
isn't a release record, or that no peer serves within the timeout, is refused.
Gear then keeps the key with the follower role and mirrors it to its blind
peers like any other key. A follower never proposes or signs.

## Installing a release

The repo's Clone button opens with the latest release's commands on top, and
a release page copies them in one click. Both are pinned to the repo length
the release was cut from:

```
npm install git+file://pear/0.<length>.<repo key>/<repo>#<tag>
git clone git+pear://0.<length>.<repo key>/<repo> && cd <repo> && git checkout <tag>
```

npm can't parse `git+pear://` (`EUNSUPPORTEDPROTOCOL`). With `git=git+pear`
and `allow-git=all` in the project's `.npmrc`, npm runs gip's `git+pear`
executable instead of `git`, which maps `file://pear/` back to `git+pear://`.
The length-pinned form installs the same contents every time.

## Rotation

Signers and quorum are fixed for a key, so changing them means a new key. To
rotate, a signer picks the new signers and quorum ("Rotate to new signers…",
prefilled with the key's name and signers). Gear creates the new key, then
proposes a ROTATE entry on the old one: `{ type: ROTATE, previous, to }`. It goes
through the same propose, sign and commit flow as a release: the proposer signs
it if they hold a seat, co-signers paste it in and sign, and anyone holding a
quorum commits it. An empty key can rotate too (`previous: 0`), which gives
anyone it was shared with a signed pointer to the new key.

- **It is the last entry.** Once it is in, `propose`, `proposeRotate`,
  `inspect` and `commit` all refuse ("Release key was rotated"), and Gear
  shows the key as retired, with "Rotated to <name> →" on its page and in its
  release log. Its history stays readable.
- **Stale proposals.** A rotation and a release proposed at the same length
  race like two releases: the first to commit wins and the other fails
  `inspect` because it no longer appends at the end. A release signed before
  the rotation committed can't be committed after it.
- **Replay.** The signatures cover the signing request, which binds the old
  key, the entry's length and the staging tree hash, so a rotation signed for
  one key or one position can't be committed anywhere else. `inspect` also
  checks that `previous` matches the entry's position and that `to` isn't the
  key itself. The codec reads `to` as exactly 32 bytes.
- **What a signer sees.** The sign view says the rotation hands the release log
  over and lists the new key's signers and quorum when this device knows the
  key or can open it. A fresh key with no entries can't be opened by key alone,
  so the view then says so and asks the signer to check the key with the
  proposer.
- **Readers.** A repo's Releases tab, its badges and Your releases follow
  rotations to the newest key this device has, at most 8 hops. A follower that
  sees a ROTATE entry follows the new key too, once its first release arrives
  and it opens as a release key. A signer or owner of the old key who isn't on
  the new one gets a "Follow the new key" button.
- After the rotation commits, the old key offers a one-click Archive.

## pear multisig keys

A seat can be a `pear multisig` key. Both are z32 ed25519 public keys, so
`pear multisig keys get <name>` prints a key that pastes straight into the
signer list.

That signer signs with the CLI. `pear multisig sign <request> <name>` takes the
raw signing request, which is the `request` inside a Gear proposal
(`ReleaseKey.request(proposal)`). It decrypts `~/.pear/<name>` with a password
and signs with hypercore-sign-lib. The response is the same
`SignRequest.encodeResponse` that `ReleaseKey.sign` makes, so "Paste a
signature" takes it, and `verify` and `commit` accept it. A test signs a
proposal with hypercore-sign-lib and commits it in a 2-of-2 key next to a
Gear seat.

Gear keeps the two apart. A pending proposal's send area has a copy "For Gear
co-signers" (the proposal) and one "For the pear CLI" (the full
`pear multisig sign <request> <name>` command, with the key name editable),
because `pear multisig sign` fails with "Invalid signing request" on a
proposal. The pear one is open, naming the signers it may be for, while any
signer still to sign isn't a known Gear seat. A seat is known when it is this
device's or when its signature came from Gear: Gear hands out its signatures
as `gear:<response>`, and a pasted one teaches the proposer that seat is
Gear's. A pear CLI response comes unmarked. Pasting a proposal for a key
your Gear seat isn't on gives you the pear command for it instead of only
refusing.

The CLI signs whatever request it is shown. It doesn't replicate the staging
core or check the record the way `inspect` does, so a pear signer should
inspect the proposal in Gear first, or trust the proposer.

Not done: signing in Gear with a key from `~/.pear`.

## Risks to check on Bare

- `hyper-multisig/lib/core.js` calls the global `Buffer.from`. Bare 1.37 has
  the global and the tests pass there. Not yet checked on the device runtime
  (bare-ndk, Bare 1.29.4).
- `hyper-multisig/index.js` and `hypercore-signing-request` load `hyperdrive`
  at the top, even for core-only use, so it is now in the dependency tree.
  Check that the adapter's import hoisting bundles it for Android.

If either one is a problem, take the core-only path (about 150 lines over
`hypercore/lib/multisig` and `hypercore-signing-request`) into the module
instead of depending on `hyper-multisig`.

## Mockup

The release boards in the Gear Refresh canvas show this flow: Releases (keys),
ReleaseNew (signers, quorum, rotate), ReleaseDetail (collecting signatures) and
PhoneSign (a co-signer checks and signs).
