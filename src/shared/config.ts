/** Loads and validates all environment variables. Exits on missing required vars. */

function requireEnv(name: string): string {
  const value = process.env[name];
  // Treat both undefined and empty string as missing
  if (value === undefined || value.trim() === '') {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3000'), 10),
  logLevel: optionalEnv('LOG_LEVEL', 'info'),
  temporal: {
    address: optionalEnv('TEMPORAL_ADDRESS', 'localhost:7233'),
    namespace: optionalEnv('TEMPORAL_NAMESPACE', 'default'),
    taskQueue: optionalEnv('TEMPORAL_TASK_QUEUE', 'workflow-default'),
  },
  mongo: {
    uri: requireEnv('MONGO_URI'),
    db: requireEnv('MONGO_DB'),
    outboxCollection: optionalEnv('MONGO_OUTBOX_COLLECTION', 'outbox'),
  },
} as const;
