import type { Step } from '../types';
import { StepCard } from './StepCard';

interface Props {
  steps: Step[];
  workflowId: string;
}

export function StepTimeline({ steps, workflowId }: Props) {
  if (steps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
        No steps recorded yet. The workflow may be initializing.
      </div>
    );
  }

  return (
    <div>
      {steps.map((step, i) => (
        <StepCard
          key={step.stepId + i}
          step={step}
          workflowId={workflowId}
          isLast={i === steps.length - 1}
        />
      ))}
    </div>
  );
}
