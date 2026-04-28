import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { WorkflowExecutionAlreadyStartedError, WorkflowNotFoundError } from '@temporalio/client';
import { getWorkflowClient } from '../../shared/temporalClient';
import { config } from '../../shared/config';
import { buildErrorEnvelope } from '../../shared/errors';
import { parseBody, parseQuery, param, grpcSvc, notFound } from '../utils';
import {
  startBodySchema,
  signalBodySchema,
  queryBodySchema,
  cancelBodySchema,
  terminateBodySchema,
  resetBodySchema,
  listQuerySchema,
  historyQuerySchema,
} from '../schemas/workflows';

export const workflowRouter = Router();

// POST /workflows/:workflowType — Start a workflow
workflowRouter.post('/:workflowType', async (req: Request, res: Response) => {
  const workflowType = param(req, 'workflowType');
  const body = parseBody(startBodySchema, req.body);

  const client = await getWorkflowClient();

  try {
    const handle = await client.start(workflowType, {
      workflowId: body.workflowId,
      taskQueue: body.taskQueue,
      args: body.args,
      searchAttributes: body.searchAttributes,
      memo: body.memo,
      workflowExecutionTimeout: body.workflowExecutionTimeout,
      workflowRunTimeout: body.workflowRunTimeout,
      workflowTaskTimeout: body.workflowTaskTimeout,
      workflowIdReusePolicy: body.workflowIdReusePolicy,
      retry: body.retryPolicy,
      cronSchedule: body.cronSchedule,
    } as any);

    req.log?.info({ workflowId: handle.workflowId, workflowType }, 'Workflow started');
    res.status(201).json({ workflowId: handle.workflowId, runId: handle.firstExecutionRunId });
  } catch (err) {
    if (err instanceof WorkflowExecutionAlreadyStartedError) {
      res
        .status(409)
        .json(
          buildErrorEnvelope(
            'WORKFLOW_ID_CONFLICT',
            `Workflow with id "${body.workflowId}" is already running`
          )
        );
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

  const response = await svc.listWorkflowExecutions({
    namespace: config.temporal.namespace,
    query: query.query ?? '',
    pageSize: query.pageSize,
    nextPageToken: query.nextPageToken ? Buffer.from(query.nextPageToken, 'base64') : undefined,
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
      nextPageToken: query.nextPageToken ? Buffer.from(query.nextPageToken, 'base64') : undefined,
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
