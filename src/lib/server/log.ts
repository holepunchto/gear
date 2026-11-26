import { isBare } from 'which-runtime';

// Bare's builtin console is bare-bones. bare-console routes through
// bare-logger on desktop and the system logger (logcat) on Android, so
// packaged builds surface their logs. In Node dev the global console is fine.
if (isBare) await import('bare-console/global');

export function log(...data: unknown[]) {
	console.log('[gear]', ...data);
}

// Errors go in as their stack, never as the object. bare-console inspects what
// it is given, and inspecting a live object in a packaged build segfaults the
// process inside bare-type's addon — so the one thing an error log must not do
// is hand over something that needs inspecting.
export function logError(...data: unknown[]) {
	console.error('[gear]', ...data.map((d) => (d instanceof Error ? (d.stack ?? d.message) : d)));
}
