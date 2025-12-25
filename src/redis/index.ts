import { RedisClient } from 'redis';
import { NotificationJobSchema, NotificationJob } from '../types/schemas';

const redisOptions = {
    host: process.env.REDIS_HOST || 'redis',
    port: Number(process.env.REDIS_PORT) || 6379,
};
if (process.env.REDIS_PASSWORD) redisOptions.password = process.env.REDIS_PASSWORD;
if (process.env.REDIS_USER) redisOptions.username = process.env.REDIS_USER;

export const redisClient = new RedisClient(redisOptions);
redisClient.on('error', (err: unknown) => console.warn('Redis client error', err));

// Simple per-user ephemeral state helpers (store JSON)
export const setUserState = (userId: string, state: Record<string, unknown>) => {
    try {
        redisClient.set(`user:${userId}:state`, JSON.stringify(state));
    } catch (err) {
        console.warn('Failed to set user state', err);
    }
};

export const getUserState = (userId: string): Promise<Record<string, unknown> | null> => {
    return new Promise((resolve) => {
        redisClient.get(`user:${userId}:state`, (err: Error | null, reply: string | null) => {
            if (err) {
                console.warn('Failed to get user state', err);
                return resolve(null);
            }
            if (!reply) return resolve(null);
            try {
                resolve(JSON.parse(reply));
            } catch (_e) {
                resolve(null);
            }
        });
    });
};

export const clearUserState = (userId: string) => {
    try {
        redisClient.del(`user:${userId}:state`);
    } catch (err) {
        console.warn('Failed to clear user state', err);
    }
};

export const setTrackingLink = (userId: string, link: string) => {
    redisClient.hset(`user:${userId}`, 'trackingLink', link);
};

export const getTrackingLink = (userId: string) => {
    return new Promise<string | null>((resolve, reject) => {
        redisClient.hget(`user:${userId}`, 'trackingLink', (err: Error | null, link: string | null) => {
            if (err) {
                return reject(err);
            }
            resolve(link);
        });
    });
};

export const removeTrackingLink = (userId: string) => {
    redisClient.hdel(`user:${userId}`, 'trackingLink');
};

export const setQueue = (queueName: string, data: unknown) => {
    // try to validate as NotificationJob; if invalid, still store as-is
    try {
        NotificationJobSchema.parse(data);
    } catch (_err) {
        // ignore validation error, still store
    }
    redisClient.lpush(queueName, JSON.stringify(data));
};

export const getQueue = (queueName: string): Promise<NotificationJob[]> => {
    return new Promise<NotificationJob[]>((resolve, reject) => {
        redisClient.lrange(queueName, 0, -1, (err: Error | null, items: string[] | null) => {
            if (err) {
                return reject(err);
            }
            if (!items) return resolve([]);
            const parsed: NotificationJob[] = items.map((item: string) => {
                try {
                    const obj = JSON.parse(item);
                    const parsed = NotificationJobSchema.safeParse(obj);
                    return parsed.success ? parsed.data : null;
                } catch (_e) {
                    return null;
                }
            }).filter((x): x is NotificationJob => x !== null);
            resolve(parsed);
        });
    });
};

// Simple cache helpers with TTL (seconds)
export const setCache = (key: string, value: unknown, ttlSeconds = 60) => {
    const str = JSON.stringify(value);
    if (ttlSeconds > 0) {
        redisClient.setex(key, ttlSeconds, str);
    } else {
        redisClient.set(key, str);
    }
};

export const getCache = <T = unknown>(key: string): Promise<T | null> => {
    return new Promise<T | null>((resolve, reject) => {
        redisClient.get(key, (err: Error | null, reply: string | null) => {
            if (err) return reject(err);
            if (!reply) return resolve(null);
            try {
                resolve(JSON.parse(reply) as T);
            } catch (_e) {
                resolve(null);
            }
        });
    });
};
