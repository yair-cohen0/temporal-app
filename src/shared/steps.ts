/**
 * Step primitives — reusable workflow building blocks for human-in-the-loop interactions.
 *
 * THIS FILE RUNS IN THE TEMPORAL WORKFLOW SANDBOX. Rules:
 * - Only import from @temporalio/workflow (workflow-safe APIs)
 * - Use `import type` for everything else (erased at compile time, no runtime Node.js code)
 * - No Node.js built-ins, no fs/http/crypto, no Date.now(), no Math.random()
 */

import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
  workflowInfo,
  uuid4,
  ApplicationFailure,
} from '@temporalio/workflow';
import type { OutboxDocInput, SignalPayload } from './types';

// Each step type gets its own activity name so Temporal's event history shows
// "awaitRankApproval", "awaitSignature", etc. instead of "writeOutboxDocument" for every step.
const { awaitGroupApproval, awaitRankApproval, awaitSignature, endpoint, writeTimeout } =
  proxyActivities<{
    awaitGroupApproval: (doc: OutboxDocInput) => Promise<void>;
    awaitRankApproval: (doc: OutboxDocInput) => Promise<void>;
    awaitSignature: (doc: OutboxDocInput) => Promise<void>;
    endpoint: (doc: OutboxDocInput) => Promise<void>;
    writeTimeout: (doc: OutboxDocInput) => Promise<void>;
  }>({ startToCloseTimeout: '10 minutes' });

/**
 * The single signal name all step primitives wait on.
 * Routing to the correct waiting step is done by filtering on payload.stepId.
 */
export const stepCompletedSignal = defineSignal<[SignalPayload]>('stepCompleted');

// Module-level signal accumulator and handler guard.
//
// ISOLATION GUARANTEE: Temporal's Node.js SDK runs each workflow execution in its own
// V8 isolate (via isolated-vm). Module-level variables are per-isolate, so receivedSignals
// and handlerRegistered are NOT shared across concurrent workflow executions on the same
// worker. On replay the isolate is re-created and these variables start fresh; signals are
// re-dispatched from history and repopulate receivedSignals correctly.
//
// If this invariant ever changes (e.g., the bundler strategy changes), the symptoms would
// be signals for one workflow resolving a different workflow's step. The fix at that point
// would be to pass receivedSignals/handlerRegistered as explicit arguments to each step.
const receivedSignals = new Map<string, SignalPayload>();
let handlerRegistered = false;

/**
 * Registers the shared stepCompleted handler exactly once per workflow execution.
 * All arriving signals are indexed by stepId so concurrent waiting steps each
 * pick up only their own signal via condition().
 */
function ensureSignalHandler(): void {
  if (handlerRegistered) return;
  handlerRegistered = true;
  // Single handler for all stepCompleted signals. Each step awaits
  // condition(() => receivedSignals.has(its-own-stepId)).
  setHandler(stepCompletedSignal, (payload: SignalPayload) => {
    receivedSignals.set(payload.stepId, payload);
  });
}

// --- Step primitives ---

export interface GroupApproverStepInput {
  stepId: string;
  groupId: string;
  timeoutMs: number;
}

/**
 * Writes an awaitGroupApproval outbox doc, then blocks until any user in groupId
 * acts (via the stepCompleted signal). Throws ApplicationFailure on timeout.
 */
export async function groupApproverStep(input: GroupApproverStepInput): Promise<SignalPayload> {
  const { stepId, groupId, timeoutMs } = input;
  const { workflowId, runId } = workflowInfo();

  ensureSignalHandler();

  const doc: OutboxDocInput = {
    workflowId,
    runId,
    actionId: stepId, // stepId === actionId for step-related outbox docs
    actionType: 'awaitGroupApproval',
    actionConfig: { stepId, groupId, timeoutMs },
  };
  await awaitGroupApproval(doc);

  const resolved = await condition(() => receivedSignals.has(stepId), timeoutMs);

  if (!resolved) {
    // Write a timeout outbox doc so downstream consumers know this step expired.
    const timeoutDoc: OutboxDocInput = {
      workflowId,
      runId,
      actionId: `${stepId}:timeout`, // distinct from original actionId to avoid duplicate key
      actionType: 'timeout',
      actionConfig: { stepId, originalActionType: 'awaitGroupApproval' },
    };
    await writeTimeout(timeoutDoc);
    throw ApplicationFailure.nonRetryable(`Step "${stepId}" timed out`, 'StepTimeoutError');
  }

  return receivedSignals.get(stepId)!;
}

export interface RankApproverStepInput {
  stepId: string;
  rank: string;
  timeoutMs: number;
}

/**
 * Writes an awaitRankApproval outbox doc, then blocks until any user of rank acts.
 * Throws ApplicationFailure on timeout.
 */
export async function rankApproverStep(input: RankApproverStepInput): Promise<SignalPayload> {
  const { stepId, rank, timeoutMs } = input;
  const { workflowId, runId } = workflowInfo();

  ensureSignalHandler();

  const doc: OutboxDocInput = {
    workflowId,
    runId,
    actionId: stepId,
    actionType: 'awaitRankApproval',
    actionConfig: { stepId, rank, timeoutMs },
  };
  await awaitRankApproval(doc);

  const resolved = await condition(() => receivedSignals.has(stepId), timeoutMs);

  if (!resolved) {
    const timeoutDoc: OutboxDocInput = {
      workflowId,
      runId,
      actionId: `${stepId}:timeout`,
      actionType: 'timeout',
      actionConfig: { stepId, originalActionType: 'awaitRankApproval' },
    };
    await writeTimeout(timeoutDoc);
    throw ApplicationFailure.nonRetryable(`Step "${stepId}" timed out`, 'StepTimeoutError');
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return receivedSignals.get(stepId)!;
}

export interface SignatureStepInput {
  stepId: string;
  userId: string;
  timeoutMs: number;
}

/**
 * Writes an awaitSignature outbox doc, then blocks until the specific userId acts.
 * Throws ApplicationFailure on timeout.
 */
export async function signatureStep(input: SignatureStepInput): Promise<SignalPayload> {
  const { stepId, userId, timeoutMs } = input;
  const { workflowId, runId } = workflowInfo();

  ensureSignalHandler();

  const doc: OutboxDocInput = {
    workflowId,
    runId,
    actionId: stepId,
    actionType: 'awaitSignature',
    actionConfig: { stepId, userId, timeoutMs },
  };
  await awaitSignature(doc);

  const resolved = await condition(() => receivedSignals.has(stepId), timeoutMs);

  if (!resolved) {
    const timeoutDoc: OutboxDocInput = {
      workflowId,
      runId,
      actionId: `${stepId}:timeout`,
      actionType: 'timeout',
      actionConfig: { stepId, originalActionType: 'awaitSignature' },
    };
    await writeTimeout(timeoutDoc);
    throw ApplicationFailure.nonRetryable(`Step "${stepId}" timed out`, 'StepTimeoutError');
  }

  return receivedSignals.get(stepId)!;
}

export interface EndpointStepInput {
  resource: unknown;
  message?: string;
}

/**
 * Writes an endpoint outbox doc signalling that the requested resource should be granted.
 * Fire-and-forget — the workflow does not wait for confirmation and completes after this.
 */
export async function endpointStep(input: EndpointStepInput): Promise<void> {
  const { resource, message } = input;
  const { workflowId, runId } = workflowInfo();

  // uuid4() from @temporalio/workflow is deterministic (seeded by workflow history),
  // so it returns the same value on replay — making actionId stable.
  const actionId = uuid4();

  const doc: OutboxDocInput = {
    workflowId,
    runId,
    actionId,
    actionType: 'endpoint',
    actionConfig: { resource, ...(message !== undefined ? { message } : {}) },
  };
  await endpoint(doc);
}
