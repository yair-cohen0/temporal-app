import { Router, Request, Response } from 'express';
import { getWorkflowClient } from '../../shared/temporalClient';
import { config } from '../../shared/config';

export const healthRouter = Router();

healthRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const client = await getWorkflowClient();
    await client.workflowService.describeNamespace({ namespace: config.temporal.namespace });
    res.json({ status: 'ok', temporal: { connected: true, namespace: config.temporal.namespace } });
  } catch {
    res.status(503).json({ status: 'degraded', temporal: { connected: false, namespace: config.temporal.namespace } });
  }
});
