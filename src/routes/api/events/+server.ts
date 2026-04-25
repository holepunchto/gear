import type { RequestHandler } from './$types';

// Live global stats stream — peer connections + DHT nodes. Clients subscribe
// via EventSource; we send a snapshot every ~2s. Cheap enough (it's reading
// a Set.size and an array length) and avoids needing to tap into every swarm
// event.
const TICK_MS = 5000;

type SwarmLike = {
	connections?: Set<unknown>;
	dht?: { nodes?: { length: number } };
};

async function getPeers(db: any) {
	const names = await db.getRepoNames();

	const entries = await Promise.all(
		names.map((name: string) => db.getCore(name, { server: false, client: false }))
	);

	const peers = new Set();
	for (const e of entries) {
		for (const p of e.core.peers) {
			peers.add(p.remotePublicKey.toString('hex'));
		}
	}

	return peers.size;
}

async function snapshot(db: unknown) {
	const swarm = (db as { swarm?: SwarmLike }).swarm;
	return {
		peers: await getPeers(db),
		dhtNodes: swarm?.dht?.nodes?.length ?? 0
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	const encoder = new TextEncoder();
	let tick: ReturnType<typeof setInterval> | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

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

			// Initial burst so the UI doesn't sit on a stale SSR value.
			snapshot(locals.db).then((snap) => send('stats', snap));

			tick = setInterval(async () => send('stats', await snapshot(locals.db)), TICK_MS);

			// Heartbeat — keeps intermediaries from closing idle connections.
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
			if (tick) clearInterval(tick);
			if (heartbeat) clearInterval(heartbeat);
			tick = null;
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
