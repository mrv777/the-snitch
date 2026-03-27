import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import type { NansenCliResponse } from "./types";
import {
  getCachedApiResponse,
  setCachedApiResponse,
} from "@/lib/cache/queries";

const execFileAsync = promisify(execFile);

// Prefer local node_modules/.bin, fall back to global
const LOCAL_BIN = path.join(process.cwd(), "node_modules", ".bin", "nansen");
const API_BASE = "https://api.nansen.ai/api/v1";

/**
 * Execute a Nansen CLI command and return parsed JSON.
 * Uses local caching to avoid redundant API calls.
 */
export async function nansenCli<T = unknown>(
  args: string[],
  cacheKey?: string
): Promise<NansenCliResponse<T>> {
  // Check cache first
  if (cacheKey) {
    const cached = getCachedApiResponse(cacheKey);
    if (cached) return cached as NansenCliResponse<T>;
  }

  try {
    const { stdout } = await execFileAsync(LOCAL_BIN, ["research", ...args], {
      timeout: 15_000, // 15s per interview decision
      env: {
        ...process.env,
        NANSEN_API_KEY: process.env.NANSEN_API_KEY,
      },
    });

    const raw = JSON.parse(stdout);
    const result = unwrapCliResponse<T>(raw);

    // Cache successful responses
    if (cacheKey && result.success) {
      setCachedApiResponse(cacheKey, result);
    }

    return result;
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string };
    // Try to parse CLI error output (it returns structured JSON errors)
    if (error.stdout) {
      try {
        return JSON.parse(error.stdout) as NansenCliResponse<T>;
      } catch {
        // fall through
      }
    }

    // Classify error
    const message = error.message || "CLI execution failed";
    let code = "CLI_ERROR";
    if (message.includes("credits") || message.includes("quota"))
      code = "CREDITS_EXHAUSTED";
    else if (message.includes("401") || message.includes("auth"))
      code = "AUTH_FAILED";
    else if (message.includes("429") || message.includes("rate"))
      code = "RATE_LIMITED";
    else if (message.includes("timeout") || message.includes("ETIMEDOUT"))
      code = "TIMEOUT";

    return {
      success: false,
      data: null as T,
      error: message,
      code,
    };
  }
}

/**
 * Fallback: Direct REST API call with exponential backoff retry.
 */
export async function nansenApi<T = unknown>(
  apiPath: string,
  body: Record<string, unknown>,
  cacheKey?: string
): Promise<NansenCliResponse<T>> {
  if (cacheKey) {
    const cached = getCachedApiResponse(cacheKey);
    if (cached) return cached as NansenCliResponse<T>;
  }

  const apiKey = process.env.NANSEN_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      data: null as T,
      error: "NANSEN_API_KEY not set",
      code: "AUTH_FAILED",
    };
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${apiPath}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.status === 429 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        let code = `HTTP_${res.status}`;
        if (res.status === 401) code = "AUTH_FAILED";
        if (res.status === 429) code = "RATE_LIMITED";
        if (res.status === 503) code = "UNAVAILABLE";

        return {
          success: false,
          data: null as T,
          error: `HTTP ${res.status}: ${detail}`,
          code,
        };
      }

      const raw = await res.json();

      // REST responses may have the same nested { data: [...] } wrapper
      // as CLI responses. Unwrap if present so callers get the array directly.
      const result = unwrapRestResponse<T>(raw);

      if (cacheKey) {
        setCachedApiResponse(cacheKey, result);
      }

      return result;
    } catch (err: unknown) {
      if (attempt === maxRetries) {
        return {
          success: false,
          data: null as T,
          error: (err as Error).message,
          code: "FETCH_ERROR",
        };
      }
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  return {
    success: false,
    data: null as T,
    error: "Max retries exceeded",
    code: "MAX_RETRIES",
  };
}

/**
 * REST API responses often wrap arrays in an object:
 *   { chain: "...", token_address: "...", data: [...] }
 * Unwrap the nested `data` array when the top-level response is an object (not an array).
 */
function unwrapRestResponse<T>(raw: unknown): NansenCliResponse<T> {
  // If the response is already an array, use it directly
  if (Array.isArray(raw)) {
    return { success: true, data: raw as T };
  }

  // If it's an object with a nested `data` array, unwrap it
  if (raw && typeof raw === "object" && "data" in raw) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      return {
        success: true,
        data: obj.data as T,
        pagination: obj.pagination as NansenCliResponse<T>["pagination"],
      };
    }
  }

  // Otherwise return as-is (single-object responses like pnl-summary)
  return { success: true, data: raw as T };
}

/**
 * CLI responses for array endpoints come as:
 *   { success: true, data: { pagination: {...}, data: [...] } }
 * This unwraps the nested `data.data` array when present.
 */
function unwrapCliResponse<T>(
  raw: Record<string, unknown>
): NansenCliResponse<T> {
  if (!raw.success) {
    return raw as unknown as NansenCliResponse<T>;
  }

  const outer = raw.data as Record<string, unknown> | undefined;
  if (!outer || typeof outer !== "object") {
    return raw as unknown as NansenCliResponse<T>;
  }

  // If data has a nested `data` array, unwrap it
  if ("data" in outer && Array.isArray(outer.data)) {
    return {
      success: true,
      data: outer.data as T,
      pagination: outer.pagination as NansenCliResponse<T>["pagination"],
    };
  }

  // Otherwise return the outer data as-is (e.g., pnl-summary)
  return {
    success: true,
    data: outer as T,
    pagination: outer.pagination as NansenCliResponse<T>["pagination"],
  };
}
