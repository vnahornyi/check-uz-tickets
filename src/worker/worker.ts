import { Client as PgClient } from "pg";
import fs from "fs";
import path from "path";
import { addNotificationToQueue } from "../queue/index";
import { getUserLinks } from "../db/index";
import { TrackMessageSchema } from "../types/schemas";
import { chromium, Browser } from "playwright";
import { redisClient } from "../redis/index";
import { createClient } from 'redis';

// subscriber client is `redisClient` (from shared module) — create a separate publisher client
const pubClient = createClient({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
});
pubClient.on('error', (err: unknown) => console.warn('Redis publisher error', err));

const pgClient = new PgClient({
  connectionString: process.env.DATABASE_URL,
});

pgClient.connect();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface UserLink {
  link: string;
}

let sharedBrowser: Browser | null = null;
const getBrowser = async () => {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch({ headless: true });
  }
  return sharedBrowser;
};

const checkTicketAvailability = async (link: string): Promise<boolean> => {
  // Return true if EmptyState present (no tickets), false if tickets found
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "uk-UA",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    // Try navigation with a few attempts to handle transient failures
    const maxNavAttempts = 3;
    let lastErr: any = null;
    let response = null;
    for (let i = 1; i <= maxNavAttempts; i++) {
      try {
        response = await page.goto(link, {
          waitUntil: "domcontentloaded",
          timeout: 120_000,
        });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;

        if (e instanceof Error) {
          console.warn(
            `nav attempt ${i} failed for ${link}:`,
            e && e.message ? e.message : e
          );
        }

        if (i < maxNavAttempts)
          await new Promise((r) => setTimeout(r, 2000 * i));
      }
    }

    // give client-side scripts a moment
    try {
      await page.waitForTimeout(1500);
    } catch {}

    const hasEmpty = await page.evaluate(
      () => !!document.querySelector(".EmptyState")
    );
    await page.close();
    await context.close();
    return hasEmpty;
  } catch (err) {
    try {
      await page.close();
    } catch (_) {}
    try {
      await context.close();
    } catch (_) {}
    console.error("checkTicketAvailability error for", link, err);
    // on error, conservatively treat as empty (no tickets)
    return true;
  }
};

const logRetry = (
  userId: string | number,
  link: string,
  attempt: number,
  result: boolean
) => {
  const logMsg = `[${new Date().toISOString()}] userId=${userId} link=${link} attempt=${attempt} EmptyState=${result}\n`;
  fs.appendFileSync(path.join(__dirname, "retry_audit.log"), logMsg);
};

const trackLinks = async (userId: string | number) => {
  // fetch links excluding those already notified and those temporarily ignored
  const links = await getUserLinks(userId, false, false);
  for (const l of links) {
    const linkId = l.id;
    const link = l.link;
    // skip already-notified
    if (l.notified) continue;
    let emptyState = true;
    for (let attempt = 1; attempt <= 3; attempt++) {
      emptyState = await checkTicketAvailability(link);
      logRetry(userId, link, attempt, emptyState);
      if (attempt < 3) await sleep(3000);
    }
    // persist last check
    try {
      await (await import('../db')).markLinkChecked(linkId, emptyState);
    } catch (err) {
      console.warn('Failed to mark link checked', linkId, err);
    }
    if (!emptyState) {
      addNotificationToQueue(
        userId.toString(),
        `🎟️ Квитки знайдено для вашого посилання: ${link} \nПеревірте сайт!`
      );
      try {
        await (await import('../db')).markLinkNotified(linkId);
      } catch (err) {
        console.warn('Failed to mark link notified', linkId, err);
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
const TRACK_INTERVAL_SECONDS = Number(process.env.TRACK_INTERVAL_SECONDS) || 180;

const schedulePeriodicScan = () => {
  const run = async () => {
    try {
      const resetHours = Number(process.env.RESET_NOTIFIED_HOURS) || 24;
      const resetRes = await pgClient.query(
        `UPDATE tracking_links SET notified = false WHERE notified = true AND last_checked_at IS NOT NULL AND last_checked_at < NOW() - INTERVAL '${resetHours} hours'`
      );
      if (resetRes.rowCount && resetRes.rowCount > 0) {
        console.log(`Reset notified flag for ${resetRes.rowCount} links older than ${resetHours} hours`);
      }
    } catch (err) {
      console.warn('Failed to reset notified flags', err);
    }

    try {
      const res = await pgClient.query(
        'SELECT DISTINCT u.telegram_id FROM users u JOIN tracking_links t ON t.user_id = u.id'
      );
      if (res.rows.length === 0) return;
      console.log(`Periodic scan: publishing trackLinks for ${res.rows.length} users`);
      for (const row of res.rows) {
        const userId = row.telegram_id;
        try {
          pubClient.publish('trackLinks', JSON.stringify({ userId }));
        } catch (err) {
          console.warn('Failed to publish trackLinks for user', userId, err);
        }
      }
    } catch (err) {
      console.error('Periodic scan error', err);
    }
  };

  // run immediately, then on interval
  run();
  setInterval(run, TRACK_INTERVAL_SECONDS * 1000);
};

schedulePeriodicScan();
