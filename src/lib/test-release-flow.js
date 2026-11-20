// @ts-nocheck
import test from 'brittle';
import { flowSteps, shouldPublish } from './release-flow.js';

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

const me = { key: 'me', me: true };
const kasper = { key: 'kasper', me: false };
const ana = { key: 'ana', me: false };

function states(p) {
	const { steps, current } = flowSteps(p);
	return { steps: steps.map((s) => s.id + ':' + s.state), current: steps[current].id };
}

test('alone: version, sign, publish, done', function (t) {
	const alone = { quorum: 1, signers: [me], length: 10, keyLength: 4 };
	t.alike(states({ ...alone, signed: [] }), {
		steps: ['version:done', 'sign:open', 'publish:todo', 'done:todo'],
		current: 'sign'
	});
	t.alike(states({ ...alone, signed: ['me'] }).current, 'publish');
	t.alike(states({ ...alone, signed: ['me'], keyLength: 10 }), {
		steps: ['version:done', 'sign:done', 'publish:done', 'done:done'],
		current: 'done'
	});
});

test('with co-signers: signatures waits on your own first', function (t) {
	const two = { quorum: 2, signers: [me, kasper, ana], length: 10, keyLength: 4 };
	t.alike(states({ ...two, signed: [] }), {
		steps: ['version:done', 'sign:open', 'signatures:todo', 'publish:todo', 'done:todo'],
		current: 'sign'
	});
	t.is(states({ ...two, signed: ['me'] }).current, 'signatures');
	t.is(states({ ...two, signed: ['me', 'ana'] }).current, 'publish');
});

test('signing is skipped when others are enough', function (t) {
	const p = { quorum: 2, signers: [me, kasper, ana], signed: ['kasper', 'ana'] };
	t.alike(states({ ...p, length: 10, keyLength: 4 }).steps.slice(1, 3), [
		'sign:skipped',
		'signatures:done'
	]);
});

test('without a seat there is no sign step', function (t) {
	const p = { quorum: 1, signers: [kasper, ana], signed: [], length: 10, keyLength: 4 };
	t.alike(states(p), {
		steps: ['version:done', 'signatures:open', 'publish:todo', 'done:todo'],
		current: 'signatures'
	});
});
