/**
 * Core logic for generating short, sortable, collision-resistant IDs.
 *
 * ID structure (13 chars, base36):
 *   [ 8 chars: ms timestamp ][ 1 char: counter overflow ][ 4 chars: counter ]
 *
 * Why base36? It uses [0-9a-z], is URL-safe, lowercase, and needs no custom
 * alphabet. It is dense enough to keep IDs short while remaining debuggable.
 *
 * Why split the counter across a high and low part? A 4-char base36 counter
 * holds 1,679,616 values. If that overflows within the same millisecond we
 * bump a 1-char high segment (36x more headroom) rather than silently
 * recycling or throwing. This keeps IDs monotonic within a process even
 * under burst generation.
 */

const RADIX = 36;
const LOW_COUNTER_WIDTH = 4;
const HIGH_COUNTER_WIDTH = 1;
const TIMESTAMP_WIDTH = 8;

const LOW_COUNTER_MAX = Math.pow(RADIX, LOW_COUNTER_WIDTH); // 1_679_616
const HIGH_COUNTER_MAX = Math.pow(RADIX, HIGH_COUNTER_WIDTH); // 36

const BASE36_RE = /^[0-9a-z]+$/;

/**
 * Left-pad a base-36 string to a fixed width with '0'.
 * Fixed width is what makes the resulting IDs lexicographically sortable.
 */
function pad(value, width) {
  let s = value.toString(RADIX);
  while (s.length < width) s = '0' + s;
  return s;
}

/**
 * Decode a fixed-width base-36 segment back to a number.
 * Used only by fromString; generation never needs to parse.
 */
function unpad(segment) {
  return Number.parseInt(segment, RADIX);
}

/**
 * Generate short IDs from a monotonic clock.
 *
 * The clock is injected so tests can be fully deterministic. In production
 * pass `Date.now` (or any () => number returning integer milliseconds).
 */
export class ShortId {
  #clock;
  #lastTs;
  #counterLow;
  #counterHigh;

  constructor(clock = () => Date.now()) {
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function returning an integer');
    }
    this.#clock = clock;
    this.#lastTs = -1;
    this.#counterLow = 0;
    this.#counterHigh = 0;
  }

  /**
   * Produce the next ID. Monotonic within a process: if the clock has not
   * advanced since the last call, the counter increments instead.
   */
  next() {
    const now = this.#clock();

    if (!Number.isInteger(now)) {
      throw new TypeError('clock must return an integer');
    }

    if (now < this.#lastTs) {
      // Clock moved backwards. We refuse to emit an ID that would sort before
      // a previous one, because that silently breaks ordering invariants.
      throw new RangeError(`clock moved backwards: ${now} < ${this.#lastTs}`);
    }

    if (now === this.#lastTs) {
      this.#counterLow += 1;
      if (this.#counterLow >= LOW_COUNTER_MAX) {
        this.#counterLow = 0;
        this.#counterHigh += 1;
        if (this.#counterHigh >= HIGH_COUNTER_MAX) {
          // 36 * 1.68M ≈ 60M IDs in one ms. Beyond that we genuinely cannot
          // keep the promise of monotonicity, so fail loudly.
          throw new RangeError('counter exhausted within a single millisecond');
        }
      }
    } else {
      this.#lastTs = now;
      this.#counterLow = 0;
      this.#counterHigh = 0;
    }

    return (
      pad(now, TIMESTAMP_WIDTH) +
      pad(this.#counterHigh, HIGH_COUNTER_WIDTH) +
      pad(this.#counterLow, LOW_COUNTER_WIDTH)
    );
  }

  /**
   * Decode a previously generated ID into its parts.
   * Useful for debugging and for asserting structure in tests.
   */
  static fromString(id) {
    if (typeof id !== 'string' || id.length !== 13) {
      throw new TypeError('id must be a 13-character base36 string');
    }
    if (!BASE36_RE.test(id)) {
      throw new TypeError('id must be a 13-character base36 string');
    }
    const ts = id.slice(0, 8);
    const high = id.slice(8, 9);
    const low = id.slice(9, 13);
    return {
      timestamp: unpad(ts),
      counterHigh: unpad(high),
      counterLow: unpad(low),
    };
  }
}
