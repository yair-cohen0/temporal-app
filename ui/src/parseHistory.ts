import type { RawHistoryEvent, RawPayload, Step, StepStatus, SignalPayload } from './types';

// Temporal gRPC proto event type numbers
const ACTIVITY_TASK_SCHEDULED = 12;
const WORKFLOW_EXECUTION_SIGNALED = 25;

function normalizeEventType(raw: string | number | undefined): string {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'number') {
    const map: Record<number, string> = {
      [ACTIVITY_TASK_SCHEDULED]: 'ACTIVITY_TASK_SCHEDULED',
      [WORKFLOW_EXECUTION_SIGNALED]: 'WORKFLOW_EXECUTION_SIGNALED',
    };
    return map[raw] ?? String(raw);
  }
  return raw.replace(/^EVENT_TYPE_/, '');
}

function getEventTime(event: RawHistoryEvent): string | undefined {
  const t = event.eventTime;
  if (!t) return undefined;
  if (typeof t === 'string') return t;
  if (t instanceof Date) return t.toISOString();
  if (typeof t === 'object') {
    const obj = t as Record<string, unknown>;
    if ('seconds' in obj) {
      const sec = typeof obj.seconds === 'string' ? parseInt(obj.seconds, 10) : Number(obj.seconds);
      if (!isNaN(sec)) return new Date(sec * 1000).toISOString();
    }
  }
  return undefined;
}

function decodePayload(rawPayload: RawPayload | undefined): Record<string, unknown> | null {
  if (!rawPayload) return null;
  const data = rawPayload.data;
  if (!data) return null;

  let jsonStr: string | null = null;

  if (typeof data === 'string') {
    // Protobuf JSON: bytes are base64-encoded
    try {
      jsonStr = atob(data);
    } catch {
      jsonStr = data; // might already be raw JSON
    }
  } else if (typeof data === 'object') {
    // Buffer serialized as { type: 'Buffer', data: number[] }
    const obj = data as Record<string, unknown>;
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      try {
        jsonStr = String.fromCharCode(...(obj.data as number[]));
      } catch {
        return null;
      }
    }
  }

  if (!jsonStr) return null;
  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON
  }
  return null;
}

function isSignalPayload(
  obj: Record<string, unknown> | null
): obj is Record<string, unknown> & SignalPayload {
  return (
    obj !== null &&
    typeof obj.stepId === 'string' &&
    typeof obj.actorId === 'string' &&
    (obj.decision === 'approve' || obj.decision === 'reject' || obj.decision === 'sign')
  );
}

function decisionToStatus(decision: 'approve' | 'reject' | 'sign'): StepStatus {
  if (decision === 'approve') return 'approved';
  if (decision === 'reject') return 'rejected';
  return 'signed';
}

function applyPending(step: Step, pending: Map<string, SignalPayload>): void {
  const signal = pending.get(step.stepId);
  if (signal) {
    step.signal = signal;
    step.status = decisionToStatus(signal.decision);
    pending.delete(step.stepId);
  }
}

export function parseHistory(events: RawHistoryEvent[]): Step[] {
  const steps: Step[] = [];
  const stepIndex = new Map<string, Step>();
  // Signals can arrive before their activity is scheduled (Temporal buffers them).
  // Buffer unmatched signals and apply them when the activity appears later.
  const pendingSignals = new Map<string, SignalPayload>();

  for (const event of events) {
    const type = normalizeEventType(event.eventType);
    const scheduledAt = getEventTime(event);

    if (type === 'ACTIVITY_TASK_SCHEDULED') {
      const attrs = event.activityTaskScheduledEventAttributes;
      const activityName = attrs?.activityType?.name;
      const input = decodePayload(attrs?.input?.payloads?.[0]);

      // Activity input is OutboxDocInput — step params live inside actionConfig.
      // Use input.actionType as the discriminator: it's reliable regardless of whether
      // the worker registered activities under logical names or as writeOutboxDocument.
      const actionType = typeof input?.actionType === 'string' ? input.actionType : activityName;
      const cfg =
        input && typeof input.actionConfig === 'object' && input.actionConfig !== null
          ? (input.actionConfig as Record<string, unknown>)
          : null;

      if (actionType === 'awaitGroupApproval' && cfg) {
        const step: Step = {
          stepId: String(cfg.stepId ?? ''),
          type: 'groupApproval',
          status: 'waiting',
          meta: {
            groupId: String(cfg.groupId ?? ''),
            timeoutMs: Number(cfg.timeoutMs ?? 0),
          },
          scheduledAt,
        };
        applyPending(step, pendingSignals);
        steps.push(step);
        stepIndex.set(step.stepId, step);
      } else if (actionType === 'awaitRankApproval' && cfg) {
        const step: Step = {
          stepId: String(cfg.stepId ?? ''),
          type: 'rankApproval',
          status: 'waiting',
          meta: {
            rank: String(cfg.rank ?? ''),
            timeoutMs: Number(cfg.timeoutMs ?? 0),
          },
          scheduledAt,
        };
        applyPending(step, pendingSignals);
        steps.push(step);
        stepIndex.set(step.stepId, step);
      } else if (actionType === 'awaitSignature' && cfg) {
        const step: Step = {
          stepId: String(cfg.stepId ?? ''),
          type: 'signature',
          status: 'waiting',
          meta: {
            userId: String(cfg.userId ?? ''),
            timeoutMs: Number(cfg.timeoutMs ?? 0),
          },
          scheduledAt,
        };
        applyPending(step, pendingSignals);
        steps.push(step);
        stepIndex.set(step.stepId, step);
      } else if (actionType === 'endpoint' && cfg) {
        steps.push({
          stepId: `endpoint-${steps.length}`,
          type: 'endpoint',
          status: 'endpoint',
          meta: {
            resource: cfg.resource,
            message: cfg.message != null ? String(cfg.message) : undefined,
          },
          scheduledAt,
        });
      } else if ((actionType === 'writeTimeout' || actionType === 'timeout') && cfg) {
        const stepId = String(cfg.stepId ?? '');
        const step = stepIndex.get(stepId);
        if (step) step.status = 'timed-out';
      }
    } else if (type === 'WORKFLOW_EXECUTION_SIGNALED') {
      const attrs = event.workflowExecutionSignaledEventAttributes;
      if (attrs?.signalName === 'stepCompleted') {
        const payload = decodePayload(attrs?.input?.payloads?.[0]);
        if (isSignalPayload(payload)) {
          const step = stepIndex.get(payload.stepId);
          if (step) {
            step.signal = payload;
            step.status = decisionToStatus(payload.decision);
          } else {
            // Signal arrived before its activity was scheduled — buffer it
            pendingSignals.set(payload.stepId, payload);
          }
        }
      }
    }
  }

  return steps;
}

export function resolveStatus(raw: unknown): string {
  const STATUS_NUM: Record<number, string> = {
    0: 'UNKNOWN',
    1: 'RUNNING',
    2: 'COMPLETED',
    3: 'FAILED',
    4: 'CANCELLED',
    5: 'TERMINATED',
    6: 'CONTINUED_AS_NEW',
    7: 'TIMED_OUT',
  };
  if (typeof raw === 'number') return STATUS_NUM[raw] ?? 'UNKNOWN';
  if (typeof raw === 'string') return raw.replace('WORKFLOW_EXECUTION_STATUS_', '');
  if (raw && typeof raw === 'object' && 'name' in raw)
    return resolveStatus((raw as Record<string, unknown>).name);
  return 'UNKNOWN';
}

export const TERMINAL_STATUSES = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TERMINATED',
  'TIMED_OUT',
  'CONTINUED_AS_NEW',
]);
