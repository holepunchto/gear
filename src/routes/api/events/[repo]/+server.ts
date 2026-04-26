import type { RequestHandler } from './$types';
import { events } from '$lib/server/events';

// Per-repo live stats stream. Backed by the shared EventHub — the hub
// lazily attaches core listeners ('append', 'peer-add', 'peer-remove') the
// first time any client subscribes for this repo, then fans them out to
// every SSE client subscribed to the same name. No per-client polling.

export const GET: RequestHandler = async ({ params, locals }) => {
	const name = params.repo;

	// Lazy attach — first subscriber for this repo wires the core listeners.
	await events.ensureRepoAttached(locals.db, name);

	const initial = events.getRepoStats(name);
	if (!initial) {
		return new Response('not found', { status: 404 });
	}

	const encoder = new TextEncoder();
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let onRepo: (() => void) | null = null;
	let onAppend: ((delta: { from: number; to: number; added: number }) => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			let closed = false;
			const send = (event: string, data: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					closed = true;
				}
			};

			// Initial snapshot.
			send('repo', initial);

			// Repo state updates (length + peer count). Fires whenever the
			// underlying core emits append, peer-add or peer-remove.
			onRepo = () => {
				const stats = events.getRepoStats(name);
				if (stats) send('repo', stats);
			};
			events.on(`repo:${name}`, onRepo);

			// Dedicated append events with deltas — handy for UI flashes
			// and "X new commits" toasts.
			onAppend = (delta) => send('append', delta);
			events.on(`append:${name}`, onAppend);

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
			if (onRepo) events.off(`repo:${name}`, onRepo);
			if (onAppend) events.off(`append:${name}`, onAppend);
			if (heartbeat) clearInterval(heartbeat);
			onRepo = null;
			onAppend = null;
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
