import Queue, { Job } from 'bull';
import { sendNotification } from '../bot/notifications';
import { NotificationJobSchema, NotificationJob } from '../types/schemas';

const queueRedisOpts = {
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
};
if (process.env.REDIS_PASSWORD) queueRedisOpts.password = process.env.REDIS_PASSWORD;
if (process.env.REDIS_USER) queueRedisOpts.username = process.env.REDIS_USER;

export const notificationQueue = new Queue('notificationQueue', { redis: queueRedisOpts });

// Process notifications from the queue
notificationQueue.process(async (job: { data: NotificationJob }) => {
  const parsed = NotificationJobSchema.parse(job.data);
  await sendNotification(parsed.userId, parsed.message);
});

// Function to add a notification to the queue
export const addNotificationToQueue = (userId: string, message: string) => {
  const validated = NotificationJobSchema.parse({ userId, message });
  notificationQueue.add(validated);
};

export const getNotificationQueueCounts = async () => {
  try {
    const counts = await notificationQueue.getJobCounts();
    return counts;
  } catch (err) {
    console.warn('Failed to get queue counts:', err);
    return null;
  }
};

// Function to add tracking requests to the queue (placeholder)
export const addTrackingRequestToQueue = (link: string) => {
  // Optionally validate link with zod in the future
};