import type { Browser } from "puppeteer";

let browserPromise: Promise<Browser> | undefined;

async function getBrowser(): Promise<Browser> {
  const { default: puppeteer } = await import("puppeteer");
  browserPromise ??= puppeteer.launch({
    headless: true,
    // Debian's own chromium package (installed via apt in the Dockerfile),
    // not Puppeteer's bundled download — undefined locally, where Puppeteer
    // falls back to whatever browser it downloaded itself.
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    // The container drops all Linux capabilities (cap_drop: ALL) and runs as
    // a non-root user, so Chromium's own setuid sandbox can't initialize —
    // isolation instead comes from the container boundary itself.
    // --disable-dev-shm-usage avoids renderer crashes on Docker's default
    // 64MB /dev/shm.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  return browserPromise;
}

export async function renderHtmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
  } finally {
    await page.close();
  }
}
