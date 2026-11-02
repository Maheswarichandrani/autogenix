/**
 * lib/api/fetch.ts
 * 
 * Unified fetch utility for both client and server.
 * Auth is handled automatically via cookies (Next.js rewrite).
 */


export interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface FetchResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

/**
 * Universal fetch - works on both client and server
 * Client: Uses credentials: "include" for same-origin cookies
 * Server: Forwards cookies from headers()
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions = {}
): Promise<FetchResponse<T>> {
  const { method = "GET", body, params, headers: customHeaders } = options;

  try {
    // Build URL
    const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const url = new URL(path, baseURL);
    
    // Add query params
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    // Build headers
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    // Server-side: Forward cookies from request
    if (typeof window === "undefined") {
      const { headers: nextHeaders } = await import("next/headers");
      const headersList = await nextHeaders();
      const cookie = headersList.get("cookie");
      if (cookie) headers["Cookie"] = cookie;
    }

    // Build request
    const init: RequestInit = {
      method,
      headers,
      credentials: "include", // Client-side: include cookies
    };

    // Add body for non-GET/DELETE
    if (body && method !== "GET" && method !== "DELETE") {
      init.body = JSON.stringify(body);
    }

    // Make request
    const res = await fetch(url.toString(), init);
    
    // Parse response
    let data: T | undefined;
    const contentType = res.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      data = await res.json();
    }

    const errorBody = data as { detail?: string; error?: string } | undefined;

    return {
      data: res.ok ? data : undefined,
      error: res.ok ? undefined : errorBody?.detail || errorBody?.error || `HTTP ${res.status}`,
      status: res.status,
    };
  } catch (err) {
    return {
      status: 500,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}
