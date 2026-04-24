import Id from 'hypercore-id-encoding';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const publicKey = await locals.db.getPublicKey();
	const identity = Id.encode(publicKey);
	return {
		identity,
		identityShort: identity.slice(0, 6) + '…' + identity.slice(-4),
		peers:
			(locals.db as unknown as { swarm?: { connections?: Set<unknown> } }).swarm?.connections
				?.size ?? 0
	};
};
