import { z } from "zod";

export const platformRoleSchema = z.enum(["employee", "maintainer", "admin"]);
export const userStatusSchema = z.enum(["invited", "active", "disabled"]);

export const passwordSchema = z.string()
  .min(12, "密码至少需要 12 个字符")
  .max(128, "密码不能超过 128 个字符")
  .regex(/[A-Za-z]/, "密码至少包含一个英文字母")
  .regex(/[0-9]/, "密码至少包含一个数字");

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  account: z.string(),
  displayName: z.string(),
  departmentId: z.string().uuid().nullable(),
  jobFunctionId: z.string().uuid().nullable(),
  role: platformRoleSchema,
  status: userStatusSchema,
  mustChangePassword: z.boolean(),
});

export const activateAccountRequestSchema = z.object({
  activationToken: z.string().min(32),
  password: passwordSchema,
});

export const loginRequestSchema = z.object({
  account: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(128),
});

export const authResponseSchema = z.object({
  user: userProfileSchema,
});

export const importUserSchema = z.object({
  account: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(100),
  departmentId: z.string().uuid().nullable().optional(),
  jobFunctionId: z.string().uuid().nullable().optional(),
  role: platformRoleSchema.default("employee"),
});

export const importUsersRequestSchema = z.object({
  organizationId: z.string().uuid(),
  users: z.array(importUserSchema).min(1).max(500),
});

export const importedUserSchema = z.object({
  user: userProfileSchema,
  activationToken: z.string(),
  activationExpiresAt: z.string().datetime(),
});

export const importUsersResponseSchema = z.object({
  imported: z.array(importedUserSchema),
});

export type PlatformRole = z.infer<typeof platformRoleSchema>;
export type UserStatus = z.infer<typeof userStatusSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type ActivateAccountRequest = z.infer<typeof activateAccountRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type ImportUser = z.infer<typeof importUserSchema>;
export type ImportUsersRequest = z.infer<typeof importUsersRequestSchema>;
export type ImportedUser = z.infer<typeof importedUserSchema>;
export type ImportUsersResponse = z.infer<typeof importUsersResponseSchema>;
