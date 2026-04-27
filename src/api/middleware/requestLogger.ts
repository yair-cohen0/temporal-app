import pinoHttp from 'pino-http';
import pino from 'pino';
import { config } from '../../shared/config';

export const logger = pino({
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Attaches req.log to every request for structured per-request logging. */
export const requestLogger = pinoHttp({ logger });
