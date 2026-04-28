import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendSignal } from '../api';
import type { Step, SignalPayload } from '../types';

interface Props {
  step: Step;
  workflowId: string;
}

const DECISION_OPTIONS: Record<Step['type'], Array<SignalPayload['decision']>> = {
  groupApproval: ['approve', 'reject'],
  rankApproval: ['approve', 'reject'],
  signature: ['sign', 'reject'],
  endpoint: [],
};

export function SignalPanel({ step, workflowId }: Props) {
  const queryClient = useQueryClient();
  const options = DECISION_OPTIONS[step.type];

  const [actorId, setActorId] = useState('');
  const [decision, setDecision] = useState<SignalPayload['decision']>(options[0] ?? 'approve');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: SignalPayload) => sendSignal(workflowId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflow', workflowId] });
      void queryClient.invalidateQueries({ queryKey: ['history', workflowId] });
    },
  });

  if (options.length === 0) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actorId.trim()) return;
    mutation.mutate({
      stepId: step.stepId,
      actorId: actorId.trim(),
      decision,
      reason: reason.trim() || undefined,
      timestamp: new Date().toISOString(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-700">
        Advance Step
      </p>

      {mutation.isError && (
        <p className="mb-2 text-xs text-red-600">{(mutation.error as Error).message}</p>
      )}

      <div className="flex flex-col gap-2">
        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">Actor ID</label>
          <input
            type="text"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            placeholder="e.g. user@example.com"
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
            required
          />
        </div>

        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">Decision</label>
          <div className="flex gap-3">
            {options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-1 text-xs capitalize"
              >
                <input
                  type="radio"
                  name={`decision-${step.stepId}`}
                  value={opt}
                  checked={decision === opt}
                  onChange={() => setDecision(opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-0.5 block text-xs font-medium text-gray-600">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={mutation.isPending || !actorId.trim()}
          className="self-start rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Sending…' : 'Send Signal'}
        </button>
      </div>
    </form>
  );
}
