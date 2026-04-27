import { NativeConnection, Worker } from '@temporalio/worker';
import { writeOutboxDocument } from '../shared/activities';
import { config } from '../shared/config';
import { getOutboxCollection } from '../shared/mongo';
import pino from 'pino';

const logger = pino({ level: config.logLevel, timestamp: pino.stdTimeFunctions.isoTime });

async function run(): Promise<void> {
  // Initialize Mongo connection and create the unique index before accepting tasks
  await getOutboxCollection();
  logger.info('MongoDB connected and outbox index ensured');

  const connection = await NativeConnection.connect({
    address: config.temporal.address,
  });

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.temporal.taskQueue,
    // All files exported from src/workflows/index.ts are automatically registered
    workflowsPath: require.resolve('../workflows'),
    // Activities registered explicitly — only writeOutboxDocument is exposed
    activities: { writeOutboxDocument },
  });

  logger.info({ taskQueue: config.temporal.taskQueue }, 'Worker started');
  await worker.run();
}

run().catch((err) => {
  logger.error({ err }, 'Worker fatal error');
  process.exit(1);
});
