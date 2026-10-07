# Short ID

Generates 13-character, lexicographically sortable, collision-resistant IDs from an injected monotonic clock.

## Usage

```js
import { ShortId } from 'short-id';

const ids = new ShortId();          // uses Date.now by default
const a = ids.next();               // e.g. "lz0000000000"
const b = ids.next();               // strictly greater than a

// For deterministic tests, inject a fake clock:
let t = 1000;
const fake = new ShortId(() => t);
fake.next();   // timestamp 1000, counter 0
t += 1;
fake.next();   // timestamp 1001, counter 0
```

## Why

Distributed ID generators like UUIDv7 or ULID carry 128+ bits and 26+ characters. That is overkill when you need a short, sortable identifier within a single process — a log line key, a local trace span, a dedup token. This library trades global uniqueness for brevity: 13 base36 characters encoding an 8-char millisecond timestamp plus a 5-char counter.

The trade-off: IDs are only unique within the process that generated them. Two processes can produce the same ID at the same millisecond. If you need cross-process uniqueness, use a longer format.

## Edge cases

- **Clock skew**: if the injected clock moves backwards, `next()` throws a `RangeError` rather than emitting an ID that would sort before a previous one. Wrap the clock if you need to tolerate skew.
- **Burst overflow**: the counter holds ~60 million IDs per millisecond before throwing. In practice you will not hit this, but it is a hard ceiling, not a silent recycle.
- **Same-millisecond ordering**: IDs generated within one millisecond are monotonic by counter, not by timestamp — they sort correctly, but the timestamp segment alone does not distinguish them.

## API

- `new ShortId(clock?)` — `clock` is a `() => number` returning integer milliseconds. Defaults to `Date.now`.
- `shortId.next()` → `string` — returns the next 13-character ID.
- `ShortId.fromString(id)` → `{ timestamp, counterHigh, counterLow }` — decodes an ID for debugging.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

