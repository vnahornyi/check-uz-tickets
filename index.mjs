#!/usr/bin/env node
import process from "process";
import { chromium } from "playwright";
import { exec } from "node:child_process";

const URL =
  "https://booking.uz.gov.ua/search-trips/2200200/2218217/list?startDate=2026-01-04"; // Paste the URL you want to monitor here
const INTERVAL = 60_000;

function now() {
  return new Date().toISOString();
}

async function checkOnce(context, attempt) {
  let page;
  const start = Date.now();
  try {
    console.log(`${now()} [#${attempt}] - creating page`);
    page = await context.newPage();

    console.log(`${now()} [#${attempt}] - navigating to ${URL}`);
    const navStart = Date.now();

    // Try navigation with retries inside the check to handle transient timeouts
    const maxNavAttempts = 3;
    let response = null;
    for (let i = 1; i <= maxNavAttempts; i++) {
      try {
        response = await page.goto(URL, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        console.log(
          `${now()} [#${attempt}] - navigation attempt ${i} succeeded`
        );
        break;
      } catch (e) {
        console.warn(
          `${now()} [#${attempt}] - navigation attempt ${i} failed: ${
            e && e.message ? e.message : e
          }`
        );
        if (i === maxNavAttempts) throw e;
        // small backoff
        await new Promise((r) => setTimeout(r, 2000 * i));
      }
    }

    const navDuration = Date.now() - navStart;
    const status = response ? response.status() : "no-response";
    console.log(
      `${now()} [#${attempt}] - navigation finished, status=${status}, took ${navDuration}ms`
    );

    // wait a short time for client-side rendering to settle
    try {
      await page.waitForTimeout(1500);
    } catch {}

    const content = await page.content();
    console.log(
      `${now()} [#${attempt}] - page content length=${content.length}`
    );

    const hasEmptyState = await page.evaluate(
      () => !!document.querySelector(".EmptyState")
    );
    console.log(`${now()} [#${attempt}] - hasEmptyState=${hasEmptyState}`);

    await page.close();

    const total = Date.now() - start;
    console.log(`${now()} [#${attempt}] - check completed in ${total}ms`);

    if (!hasEmptyState) {
      console.log(`${now()} [#${attempt}] - квитки знайдено`);
      try {
        await context.close();
      } catch {}

      // Open the monitored URL in the user's default browser (macOS `open`)
      try {
        exec(`open "${URL}"`, (err) => {
          if (err)
            console.error(
              `${now()} - failed to open URL in browser:`,
              err && err.message ? err.message : err
            );
        });
      } catch (e) {
        console.error(
          `${now()} - error while trying to open URL:`,
          e && e.message ? e.message : e
        );
      }

      setInterval(() => {
        exec(
          `osascript -e 'display notification "КВИТКИ ЗНАЙДЕНО" with title "УКРЗАЛІЗНИЦЯ" sound name "Glass"'`
        );
      }, 2000);
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(
      `${now()} [#${attempt}] - error after ${elapsed}ms:`,
      err && err.message ? err.message : err
    );
    if (page)
      try {
        await page.close();
      } catch (e) {
        console.error(
          `${now()} [#${attempt}] - error closing page:`,
          e && e.message ? e.message : e
        );
      }
  }
}

(async () => {
  console.log(`${now()} - launching browser`);
  const browserStart = Date.now();
  const browser = await chromium.launch({ headless: true });
  console.log(`${now()} - browser launched in ${Date.now() - browserStart}ms`);

  // Create a context with a realistic UA, locale and some headers to avoid basic bot checks
  const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const context = await browser.newContext({
    userAgent,
    locale: "uk-UA",
    viewport: { width: 1280, height: 800 },
  });
  await context.setExtraHTTPHeaders({
    "accept-language": "uk-UA,ru;q=0.9,en;q=0.8",
  });

  // try to hide webdriver flag from simple bot checks
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
    } catch (e) {}
    try {
      window.navigator.chrome = { runtime: {} };
    } catch (e) {}
    try {
      Object.defineProperty(navigator, "languages", {
        get: () => ["uk-UA", "uk", "ru", "en"],
      });
    } catch (e) {}
  });

  // abort loading heavy resources to speed up load and avoid unnecessary waits
  await context.route("**/*", (route) => {
    const request = route.request();
    const resource = request.resourceType();
    if (
      resource === "image" ||
      resource === "stylesheet" ||
      resource === "font"
    ) {
      return route.abort();
    }
    return route.continue();
  });

  console.log(`${now()} - starting ticket watcher for ${URL}`);

  let attempt = 1;
  await checkOnce(context, attempt);
  const timer = setInterval(() => {
    attempt += 1;
    console.log(
      `${now()} - scheduled next check (#${attempt}) in ${INTERVAL}ms`
    );
    checkOnce(context, attempt);
  }, INTERVAL);

  process.on("SIGINT", async () => {
    clearInterval(timer);
    try {
      await context.close();
      console.log(`${now()} - context closed`);
    } catch (e) {
      console.error(
        `${now()} - error closing context:`,
        e && e.message ? e.message : e
      );
    }
    try {
      await browser.close();
      console.log(`${now()} - browser closed`);
    } catch (e) {
      console.error(
        `${now()} - error closing browser:`,
        e && e.message ? e.message : e
      );
    }
    console.log(`${now()} - exiting`);
    process.exit(0);
  });
})();
