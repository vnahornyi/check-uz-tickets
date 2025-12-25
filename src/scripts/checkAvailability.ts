import { chromium } from "playwright";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const checkTicketAvailability = async (link: string): Promise<boolean> => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "uk-UA",
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  try {
    const maxNavAttempts = 3;
    for (let i = 1; i <= maxNavAttempts; i++) {
      try {
        await page.goto(link, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        break;
      } catch (e) {
        if (i < maxNavAttempts) await sleep(2000 * i);
        else throw e;
      }
    }

    await page.waitForTimeout(3000);

    const isAvailable = await page.evaluate(
      () => !!document.querySelector(".BadgeTrainLabels")
    );
    await page.close();
    await context.close();
    await browser.close();
    return isAvailable;
  } catch (err) {
    try {
      await page.close();
    } catch (_) {}
    try {
      await context.close();
    } catch (_) {}
    try {
      await browser.close();
    } catch (_) {}
    console.error("checkTicketAvailability error for", link, err);
    return false;
  }
};

// Put the URL you want to check here (local runs)
const LINK =
  "https://booking.uz.gov.ua/search-trips/2200200/2218217/list?startDate=2025-12-31";

const main = async () => {
  const link = LINK;
  if (!link) {
    console.error(
      "Edit src/scripts/checkAvailability.ts and set the LINK constant to your URL."
    );
    process.exit(2);
  }

  console.log("Checking:", link);
  const res = await checkTicketAvailability(link);
  console.log(JSON.stringify({ link, hasTickets: res }));
  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
