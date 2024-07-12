import {z} from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
});

export type User = z.infer<typeof UserSchema>;

export const SessionDataSchema = z.object({
  user: UserSchema.optional(),
});

export type SessionData = z.infer<typeof SessionDataSchema>;
