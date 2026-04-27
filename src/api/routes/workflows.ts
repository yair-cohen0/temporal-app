import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  WorkflowExecutionAlreadyStartedError,
  WorkflowNotFoundError,
  RetryPolicy,
} from '@temporalio/client';
import { getWorkflowClient } from '../../shared/temporalClient';
import { config } from '../../shared/config';
import { AppError, buildErrorEnvelope } from '../../shared/errors';

export const workflowRouter = Router();

// --- Validation schemas ---

// Duration in Temporal is string | number (ms). Accept both.
const durationSchema = z.union([z.string(), z.number()]);

const retryPolicySchema = z.object({
  initialInterval: durationSchema.optional(),
  backoffCoefficient: z.number().optional(),
  maximumInterval: durationSchema.optional(),
  maximumAttempts: z.number().int().optional(),
  nonRetryableErrorTypes: z.array(z.string()).optional(),
}).optional();

const startBodySchema = z.object({
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

const signalBodySchema = z.object({
  runId: z.string().optional(),
  args: z.array(z.unknown()).default([]),
});

const queryBodySchema = z.object({
  runId: z.string().optional(),
  args: z.array(z.unknown()).default([]),
});

const cancelBodySchema = z.object({
  runId: z.string().optional(),
  reason: z.string().optional(),
});

const terminateBodySchema = z.object({
  runId: z.string().optional(),
  reason: z.string().optional(),
  details: z.array(z.unknown()).optional(),
});

const resetBodySchema = z.object({
  runId: z.string().optional(),
  eventId: z.number().int().positive(),
  reason: z.string().min(1),
  resetReapplyType: z.string().optional(),
});

const listQuerySchema = z.object({
  query: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).default(100),
  nextPageToken: z.string().optional(),
});

const historyQuerySchema = z.object({
  runId: z.string().optional(),
  pageSize: z.coerce.number().int().min(1).max(1000).optional(),
  nextPageToken: z.string().optional(),
  eventFilterType: z.enum(['ALL_EVENT', 'CLOSE_EVENT']).optional(),
});

function parseBody<T>(schema: z.ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Request validation failed', 400, result.error.issues);
  }
  return result.data;
}

function parseQuery<T>(schema: z.ZodSchema<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Query parameter validation failed', 400, result.error.issues);
  }
  return result.data;
}

/** Cast req.params value to string (Express v5 types params as string | string[]; route params are always string). */
function param(req: Request, name: string): string {
  return req.params[name] as string;
}

// Raw gRPC service calls have callback/promise overloads that TypeScript cannot resolve cleanly.
// We use `any` here to escape the overload ambiguity — the actual runtime behaviour is correct.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function grpcSvc(client: Awaited<ReturnType<typeof getWorkflowClient>>): any {
  return client.workflowService;
}

function notFound(workflowId: string): AppError {
  return new AppError('NOT_FOUND', `Workflow "${workflowId}" not found`, 404);
}

// --- Routes ---

// POST /workflows/:workflowType — Start a workflow
workflowRouter.post('/:workflowType', async (req: Request, res: Response) => {
  const workflowType = param(req, 'workflowType');
  const body = parseBody(startBodySchema, req.body);

  const client = await getWorkflowClient();

  try {
    // Duration fields (workflowRunTimeout etc.) accept string | number in the SDK, but the
    // TypeScript type may be stricter (e.g. Temporal.Duration class). Cast via any to accept
    // standard duration strings from HTTP callers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle = await client.start(workflowType, {
      workflowId: body.workflowId,
      taskQueue: body.taskQueue,
      args: body.args,
      ...(body.searchAttributes ? { searchAttributes: body.searchAttributes as Record<string, string[]> } : {}),
      ...(body.memo ? { memo: body.memo } : {}),
      ...(body.workflowExecutionTimeout ? { workflowExecutionTimeout: body.workflowExecutionTimeout as any } : {}),
      ...(body.workflowRunTimeout ? { workflowRunTimeout: body.workflowRunTimeout as any } : {}),
      ...(body.workflowTaskTimeout ? { workflowTaskTimeout: body.workflowTaskTimeout as any } : {}),
      ...(body.workflowIdReusePolicy ? { workflowIdReusePolicy: body.workflowIdReusePolicy as any } : {}),
      ...(body.retryPolicy ? { retry: body.retryPolicy as RetryPolicy } : {}),
      ...(body.cronSchedule ? { cronSchedule: body.cronSchedule } : {}),
    } as any);

    req.log?.info({ workflowId: handle.workflowId, workflowType }, 'Workflow started');
    res.status(201).json({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId });
  } catch (err) {
    // Translate Temporal's duplicate-workflowId error to 409.
    // Callers can retry with the same workflowId and treat 409 as "already started" — idempotent.
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      res.status(409).json(buildErrorEnvelope(
        'WORKFLOW_ID_CONFLICT',
        `Workflow with id "${body.workflowId}" is already running`,
      ));
      return;
    }
    throw err;
  }
});

// GET /workflows/:workflowId — Describe a workflow execution
workflowRouter.get('/:workflowId', async (req: Request, res: Response) => {
  const workflowId = param(req, 'workflowId');
  const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined;

  const client = await getWorkflowClient();
  const handle = client.getHandle(workflowId, runId);

  try {
    const desc = await handle.describe();
    res.json({
      workflowId: desc.workflowId,
      runId: desc.runId,
      status: desc.status,
      type: desc.type,
      taskQueue: desc.taskQueue,
      startTime: desc.startTime,
      closeTime: desc.closeTime,
      historyLength: desc.historyLength,
      memo: desc.memo,
      searchAttributes: desc.searchAttributes,
      parentExecution: desc.parentExecution,
    });
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw notFound(workflowId);
    throw err;
  }
});

// POST /workflows/:workflowId/signals/:signalName — Send a signal
workflowRouter.post('/:workflowId/signals/:signalName', async (req: Request, res: Response) => {
  const workflowId = param(req, 'workflowId');
  const signalName = param(req, 'signalName');
  const body = parseBody(signalBodySchema, req.body);

  const client = await getWorkflowClient();
  const handle = client.getHandle(workflowId, body.runId);

  try {
    // args is unknown[] — signal accepts any payload, cast to satisfy overload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handle.signal(signalName, ...(body.args as any[]));
    req.log?.info({ workflowId, signalName }, 'Signal sent');
    res.status(204).send();
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw notFound(workflowId);
    throw err;
  }
});

// POST /workflows/:workflowId/queries/:queryName — Run a query (POST because queries take args)
workflowRouter.post('/:workflowId/queries/:queryName', async (req: Request, res: Response) => {
  const workflowId = param(req, 'workflowId');
  const queryName = param(req, 'queryName');
  const body = parseBody(queryBodySchema, req.body);

  const client = await getWorkflowClient();
  const handle = client.getHandle(workflowId, body.runId);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (handle as any).query(queryName, ...(body.args as any[]));
    res.json({ result });
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw notFound(workflowId);
    throw err;
  }
});

// POST /workflows/:workflowId/cancel — Graceful cancel
workflowRouter.post('/:workflowId/cancel', async (req: Request, res: Response) => {
  const workflowId = param(req, 'workflowId');
  const body = parseBody(cancelBodySchema, req.body);

  const client = await getWorkflowClient();
  const handle = client.getHandle(workflowId, body.runId);

  try {
    // Note: handle.cancel() does not accept a reason parameter (Temporal SDK design).
    // body.reason is accepted for API consistency but is log-only.
    await handle.cancel();
    req.log?.info({ workflowId, reason: body.reason }, 'Workflow cancelled');
    res.status(204).send();
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw notFound(workflowId);
    throw err;
  }
});

// POST /workflows/:workflowId/terminate — Forceful terminate
workflowRouter.post('/:workflowId/terminate', async (req: Request, res: Response) => {
  const workflowId = param(req, 'workflowId');
  const body = parseBody(terminateBodySchema, req.body);

  const client = await getWorkflowClient();
  const handle = client.getHandle(workflowId, body.runId);

  try {
    await handle.terminate(body.reason);
    req.log?.info({ workflowId, reason: body.reason }, 'Workflow terminated');
    res.status(204).send();
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw notFound(workflowId);
    throw err;
  }
});

// GET /workflows — List workflow executions with Temporal visibility query
workflowRouter.get('/', async (req: Request, res: Response) => {
  const query = parseQuery(listQuerySchema, req.query);

  const client = await getWorkflowClient();
  const svc = grpcSvc(client);

  // Pass query directly to Temporal — no filter DSL invented here.
  const response = await svc.listWorkflowExecutions({
    namespace: config.temporal.namespace,
    query: query.query ?? '',
    pageSize: query.pageSize,
    nextPageToken: query.nextPageToken
      ? Buffer.from(query.nextPageToken, 'base64')
      : undefined,
  });

  res.json({
    executions: response.executions ?? [],
    nextPageToken: (response.nextPageToken as Buffer | undefined)?.length
      ? (response.nextPageToken as Buffer).toString('base64')
      : undefined,
  });
});

// GET /workflows/:workflowId/history — Event history
workflowRouter.get('/:workflowId/history', async (req: Request, res: Response) => {
  const workflowId = param(req, 'workflowId');
  const query = parseQuery(historyQuerySchema, req.query);

  const client = await getWorkflowClient();
  const svc = grpcSvc(client);

  const filterTypeMap: Record<string, number> = { ALL_EVENT: 0, CLOSE_EVENT: 1 };

  try {
    const response = await svc.getWorkflowExecutionHistory({
      namespace: config.temporal.namespace,
      execution: { workflowId, runId: query.runId },
      maximumPageSize: query.pageSize,
      nextPageToken: query.nextPageToken
        ? Buffer.from(query.nextPageToken, 'base64')
        : undefined,
      historyEventFilterType: query.eventFilterType
        ? filterTypeMap[query.eventFilterType]
        : undefined,
    });

    res.json({
      events: (response.history?.events as unknown[]) ?? [],
      nextPageToken: (response.nextPageToken as Buffer | undefined)?.length
        ? (response.nextPageToken as Buffer).toString('base64')
        : undefined,
    });
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw notFound(workflowId);
    throw err;
  }
});

// POST /workflows/:workflowId/reset — Reset to a prior history point
// Note: no high-level reset API in the TypeScript SDK; raw gRPC is required.
workflowRouter.post('/:workflowId/reset', async (req: Request, res: Response) => {
  const workflowId = param(req, 'workflowId');
  const body = parseBody(resetBodySchema, req.body);

  const client = await getWorkflowClient();
  const svc = grpcSvc(client);

  try {
    const response = await svc.resetWorkflowExecution({
      namespace: config.temporal.namespace,
      workflowExecution: { workflowId, runId: body.runId },
      reason: body.reason,
      workflowTaskFinishEventId: body.eventId,
      requestId: randomUUID(),
      ...(body.resetReapplyType ? { resetReapplyType: body.resetReapplyType } : {}),
    });

    req.log?.info({ workflowId, newRunId: response.runId }, 'Workflow reset');
    res.json({ workflowId, newRunId: response.runId as string });
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) throw notFound(workflowId);
    throw err;
  }
});
