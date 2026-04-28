export type WorkflowStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TERMINATED'
  | 'TIMED_OUT'
  | 'CONTINUED_AS_NEW'
  | 'UNKNOWN';

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
  decision: 'approve' | 'reject' | 'sign';
  reason?: string;
  payload?: unknown;
  timestamp: string;
}

export type StepType = 'groupApproval' | 'rankApproval' | 'signature' | 'endpoint';
export type StepStatus = 'waiting' | 'approved' | 'rejected' | 'signed' | 'timed-out' | 'endpoint';

export interface StepMeta {
  groupId?: string;
  rank?: string;
  userId?: string;
  timeoutMs?: number;
  resource?: unknown;
  message?: string;
}

export interface Step {
  stepId: string;
  type: StepType;
  status: StepStatus;
  meta: StepMeta;
  signal?: SignalPayload;
  scheduledAt?: string;
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

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
