import { MongoClient, Collection } from 'mongodb';
import { config } from './config';
import type { OutboxDoc } from './types';

// Promise-level singleton: concurrent callers both await the same Promise,
// so MongoClient.connect() is called exactly once even under concurrent load.
let _initPromise: Promise<Collection<OutboxDoc>> | null = null;

/**
 * Returns the outbox collection, initializing the Mongo connection on first call.
 *
 * Exposes ONLY this collection — enforces at the type level that the Worker
 * can only write to the outbox and cannot access any other collection or
 * the database/client objects directly. Any future need for broader access
 * must be a deliberate decision reflected here.
 */
export function getOutboxCollection(): Promise<Collection<OutboxDoc>> {
  if (!_initPromise) {
    _initPromise = (async () => {
      const client = new MongoClient(config.mongo.uri);
      await client.connect();

      const db = client.db(config.mongo.db);
      const collection = db.collection<OutboxDoc>(config.mongo.outboxCollection);

      // Unique index on actionId — the idempotency key for writeOutboxDocument.
      // createIndex is idempotent: a no-op if the index already exists with the same name and definition.
      await collection.createIndex(
        { actionId: 1 },
        { unique: true, name: 'outbox_actionId_unique' }
      );

      return collection;
    })();
  }
  return _initPromise;
}
