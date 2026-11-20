// @ts-nocheck
import test from 'brittle';
import Publishes from './publishes.js';

test('a publish stays running until it settles, and a second start joins it', async function (t) {
	const changes = [];
	const publishes = new Publishes((id) => changes.push(id));
	let calls = 0;
	let finish;
	const publish = () => {
		calls++;
		return new Promise((resolve) => (finish = resolve));
	};

	const first = publishes.start('k/1', publish, String);
	const second = publishes.start('k/1', publish, String);
	t.is(calls, 1, 'one commit');
	t.is(first, second);
	t.alike(publishes.state('k/1'), { publishing: true, error: null });

	finish('done');
	t.is(await first, 'done');
	t.alike(publishes.state('k/1'), { publishing: false, error: null });
	t.alike(changes, ['k/1', 'k/1']);
});

test('a failure is kept until the next start', async function (t) {
	const publishes = new Publishes();
	await t.exception(
		publishes.start(
			'k/1',
			() => Promise.reject(new Error('boom')),
			(err) => err.message
		),
		/boom/
	);
	t.alike(publishes.state('k/1'), { publishing: false, error: 'boom' });

	const again = publishes.start('k/1', () => new Promise(() => {}), String);
	t.alike(publishes.state('k/1'), { publishing: true, error: null });
	t.ok(again);
});
