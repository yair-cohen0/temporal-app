export interface WorkflowDescribeResponse {
  workflowId: string;
  runId: string;
  status: unknown;
  type: string;
  taskQueue: string;
  startTime: string;
  closeTime?: string;
  historyLength: number;
  memo?: Record<string, unknown>;
  searchAttributes?: Record<string, unknown>;
  parentExecution?: { workflowId: string; runId: string };
}

export interface SignalPayload {
  stepId: string;
  actorId: string;
  decision: string;
  reason?: string;
  payload?: unknown;
  timestamp: string;
}

export type StepStatus = 'waiting' | 'completed' | 'timed-out';

export interface Step {
  stepId: string;
  actionType: string;
  status: StepStatus;
  meta: Record<string, unknown>;
  signal?: SignalPayload;
  scheduledAt?: string;
  awaitingSignal: boolean;
}

export interface RawPayload {
  metadata?: { encoding?: unknown };
  data?: unknown;
}

export interface RawHistoryEvent {
  eventId?: unknown;
  eventType?: string | number;
  eventTime?: unknown;
  activityTaskScheduledEventAttributes?: {
    activityId?: string;
    activityType?: { name?: string };
    input?: { payloads?: RawPayload[] };
  };
  workflowExecutionSignaledEventAttributes?: {
    signalName?: string;
    input?: { payloads?: RawPayload[] };
  };
}

export interface HistoryResponse {
  events: RawHistoryEvent[];
  nextPageToken?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  temporal: { connected: boolean; namespace: string };
}
