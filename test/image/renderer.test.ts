import { describe, it, expect, vi } from "vitest";

// Test that the renderer module exports the expected interface.
// Actual Playwright rendering is integration-tested against a running server,
// not unit-tested here (requires Chromium binary + running Next.js).

describe("image/renderer module", () => {
  it("exports renderCard, renderBothCards, and closeBrowser", async () => {
    // Dynamic import to avoid Playwright binary requirement in CI
    const mod = await import("@/lib/image/renderer");
    expect(typeof mod.renderCard).toBe("function");
    expect(typeof mod.renderBothCards).toBe("function");
    expect(typeof mod.closeBrowser).toBe("function");
  });
});
