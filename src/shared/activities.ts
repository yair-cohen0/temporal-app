import { MongoServerError } from 'mongodb';
import { getOutboxCollection } from './mongo';
import type { OutboxDocInput } from './types';

/**
 * Writes one document to the outbox collection.
 *
 * Idempotency: Temporal retries failed activities indefinitely by default.
 * A successful Mongo write whose acknowledgement is lost will be retried.
 * We handle this by catching MongoServerError code 11000 (duplicate key on actionId)
 * and treating it as success — the document was already written on a prior attempt.
 *
 * _id is NOT used as the idempotency key because Mongo auto-generates a new ObjectId
 * on every insertOne call. actionId carries the idempotency guarantee via its unique index.
 *
 * workflowId and runId are provided by the caller (workflow code reads them from
 * workflowInfo()). runId changes on reset/continue-as-new, so outbox docs are
 * attributable to the exact Temporal run that produced them.
 */
export async function writeOutboxDocument(doc: OutboxDocInput): Promise<void> {
  const collection = await getOutboxCollection();

  const fullDoc = {
    ...doc,
    status: 'pending' as const,
    createdAt: new Date(),
    // _id intentionally omitted — Mongo auto-generates an ObjectId
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await collection.insertOne(fullDoc as any);
  } catch (err) {
    // Duplicate key on actionId means this doc was already written on a prior attempt.
    // Treat as success — idempotency guaranteed by the unique index on actionId.
    if (err instanceof MongoServerError && err.code === 11000) {
      return;
    }
    throw err;
  }
}
