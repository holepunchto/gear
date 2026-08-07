import type { RequestHandler } from './$types';
import { events, type RepoStats } from '$lib/server/events';

// Live global stats stream — peer count, DHT nodes, AND per-repo updates
// for every known repo. Backed by a shared EventHub: the hub wires to swarm
// events ONCE at boot and we just subscribe here. No per-connection polling,
// no timers other than the heartbeat that keeps the SSE connection alive
// through proxies.
//
// Why repo updates ride the global stream: the home page wants to live-
// update every row (block counts, peer counts) without opening one SSE
// connection per repo (browsers cap HTTP/1.1 to ~6 per host). One global
// stream → all repo events fan out from a single hub listener.

export const GET: RequestHandler = async ({ locals }) => {
	// Attach every known repo so the hub starts emitting 'repo' events for
	// them. Idempotent — repeated calls are no-ops once a core is wired.
	await events.attachAll(locals.db);

	const encoder = new TextEncoder();
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	let onStats: (() => void) | null = null;
	let onRepo: ((payload: { name: string } & RepoStats) => void) | null = null;
	let onSources: (() => void) | null = null;

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

			// Immediate snapshot so the UI doesn't sit on stale SSR data.
			send('stats', events.getStats());

			// Subscribe — hub fires 'stats' on every relevant swarm event
			// (connection open/close).
			onStats = () => send('stats', events.getStats());
			events.on('stats', onStats);

			// Repo updates fan out here too. Payload: { name, length, peers }.
			onRepo = (payload) => send('repo', payload);
			events.on('repo', onRepo);

			// The discover manifest changed (an OTA config block arrived) —
			// clients re-run their loads to pick it up.
			onSources = () => send('sources', {});
			events.on('sources', onSources);

			// Heartbeat — keeps intermediaries from closing the idle connection.
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
			if (onStats) events.off('stats', onStats);
			if (onRepo) events.off('repo', onRepo);
			if (onSources) events.off('sources', onSources);
			if (heartbeat) clearInterval(heartbeat);
			onStats = null;
			onRepo = null;
			onSources = null;
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
