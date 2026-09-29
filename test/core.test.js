import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ShortId } from '../src/index.js';

describe('ShortId', () => {
  test('produces a 13-character lowercase base36 string', () => {
    const s = new ShortId(() => 1000);
    const id = s.next();
    assert.equal(id.length, 13);
    assert.match(id, /^[0-9a-z]{13}$/);
  });

  test('encodes the timestamp in the first 8 chars', () => {
    const ts = 1715000000000;
    const s = new ShortId(() => ts);
    const id = s.next();
    const decoded = ShortId.fromString(id);
    assert.equal(decoded.timestamp, ts);
    assert.equal(decoded.counterHigh, 0);
    assert.equal(decoded.counterLow, 0);
  });

  test('IDs from successive milliseconds sort lexicographically', () => {
    let t = 5000;
    const s = new ShortId(() => t);
    const ids = [];
    for (let i = 0; i < 5; i++) {
      ids.push(s.next());
      t += 1;
    }
    const sorted = [...ids].sort();
    assert.deepEqual(sorted, ids);
  });

  test('IDs within the same millisecond are monotonic via counter', () => {
    const s = new ShortId(() => 9999);
    const ids = [];
    for (let i = 0; i < 100; i++) {
      ids.push(s.next());
    }
    const sorted = [...ids].sort();
    assert.deepEqual(sorted, ids);
    // Every ID should be strictly greater than the previous.
    for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i] > ids[i - 1], `${ids[i]} should sort after ${ids[i - 1]}`);
    }
  });

  test('counter resets when the millisecond advances', () => {
    let t = 100;
    const s = new ShortId(() => t);
    const a = s.next();
    t += 1;
    const b = s.next();
    const da = ShortId.fromString(a);
    const db = ShortId.fromString(b);
    assert.equal(da.counterLow, 0);
    assert.equal(db.counterLow, 0);
    assert.ok(db.timestamp > da.timestamp);
  });

  test('low counter overflow bumps the high counter', () => {
    const s = new ShortId(() => 2000);
    // Generate LOW_COUNTER_MAX IDs to force overflow.
    let lastId = null;
    const total = 36 * 36 * 36 * 36; // 1_679_616
    for (let i = 0; i < total; i++) {
      lastId = s.next();
    }
    const before = ShortId.fromString(lastId);
    assert.equal(before.counterHigh, 0);
    assert.equal(before.counterLow, total - 1);

    const overflowId = s.next();
    const after = ShortId.fromString(overflowId);
    assert.equal(after.counterHigh, 1);
    assert.equal(after.counterLow, 0);
  });

  test('throws when the clock moves backwards', () => {
    let t = 5000;
    const s = new ShortId(() => t);
    s.next();
    t = 4999;
    assert.throws(() => s.next(), RangeError);
  });

  test('throws when clock returns a non-integer', () => {
    const s = new ShortId(() => 1.5);
    assert.throws(() => s.next(), TypeError);
  });

  test('fromString rejects malformed input', () => {
    assert.throws(() => ShortId.fromString('short'), TypeError);
    assert.throws(() => ShortId.fromString(123), TypeError);
    assert.throws(() => ShortId.fromString('ABCDEFGHIJKLM'), TypeError); // uppercase rejected; IDs are lowercase base36
  });

  test('fromString rejects non-base36 characters', () => {
    assert.throws(() => ShortId.fromString('!!!!!!!!!!!!!'), TypeError);
  });

  test('default clock uses Date.now', () => {
    const realNow = Date.now();
    const s = new ShortId();
    const id = s.next();
    const decoded = ShortId.fromString(id);
    // Allow a small drift since the real clock ticks between calls.
    assert.ok(decoded.timestamp >= realNow);
    assert.ok(decoded.timestamp < realNow + 5000);
  });

  test('constructor validates clock argument', () => {
    assert.throws(() => new ShortId('not a function'), TypeError);
  });
});
