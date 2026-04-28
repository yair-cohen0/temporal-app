import { Request } from 'express';
import { z } from 'zod';
import { AppError } from '../shared/errors';
import { getWorkflowClient } from '../shared/temporalClient';

export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Request validation failed', 400, result.error.issues);
  }
  return result.data;
}

export function parseQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Query parameter validation failed', 400, result.error.issues);
  }
  return result.data;
}

/** Cast req.params value to string (Express v5 types params as string | string[]; route params are always string). */
export function param(req: Request, name: string): string {
  return req.params[name] as string;
}

export function grpcSvc(client: Awaited<ReturnType<typeof getWorkflowClient>>): any {
  return client.workflowService;
}

export function notFound(workflowId: string): AppError {
  return new AppError('NOT_FOUND', `Workflow "${workflowId}" not found`, 404);
}
