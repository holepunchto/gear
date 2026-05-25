# Gear

A P2P Git repository manager built on [Pear](https://pears.com) / [Holepunch](https://holepunch.to). Browse, clone, and publish Git repositories over the Hypercore protocol — no central server required.

![Gear running on macOS and Android](demo.png)

## Features

- **Browse repositories** — file tree, commits, branches, and tags served directly from Hypercore drives
- **P2P sync** — repositories replicate peer-to-peer via Hyperswarm; peer count shown live
- **Distributed search** — full-text search across the DHT network using two hypersearch indexes: prefix matching on repo names and TF-IDF ranked search across name, description, and readme content
- **Add by URL** — paste a `git+pear://` URL to start syncing any public repository instantly
- **Create repositories** — publish a new repo directly to the network
- **Blind peers** — stays reachable behind NAT without a public IP
- **Mobile** — runs natively on Android via the Bare runtime

## Stack

| Layer | Technology |
|---|---|
| UI | SvelteKit 2 + Svelte 5 + Tailwind CSS 4 |
| Runtime | [Bare](https://github.com/holepunchto/bare) (macOS + Android) |
| P2P transport | gip-transport, Hyperswarm, HyperDB |
| Search | hypersearch over Hyperswarm DHT |
| Bundler | bare-build + sveltekit-adapter-bare |

## Development

```sh
npm install
npm run dev
```

The dev server runs in Node.js mode. The Pear stack (gip-transport, Hyperswarm) boots as a singleton on first request and stays alive for the session.

## Building

**1. Compile the SvelteKit app:**

```sh
npm run build
```

**2. Package for your target platform:**

```sh
# macOS (Apple Silicon)
npm run make:darwin-arm64

# Android (arm64)
npm run make:android-arm64
```

Output bundles land in `out/`. The bare-build step resolves all native addons (sodium-native, utp-native, etc.) using `bare-module-resolve`, so the bundle is self-contained.

## Search

Gear queries two hypersearch indexes hosted on the DHT:

- **Name index** — prefix search on repo names; powers the autocomplete ghost text and provides instant results for known repo names
- **Full index** — TF-IDF ranked search over name, description, and readme content; results are scored and ranked server-side

Results from both indexes are merged and deduplicated by hex key. Cards populate progressively: name and URL appear immediately, description and readme snippets fill in as the Pear DHT resolves each peer.
