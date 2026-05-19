// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — no type declarations for hyperdht
import DHT from 'hyperdht';

interface SearchHandle {
	plugin: any;
	ready: Promise<void>;
}

const g = globalThis as unknown as Record<string, SearchHandle>;

// Singleton per bootstrap address — avoids re-connecting on every request.
export async function getSearchPlugin(bootstrap: string): Promise<SearchHandle> {
	const key = `__search_${bootstrap}`;
	if (!g[key]) {
		// @ts-expect-error — hypersearch ships a malformed .d.ts; runtime import works fine
		const { default: Hypersearch } = await import('hypersearch');
		const [host, portStr] = bootstrap.split(':');
		const node = new DHT({ bootstrap: [{ host, port: parseInt(portStr, 10) }] });
		const plugin = new Hypersearch();
		node.register(plugin.name, plugin);
		g[key] = { plugin, ready: node.ready() };
	}
	return g[key];
}
