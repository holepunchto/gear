#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import Hyperschema from 'hyperschema';
import HyperconfBuilder from 'hyperconf/builder.js';
import Corestore from 'corestore';
import hid from 'hypercore-id-encoding';
import paparam from 'paparam';

const { command, flag, summary } = paparam;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sources = JSON.parse(readFileSync(join(ROOT, 'ota/sources.json'), 'utf8'));
const SCHEMA_DIR = join(ROOT, 'ota/spec/hyperschema');
const CONF_DIR = join(ROOT, 'ota/spec/hyperconf');
const KEY_PATH = join(ROOT, 'ota/key.js');
const WRITER_DIR = join(ROOT, 'ota/writer');

const cmd = command(
	'ota',
	summary('Bake ota/sources.js into the hyperconf spec, optionally publish it OTA'),
	flag('--init', 'Create the writer core and ota/key.js (one-time, key holder only)'),
	flag('--publish', 'Append the current config to the writer core and seed it')
);

cmd.parse(process.argv.slice(2));
const { init, publish } = cmd.flags;

const schema = Hyperschema.from(SCHEMA_DIR);
const gear = schema.namespace('gear');

gear.register({
	name: 'repo',
	fields: [
		{ name: 'name', type: 'string', required: true },
		{ name: 'url', type: 'string', required: true },
		{ name: 'description', type: 'string' }
	]
});

gear.register({
	name: 'source',
	fields: [
		{ name: 'name', type: 'string', required: true },
		{ name: 'blindPeers', type: 'string', array: true },
		{ name: 'repos', type: '@gear/repo', array: true }
	]
});

gear.register({
	name: 'config',
	fields: [{ name: 'sources', type: '@gear/source', array: true }]
});

// hyperconf's builder loads the generated schema with require(), so keep it CJS
Hyperschema.toDisk(schema, { esm: false });

const conf = HyperconfBuilder.from(SCHEMA_DIR, CONF_DIR);
const block = conf.setProduction('@gear/config', sources);
HyperconfBuilder.toDisk(conf);
console.log(`baked ${sources.sources.length} source(s) into ota/spec`);

if (init) {
	if (existsSync(KEY_PATH)) throw new Error('ota/key.js already exists — refusing to rotate');
	const core = await writerCore();
	writeFileSync(KEY_PATH, `module.exports = '${hid.encode(core.key)}';\n`);
	console.log(`writer created — key ${hid.encode(core.key)}`);
	console.log('ota/writer holds the secret key: back it up, never commit it');
}

if (publish) {
	const key = (await import('../ota/key.js')).default;
	const core = await writerCore();
	if (Buffer.compare(core.key, hid.decode(key)) !== 0)
		throw new Error('ota/writer does not match ota/key.js');

	const last = core.length ? await core.get(core.length - 1) : null;
	if (last && Buffer.compare(last, block) === 0) {
		console.log(`config unchanged — core stays at length ${core.length}`);
	} else {
		await core.append(block);
		console.log(`appended config — core length ${core.length}`);
	}

	const { default: Hyperswarm } = await import('hyperswarm');
	const swarm = new Hyperswarm();
	swarm.on('connection', (conn) => core.replicate(conn));
	const discovery = swarm.join(core.discoveryKey);
	await discovery.flushed();
	console.log('announced — seeding until Ctrl-C');
}

async function writerCore() {
	const store = new Corestore(WRITER_DIR);
	const core = store.get({ name: 'config' });
	await core.ready();
	return core;
}
