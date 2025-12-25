import { Context } from 'telegraf';
import { Pool } from 'pg';
import { getCache, setCache } from '../../redis';
// note: MikroORM manages migrations; no local migration_history table
import { getNotificationQueueCounts } from '../../queue';

// Compute a simple status overview and cache for 60s
export const statusCommand = async (ctx: Context) => {
    const cacheKey = 'status:global';
    try {
        const cached = await getCache<{ text: string }>(cacheKey);
        if (cached) {
            return ctx.reply(cached.text);
        }
    } catch (err) {
        console.warn('Failed to read status cache:', err);
    }

    // compute status
    try {
        const pool = new Pool({
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: Number(process.env.DB_PORT),
        });
        const totalLinksRes = await pool.query('SELECT COUNT(*)::int AS count FROM tracking_links');
        const usersRes = await pool.query('SELECT COUNT(DISTINCT user_id)::int AS count FROM tracking_links');
        await pool.end();

        const totalLinks = totalLinksRes.rows[0]?.count ?? 0;
        const totalUsers = usersRes.rows[0]?.count ?? 0;

        const queueCounts = await getNotificationQueueCounts();
        const queueInfo = queueCounts
            ? `queued=${queueCounts.waiting || 0} active=${queueCounts.active || 0} completed=${queueCounts.completed || 0} failed=${queueCounts.failed || 0}`
            : 'unknown';

        // Also include per-user link statuses when invoked by a user
        let text = `Статус:
    Посилань для відстеження: ${totalLinks}
    Користувачів: ${totalUsers}
    Черга повідомлень: ${queueInfo}`;

        // If invoked by a user, show their links
        const callerId = ctx.from?.id;
        if (callerId) {
            try {
                const { getUserLinks } = await import('../../db');
                const links = await getUserLinks(callerId, true);
                if (links.length > 0) {
                    text += `\n\nВаші посилання:\n`;
                    for (const l of links) {
                        const statusEmoji = l.last_status === null ? '⏳' : l.last_status ? '✅' : '❌';
                        const notifiedLabel = l.notified ? '🔔' : '';
                        const lastChecked = l.last_checked_at ? ` (перевірено: ${new Date(l.last_checked_at).toLocaleString()})` : '';
                        text += `${statusEmoji} ${l.link} ${notifiedLabel}${lastChecked}\n`;
                    }
                } else {
                    text += `\n\nУ вас немає посилань для відстеження.`;
                }
            } catch (err) {
                console.warn('Failed to load per-user links for status', err);
            }
        }

        // cache for 60 seconds
        try {
            setCache(cacheKey, { text }, 60);
        } catch (_e) {}

        ctx.reply(text);
    } catch (err) {
        console.error('Failed to compute status:', err);
        ctx.reply('Не вдалося отримати статус.');
    }
};
