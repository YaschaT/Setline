// Swift `[String: V]` literals as `Record<string, V>`.
//
// A Swift dictionary has no keys but its own, so `catalog["constructor"]` is
// nil. A plain JS object would answer with Object.prototype's members; these
// records have no prototype, so a lookup by any id behaves as in Swift.

export function dictionary<V>(entries: Record<string, V>): Record<string, V> {
  return Object.assign(Object.create(null) as Record<string, V>, entries);
}
