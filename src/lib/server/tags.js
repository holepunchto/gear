// @ts-nocheck

export class TagError extends Error {}

const FORBIDDEN = /[\x00-\x20\x7f~^:?*[\\]/;
const OID = /^[0-9a-f]{40}$/;

/**
 * Why `name` isn't a tag name git would take (git check-ref-format), or null.
 * @param {string} name
 */
export function tagNameError(name) {
	if (!name) return 'Give the tag a name';
	if (name.length > 255) return 'Keep the name under 256 characters';
	if (FORBIDDEN.test(name)) return 'A tag name has no spaces and none of ~ ^ : ? * [ \\';
	if (name.startsWith('-')) return 'A tag name can’t start with -';
	if (name.includes('..')) return 'A tag name can’t contain ..';
	if (name === '@' || name.includes('@{')) return 'A tag name can’t be @ or contain @{';
	if (name.endsWith('.')) return 'A tag name can’t end with .';
	for (const part of name.split('/')) {
		if (!part) return 'A tag name can’t start or end with / or contain //';
		if (part.startsWith('.')) return 'No part of a tag name can start with .';
		if (part.endsWith('.lock')) return 'No part of a tag name can end with .lock';
	}
	return null;
}

/**
 * Point a new lightweight tag at a branch head or a commit. The commit's
 * objects are already in the repo, so the tag is only an index record.
 * @param {any} remote a gip-remote Remote this device owns
 * @param {string} name
 * @param {string} target a branch name or a full commit id
 * @returns {Promise<string>} the commit the tag points at
 */
export async function createTag(remote, name, target) {
	if (!remote.core.writable) throw new TagError('Only the owner of this repo can tag it');

	const problem = tagNameError(name);
	if (problem) throw new TagError(problem);
	if (await remote._db.get('@gip/tags', { name })) throw new TagError(`Tag ${name} already exists`);

	const oid = await resolve(remote, target);
	await remote.push('tags/' + name, oid, new Map());
	return oid;
}

async function resolve(remote, target) {
	if (OID.test(target)) {
		const obj = await remote.getObject(target);
		if (obj?.type === 'commit') return target;
	}
	const branch = await remote._db.get('@gip/branches', { name: target });
	if (branch) return branch.commitOid;
	throw new TagError(`No branch or commit ${target} in this repo`);
}
