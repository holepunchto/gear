import type { RequestHandler } from './$types';
import { events, type RepoStats } from '$lib/server/events';
import { getUpdateState, getBuildLog, type UpdateState } from '$lib/server/pear';

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
	let onRelease: ((payload: { key: string }) => void) | null = null;
	let onUpdate: ((state: UpdateState) => void) | null = null;
	let onBuildLog: ((lines: string[]) => void) | null = null;

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

			// A release key changed: a new entry, proposal or signature.
			onRelease = (payload) => send('release', payload);
			events.on('release', onRelease);
			// App update progress. Snapshot first so a page opened mid-download
			// doesn't show "idle" until the next progress tick.
			send('update', getUpdateState());
			onUpdate = (state) => send('update', state);
			events.on('update', onUpdate);

			// What the rebuild is saying, line by line. `reset` marks the snapshot
			// so a page that opens mid-build replaces its list rather than
			// appending a second copy of everything it already had from SSR.
			send('build-log', { reset: true, lines: getBuildLog() });
			onBuildLog = (lines) => send('build-log', { lines });
			events.on('build-log', onBuildLog);

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
			if (onRelease) events.off('release', onRelease);
			if (onUpdate) events.off('update', onUpdate);
			if (onBuildLog) events.off('build-log', onBuildLog);
			if (heartbeat) clearInterval(heartbeat);
			onStats = null;
			onRepo = null;
			onSources = null;
			onRelease = null;
			onUpdate = null;
			onBuildLog = null;
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
