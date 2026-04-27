import { Connection, WorkflowClient } from '@temporalio/client';
import { config } from './config';

// Promise-level singleton: concurrent callers both await the same Promise,
// so Connection.connect() is called exactly once even under concurrent load.
let _initPromise: Promise<WorkflowClient> | null = null;

/**
 * Returns the singleton WorkflowClient for use by the API server.
 * Lazily connects on first call; concurrent calls share the same init Promise.
 */
export function getWorkflowClient(): Promise<WorkflowClient> {
  if (!_initPromise) {
    _initPromise = (async () => {
      const connection = await Connection.connect({
        address: config.temporal.address,
      });

      return new WorkflowClient({
        connection,
        namespace: config.temporal.namespace,
      });
    })();
  }
  return _initPromise;
}
