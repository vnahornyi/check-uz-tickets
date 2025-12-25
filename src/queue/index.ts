import Queue, { Job } from 'bull';
import { sendNotification } from '../bot/notifications';
import { NotificationJobSchema, NotificationJob } from '../types/schemas';

export const notificationQueue = new Queue('notificationQueue', process.env.REDIS_URL);

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