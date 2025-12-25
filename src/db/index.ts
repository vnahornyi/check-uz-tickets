import { Pool } from 'pg';

export const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
});

export const connect = async (): Promise<void> => {
    try {
        await pool.connect();
        console.log('Connected to the database');
    } catch (error) {
        console.error('Database connection error', error);
        throw error;
    }
};

export const addLinkToDatabase = async (userId: string | number, link: string) => {
    const telegramId = userId.toString();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // ensure user exists in users table
        await client.query('INSERT INTO users (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING', [telegramId]);
        const resUser = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
        if (resUser.rows.length === 0) {
            throw new Error('Failed to ensure user');
        }
        const uid = resUser.rows[0].id;
        const query = 'INSERT INTO tracking_links (user_id, link, notified) VALUES ($1, $2, false) RETURNING *';
        const values = [uid, link];
        const result = await client.query(query, values);
        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

export const removeLinkFromDatabase = async (userId: string | number, link: string) => {
    const telegramId = userId.toString();
    const client = await pool.connect();
    try {
        const resUser = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
        if (resUser.rows.length === 0) return null;
        const uid = resUser.rows[0].id;
        const query = 'DELETE FROM tracking_links WHERE user_id = $1 AND link = $2 RETURNING *';
        const values = [uid, link];
        const result = await client.query(query, values);
        return result.rows[0];
    } finally {
        client.release();
    }
};

export const removeLinkById = async (linkId: number) => {
    const query = 'DELETE FROM tracking_links WHERE id = $1 RETURNING *';
    const res = await pool.query(query, [linkId]);
    return res.rows[0] ?? null;
};

export type LinkRecord = {
    id: number;
    link: string;
    notified: boolean | null;
    last_status: boolean | null;
    last_checked_at: string | null;
    ignore_until?: string | null;
};

export const getUserLinks = async (userId: string | number, includeNotified = true, includeIgnored = true): Promise<LinkRecord[]> => {
    const telegramId = userId.toString();
    const client = await pool.connect();
    try {
        const resUser = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
        if (resUser.rows.length === 0) return [];
        const uid = resUser.rows[0].id;
        // build query parts depending on flags
        const base = 'SELECT id, link, notified, last_status, last_checked_at, ignore_until FROM tracking_links WHERE user_id = $1';
        const conditions: string[] = [];
        if (!includeNotified) conditions.push('(notified IS NULL OR notified = false)');
        if (!includeIgnored) conditions.push('(ignore_until IS NULL OR ignore_until <= NOW())');
        const where = conditions.length > 0 ? `${base} AND ${conditions.join(' AND ')}` : base;
        const values = [uid];
        const result = await client.query(where, values);
        return result.rows as LinkRecord[];
    } finally {
        client.release();
    }
};

export const markLinkChecked = async (linkId: number, lastStatus: boolean) => {
    const query = 'UPDATE tracking_links SET last_status = $1, last_checked_at = NOW() WHERE id = $2';
    await pool.query(query, [lastStatus, linkId]);
};

export const markLinkNotified = async (linkId: number) => {
    const query = 'UPDATE tracking_links SET notified = true WHERE id = $1';
    await pool.query(query, [linkId]);
};

export const disconnect = async (): Promise<void> => {
    await pool.end();
};
