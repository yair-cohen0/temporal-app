import express from 'express';
import { config } from '../shared/config';
import { requestLogger, logger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { workflowRouter } from './routes/workflows';
import { healthRouter } from './routes/health';
import { getOutboxCollection } from '../shared/mongo';

async function main(): Promise<void> {
  // Eagerly initialize Mongo so the unique index exists before the first request arrives.
  await getOutboxCollection();
  logger.info('MongoDB connected and outbox index ensured');

  const app = express();

  app.use(express.json());
  app.use(requestLogger);

  app.use('/api/v1/workflows', workflowRouter);
  app.use('/api/v1/health', healthRouter);

  app.use(errorHandler);

  app.listen(config.port, () => {
    logger.info({ port: config.port }, 'API server listening');
  });
}

main().catch((err) => {
  logger.error({ err }, 'API server fatal error during startup');
  process.exit(1);
});
