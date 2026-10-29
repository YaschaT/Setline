// FoodLookupService.swift. A barcode, read in Open Food Facts straight from
// the device: only the number leaves it.
import { BarcodeProduct } from "../core/Nutrition/FoodLookup";

export type FoodLookupService_BarcodeOutcome =
  | { kind: "found"; value: BarcodeProduct }
  | { kind: "notFound" }
  | { kind: "failed"; value: string };

export class FoodLookupService {
  async barcode(code: string): Promise<FoodLookupService_BarcodeOutcome> {
    const url = BarcodeProduct.lookupURL(code);
    if (!url) return { kind: "notFound" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      // A browser sets its own User-Agent; Open Food Facts accepts that.
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 404) return { kind: "notFound" };
      if (response.status < 200 || response.status >= 300) {
        return { kind: "failed", value: "Open Food Facts didn't answer. Try again in a moment." };
      }
      const product = BarcodeProduct.parse(await response.text(), { barcode: code });
      return product ? { kind: "found", value: product } : { kind: "notFound" };
    } catch {
      return { kind: "failed", value: "No connection. Try again, or search by name." };
    } finally {
      clearTimeout(timer);
    }
  }
}
