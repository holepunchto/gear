// @ts-nocheck
// A release key is derived from its signers, quorum and namespace, so reusing
// a name with the same signers needs a new namespace: the name plus `@2`, `@3`…

export const NAMESPACE = 'gear/releases/';

export function namespaceFor(name, taken) {
	let namespace = NAMESPACE + name;
	for (let n = 2; taken.has(namespace); n++) namespace = NAMESPACE + name + '@' + n;
	return namespace;
}

export function nameOf(namespace) {
	if (!namespace.startsWith(NAMESPACE)) return namespace;
	return namespace.slice(NAMESPACE.length).replace(/@\d+$/, '');
}
