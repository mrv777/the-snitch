import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("seed-demo script", () => {
  const scriptPath = path.join(process.cwd(), "scripts", "seed-demo.ts");
  const content = fs.readFileSync(scriptPath, "utf-8");

  it("exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("imports investigateToken", () => {
    expect(content).toContain("investigateToken");
  });

  it("imports investigatePrediction", () => {
    expect(content).toContain("investigatePrediction");
  });

  it("imports pollOnce for monitor seeding", () => {
    expect(content).toContain("pollOnce");
  });

  it("imports getBudgetStatus for budget checks", () => {
    expect(content).toContain("getBudgetStatus");
  });

  it("supports --dry-run flag", () => {
    expect(content).toContain("--dry-run");
    expect(content).toContain("DRY_RUN");
  });

  it("supports --monitor flag", () => {
    expect(content).toContain("--monitor");
  });

  it("supports --prediction flag", () => {
    expect(content).toContain("--prediction");
  });

  it("supports --all flag", () => {
    expect(content).toContain("--all");
  });

  it("checks budget before each investigation", () => {
    // Should check budget remaining before spending
    expect(content).toContain("budget.remaining");
  });

  it("has TOKEN_TARGETS array for configurable targets", () => {
    expect(content).toContain("TOKEN_TARGETS");
  });

  it("has PM_TARGETS array for configurable targets", () => {
    expect(content).toContain("PM_TARGETS");
  });

  it("reports results with case ID and verdict", () => {
    expect(content).toContain("report.caseId");
    expect(content).toContain("report.verdict");
    expect(content).toContain("report.suspicionScore");
  });
});

describe("seed-demo npm script", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
  );

  it("has seed-demo script in package.json", () => {
    expect(pkg.scripts["seed-demo"]).toBeDefined();
    expect(pkg.scripts["seed-demo"]).toContain("seed-demo.ts");
  });
});
