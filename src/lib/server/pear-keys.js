// @ts-nocheck
import fs from 'fs';
import path from 'path';
import process from 'process';
import b4a from 'b4a';
import z32 from 'z32';
import sodium from 'sodium-native';
import { sign } from 'hypercore-sign-lib';
import { isAndroid, isIOS } from 'which-runtime';

// `pear multisig` keys: <dir>/<name>.public holds the public key and <dir>/<name>
// the private key, encrypted with a password. Only public keys are listed;
// a private key is read when it signs, and its bytes are never kept.

const NAME = /^[\w-]+$/;

/** Where pear keeps its keys, or GEAR_PEAR_DIR. */
export function pearDir() {
	return process.env.GEAR_PEAR_DIR ?? path.join(process.env.HOME ?? '', '.pear');
}

/**
 * The keys in `dir` that have a private key next to them, by name. None on
 * phones, where pear keys don't live.
 * @param {string} dir
 * @returns {Promise<{ name: string, key: string }[]>}
 */
export async function listPearKeys(dir) {
	if (isAndroid || isIOS) return [];
	let entries;
	try {
		entries = await fs.promises.readdir(dir);
	} catch {
		// No ~/.pear: no pear keys.
		return [];
	}
	const out = [];
	for (const file of entries.sort()) {
		if (!file.endsWith('.public')) continue;
		const name = file.slice(0, -'.public'.length);
		if (!NAME.test(name) || !entries.includes(name)) continue;
		const key = publicKey(await fs.promises.readFile(path.join(dir, file)));
		if (key) out.push({ name, key });
	}
	return out;
}

// pear writes the raw 32 bytes; accept z32 text too.
function publicKey(bytes) {
	if (bytes.byteLength === 32) return z32.encode(bytes);
	try {
		const key = z32.decode(b4a.toString(bytes).trim());
		return key.byteLength === 32 ? z32.encode(key) : null;
	} catch {
		return null;
	}
}

/**
 * Signs a raw signing request with the pear key `name`, as
 * `pear multisig sign` does. The password goes into a sodium buffer that
 * hypercore-sign-lib frees.
 * @param {string} dir
 * @param {string} name
 * @param {Uint8Array} request
 * @param {string} password
 * @returns {Promise<Uint8Array>} the response
 */
export async function signWithPearKey(dir, name, request, password) {
	if (!NAME.test(name)) throw new Error('Not a pear key name');
	const encrypted = await fs.promises.readFile(path.join(dir, name));
	const bytes = b4a.from(password);
	const pwd = sodium.sodium_malloc(bytes.byteLength);
	pwd.set(bytes);
	sodium.sodium_memzero(bytes);
	try {
		return await sign(request, encrypted, pwd);
	} finally {
		sodium.sodium_memzero(encrypted);
	}
}
