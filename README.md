# Gear

A P2P Git repository manager built on [Pear](https://pears.com) / [Holepunch](https://holepunch.to). Browse, clone, and publish Git repositories over the Hypercore protocol — no central server required.

![Gear running on macOS and Android](demo.png)

## Features

- **Browse repositories** — file tree, commits, branches, and tags served directly from Hypercore drives
- **P2P sync** — repositories replicate peer-to-peer via Hyperswarm; peer count shown live
- **Discover** — a curated list of available repositories, shipped OTA over bundlebee so it can be updated without a new build
- **Add by URL** — paste a `git+pear://` URL to start syncing any public repository instantly
- **Create repositories** — publish a new repo directly to the network
- **Blind peers** — stays reachable behind NAT without a public IP
- **Mobile** — runs natively on Android via the Bare runtime

## Stack

| Layer         | Technology                                                    |
| ------------- | ------------------------------------------------------------- |
| UI            | SvelteKit 2 + Svelte 5 + Tailwind CSS 4                       |
| Runtime       | [Bare](https://github.com/holepunchto/bare) (macOS + Android) |
| P2P transport | gip-transport, Hyperswarm, HyperDB                            |
| OTA           | bundlebee-import                                              |
| Bundler       | bare-build + sveltekit-adapter-bare                           |

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

## Discover

The list of available repositories is a fixed manifest, not a network query. In
dev it's read from `ota/index.js` on disk; in production it's imported over
bundlebee from a `bundle+pear://` link, so publishing a new manifest updates
every client without shipping a build.

Each source carries its own blind-peer keys, which are passed to `addRemote` so
a freshly added repo can replicate even when its author is offline. The loader
streams the manifest, so the local repo list paints first and Discover fills in
once the import resolves.

To change what's on offer, edit `ota/index.js` and republish it with bundlebee,
then update the link in `src/lib/server/source.ts`.
