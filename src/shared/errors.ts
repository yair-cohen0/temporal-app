/** All error codes used in the standard error envelope. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'WORKFLOW_ID_CONFLICT'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

/** Standard error envelope returned on all non-2xx responses. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Thrown internally; the error handler middleware converts this to the envelope format. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Build a typed ErrorEnvelope without throwing. */
export function buildErrorEnvelope(
  code: ErrorCode,
  message: string,
  details?: unknown
): ErrorEnvelope {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}
