// @ts-nocheck
import test from 'brittle';
import { shouldPublish } from './release-flow.js';

const ready = { quorum: 2, signed: ['a', 'b'], length: 10, keyLength: 4 };

test('publishes once the last signature is in', function (t) {
	t.ok(shouldPublish(ready));
	t.ok(shouldPublish({ ...ready, autoPublish: true }));
	t.absent(shouldPublish({ ...ready, signed: ['a'] }));
});

test('waits when publish when signed is unticked', function (t) {
	t.absent(shouldPublish({ ...ready, autoPublish: false }));
});

test('does not publish twice, or again after a failure', function (t) {
	t.absent(shouldPublish({ ...ready, publishing: true }));
	t.absent(shouldPublish({ ...ready, error: 'Commit timed out' }));
});

test('does not publish what the key already holds', function (t) {
	t.absent(shouldPublish({ ...ready, keyLength: 10 }));
	t.absent(shouldPublish({ ...ready, keyLength: 12 }));
});
