/**
 * Minimal example workflow demonstrating step primitive composition.
 * A manager approves, then the endpoint step grants the resource.
 */
import { groupApproverStep, endpointStep } from '../shared/steps';
import { workflowInfo } from '@temporalio/workflow';

export interface ExampleApprovalInput {
  requestedResource: string;
  groupId: string;
}

export async function exampleApprovalFlow(input: ExampleApprovalInput): Promise<void> {
  const { requestedResource, groupId } = input;
  // Prefix stepId with workflowId so actionId is globally unique across executions.
  const { workflowId } = workflowInfo();

  // Wait for any user in the group to approve or reject (24-hour timeout)
  const decision = await groupApproverStep({
    stepId: `${workflowId}:managerApproval`,
    groupId,
    timeoutMs: 24 * 60 * 60 * 1000,
  });

  if (decision.decision === 'reject') {
    // Workflow ends without granting the resource
    return;
  }

  // Write the endpoint outbox doc — consumer service will grant the resource
  await endpointStep({ resource: requestedResource, message: `Approved by ${decision.actorId}` });
}
