// FoodSearchService.swift. Asks the web app's product search
// (`lib/food-search.ts`, behind `/api/food-search`), as this account, with
// its Supabase access token. What a search means is `FoodSearch.search`;
// this is only the request on the wire.
import type { AuthSessionCoordinator } from "../core/Sync/AuthSessionCoordinator";
import { FoodSearch, FoodSearchOutcome, FoodSearch_Message } from "../core/Nutrition/FoodSearch";
import { WebAppConfig } from "./SupabaseConfig";

export class FoodSearchService {
  constructor(private readonly config: WebAppConfig | undefined = WebAppConfig.fromBundle()) {}

  /** `auth` is the signed-in account's token coordinator; without one there is no account to search as. */
  async search(query: string, a: { auth: AuthSessionCoordinator | undefined }): Promise<FoodSearchOutcome> {
    const config = this.config;
    if (!config) return FoodSearchOutcome.failed("Search isn't set up on this phone. Enter the values yourself.");
    if (!a.auth) return FoodSearchOutcome.failed(FoodSearch_Message.signIn);
    return FoodSearch.search(query, {
      auth: a.auth,
      send: async (path, accessToken) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        try {
          const response = await fetch(config.url + path, {
            headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          });
          return { status: response.status, data: await response.text() };
        } finally {
          clearTimeout(timer);
        }
      },
    });
  }
}
