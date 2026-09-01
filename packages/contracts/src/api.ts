import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VALIDATION_FAILED",
  "AI_UNAVAILABLE",
  "TOO_MANY_REQUESTS",
  "INTERNAL_ERROR",
]);

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().optional(),
    details: z.array(z.object({
      path: z.string(),
      message: z.string(),
    })).optional(),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
  environment: z.enum(["test", "production"]),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  status: z.literal("ready"),
  service: z.literal("api"),
  environment: z.enum(["test", "production"]),
  dependencies: z.object({
    database: z.literal("ok"),
  }),
  timestamp: z.string().datetime(),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
