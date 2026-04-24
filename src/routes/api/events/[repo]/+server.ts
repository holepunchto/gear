import type { RequestHandler } from './$types';
import { openRepo } from '$lib/server/repo';

// Per-repo live stats stream. Emits whenever the core grows (someone pushed
// commits) or when the peer count changes. We poll peer count on an interval
// because the underlying list can change without a convenient event; length
// updates piggyback on hypercore's 'append'.
const POLL_MS = 2000;

type CoreLike = {
	length: number;
	peers: { length: number };
	on(event: string, listener: () => void): void;
	off(event: string, listener: () => void): void;
};

export const GET: RequestHandler = async ({ params, locals }) => {
	const remote = await openRepo(locals.db, params.repo);
	if (!remote) {
		return new Response('not found', { status: 404 });
	}

	const core = remote.core as CoreLike;
	const encoder = new TextEncoder();

	let lastLength = core.length;
	let lastPeers = core.peers.length;
	let appendListener: (() => void) | null = null;
	let poll: ReturnType<typeof setInterval> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream({
		start(controller) {
			let closed = false;
			const send = (event: string, data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(
						encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
					);
				} catch {
					closed = true;
				}
			};

			const snapshot = () => ({
				length: core.length,
				peers: core.peers.length
			});

			// Initial snapshot.
			send('repo', snapshot());

			// 'append' fires when new blocks land — the most interesting signal
			// ("someone just pushed"). We emit a dedicated 'append' event with
			// the delta so the UI can show something cool like a flash.
			appendListener = () => {
				const from = lastLength;
				lastLength = core.length;
				send('append', { from, to: lastLength, added: lastLength - from });
				send('repo', snapshot());
			};
			core.on('append', appendListener);

			// Poll for peer count changes. Only emit when it actually moved so
			// we don't spam the wire.
			poll = setInterval(() => {
				const peers = core.peers.length;
				if (peers !== lastPeers || core.length !== lastLength) {
					lastPeers = peers;
					lastLength = core.length;
					send('repo', snapshot());
				}
			}, POLL_MS);

			heartbeat = setInterval(() => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`: ping\n\n`));
				} catch {
					closed = true;
				}
			}, 30_000);
		},
		cancel() {
			if (appendListener) core.off('append', appendListener);
			if (poll) clearInterval(poll);
			if (heartbeat) clearInterval(heartbeat);
			appendListener = null;
			poll = null;
			heartbeat = null;
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
