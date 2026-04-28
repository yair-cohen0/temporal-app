import { z } from 'zod';

const durationSchema = z.union([z.string(), z.number()]);

export const retryPolicySchema = z.object({
  initialInterval: durationSchema.optional(),
  backoffCoefficient: z.number().optional(),
  maximumInterval: durationSchema.optional(),
  maximumAttempts: z.number().int().optional(),
  nonRetryableErrorTypes: z.array(z.string()).optional(),
}).optional();

export const startBodySchema = z.object({
  workflowId: z.string().min(1),
  taskQueue: z.string().min(1),
  args: z.array(z.unknown()).default([]),
  searchAttributes: z.record(z.unknown()).optional(),
  memo: z.record(z.unknown()).optional(),
  workflowExecutionTimeout: z.string().optional(),
  workflowRunTimeout: z.string().optional(),
  workflowTaskTimeout: z.string().optional(),
  workflowIdReusePolicy: z.string().optional(),
  retryPolicy: retryPolicySchema,
  cronSchedule: z.string().optional(),
});

export const signalBodySchema = z.object({
  runId: z.string().optional(),
  args: z.array(z.unknown()).default([]),
});

export const queryBodySchema = z.object({
  runId: z.string().optional(),
  args: z.array(z.unknown()).default([]),
});

export const cancelBodySchema = z.object({
  runId: z.string().optional(),
  reason: z.string().optional(),
});

export const terminateBodySchema = z.object({
  runId: z.string().optional(),
  reason: z.string().optional(),
  details: z.array(z.unknown()).optional(),
});

export const resetBodySchema = z.object({
  runId: z.string().optional(),
  eventId: z.number().int().positive(),
  reason: z.string().min(1),
  resetReapplyType: z.string().optional(),
});

export const listQuerySchema = z.object({
  query: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).default(100),
  nextPageToken: z.string().optional(),
});

export const historyQuerySchema = z.object({
  runId: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).optional(),
  nextPageToken: z.string().optional(),
  eventFilterType: z.enum(['ALL_EVENT', 'CLOSE_EVENT']).optional(),
});
