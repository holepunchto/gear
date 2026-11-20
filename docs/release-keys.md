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
   Rotating means making a new key and appending a final `{ rotatedTo: <newKey> }`
   entry to the old one, signed by the old quorum. Readers follow the pointer.
   The mockup's "require M to change signers" control becomes "Rotate key".
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

const proposal = await key.propose(release); // z32 envelope { source, request, namespace }
ReleaseKey.describe(proposal); // → { key, source, signers, quorum, namespace, length }
ReleaseKey.verify(proposal, response); // → signer public key, or throws
const { record } = await key.inspect(proposal); // replicates the source and checks it
const response = await key.sign(proposal, seatKeyPair); // inspects first, always
await key.commit(proposal, responses); // → new length
await key.get(index); // → release record
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
stale proposal and a non-signer. The same file passes under `brittle-node`.

### Not done yet

- Mailbox transport for proposals and responses.
- Rotation records (`ROTATE` is in the codec; nothing writes it).
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
