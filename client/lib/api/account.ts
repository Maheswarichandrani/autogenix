/**
 * lib/api/account.ts
 *
 * Account-level platform credentials. The server only ever returns
 * connection status, never a token.
 */

import { apiFetch } from "./fetch";
import { API_ENDPOINTS } from "./config";

export interface CredentialStatus {
  github_connected:  boolean;
  railway_connected: boolean;
  github_username:   string | null;
}

export const accountAPI = {
  /** GET /api/v1/account/credentials */
  getCredentials: async () => {
    return apiFetch<CredentialStatus>(API_ENDPOINTS.account.credentials, {
      method: "GET",
    });
  },

  /** POST /api/v1/account/railway-key — encrypted server-side, never echoed back */
  saveRailwayKey: async (railwayApiKey: string) => {
    return apiFetch<{ railway_connected: boolean }>(API_ENDPOINTS.account.railwayKey, {
      method: "POST",
      body: { railway_api_key: railwayApiKey },
    });
  },
};
