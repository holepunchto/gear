// "Dominic Cassidy" → "DC". For the small author avatars on commit rows.
export function initials(name: string | null) {
	if (!name) return '?';
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join('');
}
