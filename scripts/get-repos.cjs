#!/usr/bin/env bare

const { spawnSync } = require('bare-subprocess');
const process = require('bare-process');
const fs = require('bare-fs');
const { GitPearLink } = require('gip-remote');
const { GipLocalDB } = require('gip-transport');
const HyperDB = require('hyperdb');
const Hyperbee = require('hyperbee2');
const ID = require('hypercore-id-encoding');

const { default: sourceDef } = require('../src/lib/server/schema/hyperdb/index.js');

async function main() {
	// read stdin
	const input = Promise.withResolvers();
	const stdin = process.stdin;
	const chunks = [];
	stdin.on('data', (chunk) => {
		chunks.push(chunk);
	});
	stdin.on('end', () => {
		const data = Buffer.concat(chunks);
		const text = data.toString();

		try {
			const json = JSON.parse(text);
			input.resolve(json);
		} catch (e) {
			input.reject(e);
		}
	});

	const data = await input.promise;

	if (fs.existsSync('scripts/cache.json')) {
		console.log('using cache');
		const cached = JSON.parse(fs.readFileSync('scripts/cache.json', 'utf8'));
		for (const item of data) {
			const found = cached.find((d) => d.name === item.name);
			if (found) {
				item.description = found.description;
			}
		}
	} else {
		console.log('getting descriptions from github');
		for (const item of data) {
			console.log(item);
			// gh repo view holepunchto/b4a --json description | jq
			const result = spawnSync('gh', [
				'repo',
				'view',
				`holepunchto/${item.name}`,
				'--json',
				'description'
			]);
			const output = result.output[1].toString();
			if (output) {
				const json = JSON.parse(output);
				item.description = json.description;
			}
		}
		fs.writeFileSync('scripts/cache.json', JSON.stringify(data, null, 2));
	}

	for (const item of data) {
		const link = GitPearLink.parse(item.url);
		item.key = link.drive.key;
	}

	console.log(data);

	const gip = new GipLocalDB();
	await gip.ready();

	const ns = gip.namespace('sources');
	const core = ns.get({ name: 'holepunchto' });
	await core.ready();

	const bee = new Hyperbee(ns, { core });
	const sourceDB = HyperDB.bee2(bee, sourceDef);
	await sourceDB.ready();

	console.log(await sourceDB.find('@gear-sources/config').toArray());

	// await sourceDB.insert('@gear-sources/config', {
	// 	repos: data,
	// 	blindPeers: [
	// 		ID.decode('qiysd9x3cwk47wb1khrbiw1ie8gj9uttnt3mwcgr9obthb96kxxo'),
	// 		ID.decode('4esc4a9go8rcad43kkgtrr4uyqssuo1w9p1ozyy3b14jzq77fijy')
	// 	]
	// });

	// await sourceDB.flush();

	console.log(await sourceDB.find('@gear-sources/config').toArray());

	console.log(core.key.toString('hex'));

	await sourceDB.close();
	await gip.close();
}

main();
