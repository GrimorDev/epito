import puppeteer, { type Browser } from "puppeteer";

let browserPromise: Promise<Browser> | undefined;

async function getBrowser(): Promise<Browser> {
  browserPromise ??= puppeteer.launch({
    headless: true,
    // The container drops all Linux capabilities (cap_drop: ALL) and runs as
    // a non-root user, so Chromium's own setuid sandbox can't initialize —
    // isolation instead comes from the container boundary itself.
    // --disable-dev-shm-usage avoids renderer crashes on Docker's default
    // 64MB /dev/shm; --no-sandbox/--disable-setuid-sandbox are required since
    // the container drops all capabilities and runs as a non-root user.
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
