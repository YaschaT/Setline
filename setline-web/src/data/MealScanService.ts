// MealScanService.swift. Asks the web app's meal scan (`/api/meal-scan`,
// `lib/meal-scan.ts`), as this account: the photo and what was said go to the
// Setline server, which answers with foods, grams and at most one question.
import type { AuthSessionCoordinator } from "../core/Sync/AuthSessionCoordinator";
import { FoodScanAnswer, FoodScanRequest } from "../core/Nutrition/FoodLookup";
import { WebAppConfig } from "./SupabaseConfig";

export type MealScanService_Outcome =
  | { kind: "answer"; value: FoodScanAnswer }
  /** No account, no server, no connection, or the server said no. */
  | { kind: "unavailable"; value: string };

export class MealScanService {
  constructor(private readonly config: WebAppConfig | undefined = WebAppConfig.fromBundle()) {}

  async scan(body: FoodScanRequest, a: { auth: AuthSessionCoordinator | undefined }): Promise<MealScanService_Outcome> {
    const config = this.config;
    if (!config || !a.auth) return { kind: "unavailable", value: "Sign in to scan with Tally." };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      const token = (await a.auth.validSession()).accessToken;
      const response = await fetch(config.url + "/api/meal-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: FoodScanRequest.encode(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (response.status < 200 || response.status >= 300) {
        let message: string | undefined;
        try {
          const object = JSON.parse(text) as Record<string, unknown>;
          if (typeof object.message === "string") message = object.message;
        } catch {
          /* not JSON */
        }
        return { kind: "unavailable", value: message ?? `Tally couldn't answer (${response.status}).` };
      }
      return { kind: "answer", value: FoodScanAnswer.decode(JSON.parse(text)) };
    } catch {
      return { kind: "unavailable", value: "No connection." };
    } finally {
      clearTimeout(timer);
    }
  }
}
