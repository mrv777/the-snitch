import fs from "fs";
import path from "path";

export type CardVariant = "forensic" | "timeline";

const IMAGES_DIR = path.join(process.cwd(), "public", "images");

function ensureDir(): void {
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }
}

function sanitizeCaseId(caseId: string): string {
  return caseId.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
}

export function getImagePath(caseId: string, variant: CardVariant): string {
  return path.join(IMAGES_DIR, `${sanitizeCaseId(caseId)}_${variant}.png`);
}

export function getImageUrl(caseId: string, variant: CardVariant): string {
  // Serve via the API route — Next.js standalone doesn't serve
  // runtime-generated files from the public/ volume as static assets
  if (variant === "forensic") {
    return `/api/og/${encodeURIComponent(caseId)}`;
  }
  return `/api/og/${encodeURIComponent(caseId)}?variant=${variant}`;
}

export function saveImage(
  caseId: string,
  variant: CardVariant,
  buffer: Buffer | Uint8Array
): string {
  ensureDir();
  const filePath = getImagePath(caseId, variant);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

export function imageExists(caseId: string, variant: CardVariant): boolean {
  return fs.existsSync(getImagePath(caseId, variant));
}

export function deleteImages(caseId: string): void {
  for (const variant of ["forensic", "timeline"] as const) {
    const p = getImagePath(caseId, variant);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      // ignore
    }
  }
}
