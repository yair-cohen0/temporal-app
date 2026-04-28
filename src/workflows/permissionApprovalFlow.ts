import { workflowInfo } from '@temporalio/workflow';
import { rankApproverStep, signatureStep } from '../shared/steps';

const DEFAULT_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // One month

export interface PermissionApprovalInput {
  clearance: number;
  permissionHasLeader: boolean;
  location: string;
  isCitizen: boolean;
  name: string;
  isFirstRequest: boolean;
  leaderApproverId: string;
  telAvivApproverId: string;
  defaultApproverId: string;
  seniorApproverId: string;
  preliminarySignerUserId: string;
  finalSignerUserId: string;
  timeoutMs?: number;
}

export async function permissionApprovalFlow(input: PermissionApprovalInput): Promise<void> {
  const { workflowId } = workflowInfo();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const rank = input.clearance > 2 ? 'delta' : 'alpha';
  const rankResult = await rankApproverStep({
    stepId: `${workflowId}:rankApproval`,
    rank,
    timeoutMs,
  });
  if (rankResult.decision === 'reject') return;

  if (input.permissionHasLeader) {
    const leaderResult = await signatureStep({
      stepId: `${workflowId}:leaderApproval`,
      userId: input.leaderApproverId,
      timeoutMs,
    });
    if (leaderResult.decision === 'reject') return;
  }

  if (input.location.toLowerCase() === 'tel-aviv') {
    const telAvivResult = await signatureStep({
      stepId: `${workflowId}:telAvivApproval`,
      userId: input.telAvivApproverId,
      timeoutMs,
    });
    if (telAvivResult.decision === 'reject') return;
  } else {
    const defaultResult = await signatureStep({
      stepId: `${workflowId}:defaultApproval`,
      userId: input.defaultApproverId,
      timeoutMs,
    });
    if (defaultResult.decision === 'reject') return;

    if (input.isCitizen || !input.name.toUpperCase().startsWith('A')) {
      const seniorResult = await signatureStep({
        stepId: `${workflowId}:seniorApproval`,
        userId: input.seniorApproverId,
        timeoutMs,
      });
      if (seniorResult.decision === 'reject') return;

      if (input.isFirstRequest) {
        const prelimResult = await signatureStep({
          stepId: `${workflowId}:preliminarySignature`,
          userId: input.preliminarySignerUserId,
          timeoutMs,
        });
        if (prelimResult.decision === 'reject') return;
      }
    }
  }

  await signatureStep({
    stepId: `${workflowId}:finalSignature`,
    userId: input.finalSignerUserId,
    timeoutMs,
  });
}
