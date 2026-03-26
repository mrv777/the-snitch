import { describe, it, expect } from "vitest";
import { VERDICT_CONFIG, scoreToVerdict } from "@/lib/forensics/types";

/**
 * Tests for the SuspicionMeter component's underlying logic.
 * We test the score-to-verdict mapping and color selection since
 * the component itself is a client-side React component.
 */
describe("SuspicionMeter logic", () => {
  it("maps score 85 to HIGHLY_SUSPICIOUS", () => {
    expect(scoreToVerdict(85)).toBe("HIGHLY_SUSPICIOUS");
    expect(VERDICT_CONFIG.HIGHLY_SUSPICIOUS.color).toBe("#FF4444");
  });

  it("maps score 72 to SUSPICIOUS", () => {
    expect(scoreToVerdict(72)).toBe("SUSPICIOUS");
    expect(VERDICT_CONFIG.SUSPICIOUS.color).toBe("#FF8800");
  });

  it("maps score 45 to NOTABLE", () => {
    expect(scoreToVerdict(45)).toBe("NOTABLE");
    expect(VERDICT_CONFIG.NOTABLE.color).toBe("#FFB800");
  });

  it("maps score 25 to INCONCLUSIVE", () => {
    expect(scoreToVerdict(25)).toBe("INCONCLUSIVE");
    expect(VERDICT_CONFIG.INCONCLUSIVE.color).toBe("#888888");
  });

  it("maps score 10 to CLEAN", () => {
    expect(scoreToVerdict(10)).toBe("CLEAN");
    expect(VERDICT_CONFIG.CLEAN.color).toBe("#00FF88");
  });

  it("maps boundary scores correctly", () => {
    expect(scoreToVerdict(80)).toBe("HIGHLY_SUSPICIOUS");
    expect(scoreToVerdict(79)).toBe("SUSPICIOUS");
    expect(scoreToVerdict(60)).toBe("SUSPICIOUS");
    expect(scoreToVerdict(59)).toBe("NOTABLE");
    expect(scoreToVerdict(40)).toBe("NOTABLE");
    expect(scoreToVerdict(39)).toBe("INCONCLUSIVE");
    expect(scoreToVerdict(20)).toBe("INCONCLUSIVE");
    expect(scoreToVerdict(19)).toBe("CLEAN");
    expect(scoreToVerdict(0)).toBe("CLEAN");
  });

  it("all verdict configs have required fields", () => {
    for (const [key, config] of Object.entries(VERDICT_CONFIG)) {
      expect(config.label).toBeTruthy();
      expect(config.color).toMatch(/^#[A-Fa-f0-9]{6}$/);
      expect(typeof config.minScore).toBe("number");
      expect(key).toBe(key); // type guard
    }
  });
});
