import { workflowInfo } from '@temporalio/workflow';
import { lomdaStep, rankApproverStep, signatureStep } from '../shared/steps';

const DEFAULT_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // One month

export interface SourcesFlowInput {
  clearance: number;
  finalSignerUserId: string;
  firstTime: boolean;
  timeoutMs?: number;
}

export async function sourcesFlow(input: SourcesFlowInput): Promise<void> {
  const { workflowId } = workflowInfo();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const rank = input.clearance > 2 ? 'delta' : 'alpha';
  const rankResult = await rankApproverStep({
    stepId: `${workflowId}:rankApproval`,
    rank,
    timeoutMs,
  });
  if (rankResult.decision === 'reject') return;

  if (input.firstTime) {
    const lomdaResult = await lomdaStep({
      stepId: `${workflowId}:lomdaStep`,
      timeoutMs,
    });
    if (lomdaResult.decision === 'reject') return;
  }

  await signatureStep({
    stepId: `${workflowId}:finalSignature`,
    userId: input.finalSignerUserId,
    timeoutMs,
  });
}
