import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  getImagePath,
  getImageUrl,
  saveImage,
  imageExists,
  deleteImages,
} from "@/lib/image/storage";

const TEST_CASE_ID = "case-20260323-test";
const IMAGES_DIR = path.join(process.cwd(), "public", "images");

// Minimal 1x1 PNG buffer for testing
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

describe("image/storage", () => {
  afterEach(() => {
    // Clean up any test images
    try {
      deleteImages(TEST_CASE_ID);
    } catch {
      // ignore
    }
  });

  describe("getImagePath", () => {
    it("returns correct path for forensic variant", () => {
      const p = getImagePath(TEST_CASE_ID, "forensic");
      expect(p).toBe(
        path.join(IMAGES_DIR, "case-20260323-test_forensic.png")
      );
    });

    it("returns correct path for timeline variant", () => {
      const p = getImagePath(TEST_CASE_ID, "timeline");
      expect(p).toBe(
        path.join(IMAGES_DIR, "case-20260323-test_timeline.png")
      );
    });

    it("sanitizes special characters in caseId", () => {
      const p = getImagePath("case/with spaces&chars!", "forensic");
      expect(p).toMatch(/case_with_spaces_chars__forensic\.png$/);
    });
  });

  describe("getImageUrl", () => {
    it("returns API route URL for forensic variant (default)", () => {
      const url = getImageUrl(TEST_CASE_ID, "forensic");
      expect(url).toBe(`/api/og/${encodeURIComponent(TEST_CASE_ID)}`);
    });

    it("includes variant param for timeline", () => {
      const url = getImageUrl(TEST_CASE_ID, "timeline");
      expect(url).toBe(
        `/api/og/${encodeURIComponent(TEST_CASE_ID)}?variant=timeline`
      );
    });
  });

  describe("saveImage / imageExists / deleteImages", () => {
    it("saves, detects, and deletes an image", () => {
      expect(imageExists(TEST_CASE_ID, "forensic")).toBe(false);

      const savedPath = saveImage(TEST_CASE_ID, "forensic", TINY_PNG);
      expect(savedPath).toBe(getImagePath(TEST_CASE_ID, "forensic"));
      expect(imageExists(TEST_CASE_ID, "forensic")).toBe(true);
      expect(fs.existsSync(savedPath)).toBe(true);

      // Verify the file content is correct
      const contents = fs.readFileSync(savedPath);
      expect(contents.length).toBe(TINY_PNG.length);

      deleteImages(TEST_CASE_ID);
      expect(imageExists(TEST_CASE_ID, "forensic")).toBe(false);
    });

    it("saves both variants independently", () => {
      saveImage(TEST_CASE_ID, "forensic", TINY_PNG);
      saveImage(TEST_CASE_ID, "timeline", TINY_PNG);

      expect(imageExists(TEST_CASE_ID, "forensic")).toBe(true);
      expect(imageExists(TEST_CASE_ID, "timeline")).toBe(true);

      deleteImages(TEST_CASE_ID);
      expect(imageExists(TEST_CASE_ID, "forensic")).toBe(false);
      expect(imageExists(TEST_CASE_ID, "timeline")).toBe(false);
    });

    it("creates images directory if it doesn't exist", () => {
      // saveImage should handle missing directory
      const savedPath = saveImage(TEST_CASE_ID, "forensic", TINY_PNG);
      expect(fs.existsSync(savedPath)).toBe(true);
    });
  });
});
