import { chromium, type Browser } from "playwright-core";
import { saveImage, type CardVariant } from "./storage";

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  browserInstance = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return browserInstance;
}

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

export async function renderCard(
  caseId: string,
  variant: CardVariant
): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: CARD_WIDTH, height: CARD_HEIGHT });

    // Always use internal HTTP URL — Playwright runs inside the container
    // and can't access the external HTTPS URL through nginx
    const internalBase = "http://localhost:3000";
    const url = `${internalBase}/card-render/${encodeURIComponent(caseId)}?variant=${variant}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });

    // Wait for d3-force graph to settle (if present on forensic cards with graph data)
    try {
      await page.waitForSelector(".graph-ready", { timeout: 5_000 });
    } catch {
      // No graph element or already settled — continue
    }

    const buffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT },
    });

    const filePath = saveImage(caseId, variant, buffer);
    return filePath;
  } finally {
    await page.close();
  }
}

export async function renderBothCards(
  caseId: string
): Promise<{ forensicPath: string; timelinePath: string }> {
  const [forensicPath, timelinePath] = await Promise.all([
    renderCard(caseId, "forensic"),
    renderCard(caseId, "timeline"),
  ]);
  return { forensicPath, timelinePath };
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
