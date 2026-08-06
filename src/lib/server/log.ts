import { isBare } from 'which-runtime';

// Bare's builtin console is bare-bones. bare-console routes through
// bare-logger on desktop and the system logger (logcat) on Android, so
// packaged builds surface their logs. In Node dev the global console is fine.
if (isBare) await import('bare-console/global');

export function log(...data: unknown[]) {
	console.log('[gear]', ...data);
}

export function logError(...data: unknown[]) {
	console.error('[gear]', ...data);
}
