import { Client as PgClient } from "pg";
import fs from "fs";
import path from "path";
import { addNotificationToQueue } from "../queue/index";
import { getUserLinks } from "../db/index";
import { TrackMessageSchema } from "../types/schemas";
import { chromium, Browser } from "playwright";
import { redisClient } from "../redis/index";
import { createClient } from "redis";

// subscriber client is `redisClient` (from shared module) — create a separate publisher client
const pubClient = createClient({
  url: process.env.REDIS_URL,
});
pubClient.on("error", (err: unknown) =>
  console.warn("Redis publisher error", err)
);

const pgClient = new PgClient({
  connectionString: process.env.DATABASE_URL,
});

pgClient.connect();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        if (i < maxNavAttempts) await sleep(2000);
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
    console.error("checkTicketAvailability error for", link, err);
    // on error, conservatively treat as empty (no tickets)
    return false;
  }
};

const logRetry = (
  userId: string | number,
  link: string,
  attempt: number,
  result: boolean
) => {
  const logMsg = `[${new Date().toISOString()}] userId=${userId} link=${link} attempt=${attempt} HasCard=${result}\n`;
  fs.appendFileSync(path.join(__dirname, "retry_audit.log"), logMsg);
};

const trackLinks = async (userId: string | number) => {
  // fetch links excluding those already notified and those temporarily ignored
  const links = await getUserLinks(userId, false, false);
  for (const l of links) {
    const linkId = l.id;
    const link = l.link;

    let hasTickets = Boolean(l.last_status);
    hasTickets = await checkTicketAvailability(link);
    logRetry(userId, link, 1, hasTickets);
    // persist last check
    try {
      await (await import("../db")).markLinkChecked(linkId, hasTickets);
    } catch (err) {
      console.warn("Failed to mark link checked", linkId, err);
    }
    if (hasTickets && !l.notified) {
      try {
        addNotificationToQueue(
          userId.toString(),
          `🎟️ Квитки знайдено для вашого посилання: ${link} \nПеревірте сайт!`
        );
        console.log(
          `Enqueued notification for user=${userId} linkId=${linkId}`
        );
      } catch (err) {
        console.warn("Failed to enqueue notification for", userId, linkId, err);
      }
      try {
        await (await import("../db")).markLinkNotified(linkId);
      } catch (err) {
        console.warn("Failed to mark link notified", linkId, err);
      }
    }
  }
};

const startTracking = () => {
  redisClient.on("message", (_channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message);
      const validated = TrackMessageSchema.parse(parsed);
      trackLinks(validated.userId);
    } catch (err) {
      console.error("Invalid message on trackLinks channel", err, message);
    }
  });
  redisClient.subscribe("trackLinks");
};

startTracking();

// Periodic scanner: every N seconds publish a `trackLinks` message for each user
// Default to 3 minutes (180 seconds) between periodic scans
const TRACK_INTERVAL_SECONDS =
  Number(process.env.TRACK_INTERVAL_SECONDS) || 180;

const schedulePeriodicScan = () => {
  const run = async () => {
    try {
      const resetHours = Number(process.env.RESET_NOTIFIED_HOURS) || 24;
      const resetRes = await pgClient.query(
        `UPDATE tracking_links SET notified = false WHERE notified = true AND last_checked_at IS NOT NULL AND last_checked_at < NOW() - INTERVAL '${resetHours} hours'`
      );
      if (resetRes.rowCount && resetRes.rowCount > 0) {
        console.log(
          `Reset notified flag for ${resetRes.rowCount} links older than ${resetHours} hours`
        );
      }
    } catch (err) {
      console.warn("Failed to reset notified flags", err);
    }

    try {
      const res = await pgClient.query(
        "SELECT DISTINCT u.telegram_id FROM users u JOIN tracking_links t ON t.user_id = u.id"
      );
      if (res.rows.length === 0) return;
      console.log(
        `Periodic scan: publishing trackLinks for ${res.rows.length} users`
      );
      for (const row of res.rows) {
        const userId = row.telegram_id;
        try {
          pubClient.publish("trackLinks", JSON.stringify({ userId }));
        } catch (err) {
          console.warn("Failed to publish trackLinks for user", userId, err);
        }
      }
    } catch (err) {
      console.error("Periodic scan error", err);
    }
  };

  // run immediately, then on interval
  run();
  setInterval(run, TRACK_INTERVAL_SECONDS * 1000);
};

schedulePeriodicScan();
