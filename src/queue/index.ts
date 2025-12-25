import Queue from "bull";
import { sendNotification } from "../bot/notifications";
import { NotificationJobSchema, NotificationJob } from "../types/schemas";

export const notificationQueue = new Queue(
  "notificationQueue",
  process.env.REDIS_URL
);

// Process notifications from the queue
notificationQueue.process(async (job: { data: NotificationJob }) => {
  const parsed = NotificationJobSchema.parse(job.data);
  await sendNotification(parsed.userId, parsed.message);
});

// listen for queue-level errors and job failures for better diagnostics
notificationQueue.on("error", (err: unknown) => {
  console.error("notificationQueue error", err);
});
notificationQueue.on("failed", (job: any, err: Error) => {
  try {
    console.error("notification job failed", {
      id: job.id,
      data: job.data,
      err: err && err.message ? err.message : err,
    });
  } catch (e) {
    console.error("notification job failed (unable to stringify job)", e);
  }
});

// Function to add a notification to the queue
export const addNotificationToQueue = (userId: string, message: string) => {
  const validated = NotificationJobSchema.parse({ userId, message });
  try {
    notificationQueue.add(validated);
    console.log("notificationQueue.add called", { userId });
  } catch (err) {
    console.error("Failed to add notification job to queue", err, { userId });
    throw err;
  }
};

export const getNotificationQueueCounts = async () => {
  try {
    const counts = await notificationQueue.getJobCounts();
    return counts;
  } catch (err) {
    console.warn("Failed to get queue counts:", err);
    return null;
  }
};

// Function to add tracking requests to the queue (placeholder)
export const addTrackingRequestToQueue = (link: string) => {
  // Optionally validate link with zod in the future
};
