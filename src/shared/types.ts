import { ObjectId } from 'mongodb';

export type OutboxStatus = 'pending' | 'processing' | 'done' | 'failed';

// --- Base envelope (repeated in each union variant so narrowing is preserved) ---

interface OutboxDocBase {
  _id: ObjectId;
  workflowId: string;
  runId: string;
  /** Unique idempotency key. For step actions equals stepId; for timeouts equals `${stepId}:timeout`. */
  actionId: string;
  status: OutboxStatus;
  createdAt: Date;
  processedAt?: Date;
}

// --- Action config shapes ---

export interface CreateFlowConfig {
  workflowType: string;
  args: unknown[];
}

export interface ForwardSignalConfig {
  signalName: string;
  signalPayload: unknown;
}

export interface AwaitGroupApprovalConfig {
  stepId: string;
  groupId: string;
  timeoutMs: number;
}

export interface AwaitRankApprovalConfig {
  stepId: string;
  rank: string;
  timeoutMs: number;
}

export interface AwaitSignatureConfig {
  stepId: string;
  userId: string;
  timeoutMs: number;
}

export interface EndpointConfig {
  resource: unknown;
  message?: string;
}

export interface TimeoutConfig {
  /** The stepId that timed out. */
  stepId: string;
  originalActionType: 'awaitGroupApproval' | 'awaitRankApproval' | 'awaitSignature';
}

// --- Discriminated union keyed on actionType ---
// Each variant pairs the literal actionType with its matching actionConfig shape.
// Common fields are repeated (TypeScript can't extract them without losing narrowing).

export type OutboxDoc =
  | (OutboxDocBase & { actionType: 'createFlow'; actionConfig: CreateFlowConfig })
  | (OutboxDocBase & { actionType: 'forwardSignal'; actionConfig: ForwardSignalConfig })
  | (OutboxDocBase & { actionType: 'awaitGroupApproval'; actionConfig: AwaitGroupApprovalConfig })
  | (OutboxDocBase & { actionType: 'awaitRankApproval'; actionConfig: AwaitRankApprovalConfig })
  | (OutboxDocBase & { actionType: 'awaitSignature'; actionConfig: AwaitSignatureConfig })
  | (OutboxDocBase & { actionType: 'endpoint'; actionConfig: EndpointConfig })
  | (OutboxDocBase & { actionType: 'timeout'; actionConfig: TimeoutConfig });

// Distributive Omit — preserves discriminant narrowing across all union members.
// Standard Omit<A|B, K> would flatten the union and lose pairing between actionType and actionConfig.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Input to writeOutboxDocument. The activity fills in _id, createdAt, and status. */
export type OutboxDocInput = DistributiveOmit<
  OutboxDoc,
  '_id' | 'createdAt' | 'processedAt' | 'status'
>;

// --- Signal payload ---

/** Uniform payload for the stepCompleted signal, used by all step types. */
export interface SignalPayload {
  /** Must match the stepId the waiting step was registered with. */
  stepId: string;
  actorId: string;
  decision: 'approve' | 'reject' | 'sign';
  reason?: string;
  payload?: unknown;
  /** ISO 8601 timestamp of when the actor acted. */
  timestamp: string;
}
