// XCTest assertions on node:test, with Swift `==` semantics for values.
import assert from "node:assert/strict";
import { deepEqual } from "../src/core/Support/swift";

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (!deepEqual(actual, expected)) {
    assert.fail(message ?? `XCTAssertEqual failed: ${fmt(actual)} is not equal to ${fmt(expected)}`);
  }
}
export function assertNotEqual<T>(actual: T, expected: T, message?: string): void {
  if (deepEqual(actual, expected)) assert.fail(message ?? `XCTAssertNotEqual failed: both are ${fmt(actual)}`);
}
export function assertClose(actual: number | undefined, expected: number, accuracy: number, message?: string): void {
  if (actual === undefined || Math.abs(actual - expected) > accuracy) {
    assert.fail(message ?? `XCTAssertEqual(accuracy: ${accuracy}) failed: ${actual} is not ${expected}`);
  }
}
export const assertTrue = (v: unknown, message?: string) => assert.ok(v === true, message ?? "XCTAssertTrue failed");
export const assertFalse = (v: unknown, message?: string) => assert.ok(v === false, message ?? "XCTAssertFalse failed");
export const assertNil = (v: unknown, message?: string) => assert.ok(v === undefined || v === null, message ?? `XCTAssertNil failed: ${fmt(v)}`);
export const assertNotNil = (v: unknown, message?: string) => assert.ok(v !== undefined && v !== null, message ?? "XCTAssertNotNil failed");
export function assertGreaterThan(a: number, b: number, message?: string) { assert.ok(a > b, message ?? `XCTAssertGreaterThan failed: ${a} <= ${b}`); }
export function assertGreaterThanOrEqual(a: number, b: number, message?: string) { assert.ok(a >= b, message ?? `XCTAssertGreaterThanOrEqual failed: ${a} < ${b}`); }
export function assertLessThan(a: number, b: number, message?: string) { assert.ok(a < b, message ?? `XCTAssertLessThan failed: ${a} >= ${b}`); }
export function assertLessThanOrEqual(a: number, b: number, message?: string) { assert.ok(a <= b, message ?? `XCTAssertLessThanOrEqual failed: ${a} > ${b}`); }
export function assertThrows(fn: () => unknown, message?: string) { assert.throws(fn, message); }

function fmt(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, x) => (x instanceof Set ? [...x] : x instanceof Map ? Object.fromEntries(x) : x));
  } catch {
    return String(v);
  }
}
