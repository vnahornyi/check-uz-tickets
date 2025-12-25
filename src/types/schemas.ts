import { z } from 'zod';

export const TrackMessageSchema = z.object({
  userId: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

export const NotificationJobSchema = z.object({
  userId: z.string(),
  message: z.string(),
});

export const UserLinkSchema = z.object({
  link: z.string().url(),
});

export type TrackMessage = z.infer<typeof TrackMessageSchema>;
export type NotificationJob = z.infer<typeof NotificationJobSchema>;
export type UserLink = z.infer<typeof UserLinkSchema>;
