// @ts-nocheck
import test from 'brittle';
import { namespaceFor, nameOf } from './release-names.js';

test('a free name keeps its plain namespace', function (t) {
	t.is(namespaceFor('b4a/stable', new Set()), 'gear/releases/b4a/stable');
});

test('a taken name gets the next free number', function (t) {
	const taken = new Set(['gear/releases/b4a/stable', 'gear/releases/b4a/stable@2']);
	t.is(namespaceFor('b4a/stable', taken), 'gear/releases/b4a/stable@3');
});

test('the name drops the prefix and the number', function (t) {
	t.is(nameOf('gear/releases/b4a/stable'), 'b4a/stable');
	t.is(nameOf('gear/releases/b4a/stable@3'), 'b4a/stable');
	t.is(nameOf('pear/other@2'), 'pear/other@2');
});
