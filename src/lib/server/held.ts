// Which blocks of a core we hold: everything below the contiguous length seen
// at attach, plus every block downloaded since. Fed by the core's 'download'
// events, so it never scans the core. Bucket counts back the sync strip,
// which shows the whole core as a fixed number of cells.

export const BUCKETS = 64;

export class HeldBlocks {
	base: number;
	downloaded = 0;
	private bits = new Uint8Array(0);
	private counts = new Int32Array(BUCKETS);
	private countsLength = -1;

	constructor(base: number) {
		this.base = base;
	}

	add(index: number) {
		if (index < this.base) return;
		const i = index - this.base;
		if (i >> 3 >= this.bits.length) {
			const bits = new Uint8Array(Math.max((i >> 3) + 1, this.bits.length * 2));
			bits.set(this.bits);
			this.bits = bits;
		}
		const mask = 1 << (i & 7);
		if (this.bits[i >> 3] & mask) return;
		this.bits[i >> 3] |= mask;
		this.downloaded++;
		if (index < this.countsLength) this.counts[bucketOf(index, this.countsLength)]++;
	}

	held(length: number, contiguous: number) {
		return Math.min(length, Math.max(this.base + this.downloaded, contiguous));
	}

	/**
	 * Percent held of each of BUCKETS equal slices of the core, or null when
	 * the core is too short to slice.
	 */
	buckets(length: number) {
		if (length < BUCKETS) return null;
		if (length !== this.countsLength) this.recount(length);
		return Array.from(this.counts, (n, b) => {
			const size = start(b + 1, length) - start(b, length);
			return Math.floor((n * 100) / size);
		});
	}

	private recount(length: number) {
		this.countsLength = length;
		for (let b = 0; b < BUCKETS; b++) {
			this.counts[b] = Math.max(0, Math.min(start(b + 1, length), this.base) - start(b, length));
		}
		for (let byte = 0; byte < this.bits.length; byte++) {
			if (this.bits[byte] === 0) continue;
			for (let bit = 0; bit < 8; bit++) {
				const index = this.base + byte * 8 + bit;
				if (index >= length) return;
				if (this.bits[byte] & (1 << bit)) this.counts[bucketOf(index, length)]++;
			}
		}
	}
}

// Bucket b covers [start(b), start(b + 1)), so bucketOf(i) is b exactly there.
function start(b: number, length: number) {
	return Math.ceil((b * length) / BUCKETS);
}

function bucketOf(index: number, length: number) {
	return Math.floor((index * BUCKETS) / length);
}
