import { Request, Response, NextFunction } from 'express';
import { AppError, buildErrorEnvelope } from '../../shared/errors';
import { logger } from './requestLogger';

/**
 * Central error handler. Express identifies error handlers by their 4-argument
 * signature; _next must be declared even if unused.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildErrorEnvelope(err.code, err.message, err.details));
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json(buildErrorEnvelope('INTERNAL_ERROR', 'An unexpected error occurred'));
}
