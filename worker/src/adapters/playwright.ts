// ============================================================
// worker/src/adapters/playwright.ts
//
// Pluggable headless browser adapter built on Playwright.
//
// DESIGN INTENT:
//   This adapter is intentionally decoupled from BullMQ and
//   from any specific business domain. Any worker can import
//   it — or you can remove it entirely if your product does
//   not need browser automation.
//
// USAGE:
//   import { generatePdf, takeScreenshot, withPage } from "./adapters/playwright";
//
//   // Generate a PDF from a URL
//   const pdfBuffer = await generatePdf("https://example.com/invoice/123");
//
//   // Use a raw page for custom logic
//   const result = await withPage(async (page) => {
//     await page.goto("https://example.com");
//     return page.title();
//   });
// ============================================================

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";

// ---------------------------------------------------------------------------
// Launch flags — hardened for rootless containers and VPS environments.
// These are NOT optional in Docker. Without --no-sandbox the browser crashes.
// ---------------------------------------------------------------------------
const CHROMIUM_ARGS = [
  "--no-sandbox",                  // Required in Docker — no OS-level sandbox available
  "--disable-setuid-sandbox",      // Required alongside --no-sandbox
  "--disable-dev-shm-usage",       // /dev/shm is often too small in containers (64MB default)
  "--disable-gpu",                 // No GPU in headless VPS, avoids renderer crashes
  "--disable-extensions",          // No extensions needed
  "--disable-background-networking",
  "--disable-sync",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-translate",
  "--hide-scrollbars",
  "--mute-audio",
  "--single-process",              // Reduces memory footprint on constrained VPS
];

// ---------------------------------------------------------------------------
// Internal browser singleton.
// The browser is launched once and shared across jobs.
// It is closed on SIGTERM by the calling worker.
// ---------------------------------------------------------------------------
let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!_browser || !_browser.isConnected()) {
    _browser = await chromium.launch({
      headless: true,
      args: CHROMIUM_ARGS,
    });
  }
  return _browser;
}

/**
 * Close the browser instance. Call this during graceful shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

// ---------------------------------------------------------------------------
// withPage — low-level primitive
//
// Opens a new browser context + page, runs your callback, then cleans up.
// Each job gets a fresh isolated context (separate cookies, storage, etc).
// ---------------------------------------------------------------------------
export async function withPage<T>(
  fn: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    // Emulate a real browser so sites don't block headless detection
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    // Disable permissions prompts
    permissions: [],
  });

  const page = await context.newPage();

  try {
    return await fn(page, context);
  } finally {
    await context.close(); // Always clean up — prevents context/memory leaks
  }
}

// ---------------------------------------------------------------------------
// generatePdf — primary adapter export for PDF workers
// ---------------------------------------------------------------------------
export interface PdfOptions {
  /** Puppeteer/Playwright paper format: "A4", "Letter", etc. */
  format?: "A4" | "Letter" | "A3" | "Tabloid";
  /** Include background graphics (page colours, etc.) */
  printBackground?: boolean;
  /** Margin in CSS units, e.g. "1cm" or "0.5in" */
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  /** Wait until the network is idle before capturing — useful for SPAs */
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  /** Max time to wait for page load in ms. Default: 30s */
  timeout?: number;
}

/**
 * Navigate to a URL and return the rendered page as a PDF buffer.
 *
 * @param url    - The full URL to render (must be reachable from the container network)
 * @param opts   - PDF options (format, margins, etc.)
 * @returns      - Raw PDF bytes as a Buffer
 */
export async function generatePdf(url: string, opts: PdfOptions = {}): Promise<Buffer> {
  return withPage(async (page) => {
    await page.goto(url, {
      waitUntil: opts.waitUntil ?? "networkidle",
      timeout: opts.timeout ?? 30_000,
    });

    const pdf = await page.pdf({
      format: opts.format ?? "A4",
      printBackground: opts.printBackground ?? true,
      margin: opts.margin ?? { top: "1cm", bottom: "1cm", left: "1cm", right: "1cm" },
    });

    return Buffer.from(pdf);
  });
}

// ---------------------------------------------------------------------------
// takeScreenshot — secondary adapter export
// ---------------------------------------------------------------------------
export interface ScreenshotOptions {
  fullPage?: boolean;
  type?: "png" | "jpeg";
  quality?: number; // 0-100, jpeg only
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  timeout?: number;
}

/**
 * Navigate to a URL and return a screenshot as a Buffer.
 */
export async function takeScreenshot(url: string, opts: ScreenshotOptions = {}): Promise<Buffer> {
  return withPage(async (page) => {
    await page.goto(url, {
      waitUntil: opts.waitUntil ?? "networkidle",
      timeout: opts.timeout ?? 30_000,
    });

    const screenshot = await page.screenshot({
      fullPage: opts.fullPage ?? true,
      type: opts.type ?? "png",
      quality: opts.type === "jpeg" ? (opts.quality ?? 85) : undefined,
    });

    return Buffer.from(screenshot);
  });
}
