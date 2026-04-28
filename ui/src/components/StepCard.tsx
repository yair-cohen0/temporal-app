import type { Step } from '../types';
import { SignalPanel } from './SignalPanel';

interface Props {
  step: Step;
  workflowId: string;
  isLast: boolean;
}

const STATUS_ICON: Record<Step['status'], string> = {
  waiting: '⏳',
  approved: '✓',
  rejected: '✗',
  signed: '✍',
  'timed-out': '⏱',
  endpoint: '⚡',
};

const STATUS_COLORS: Record<Step['status'], string> = {
  waiting: 'border-yellow-300 bg-yellow-50',
  approved: 'border-green-300 bg-green-50',
  rejected: 'border-red-300 bg-red-50',
  signed: 'border-blue-300 bg-blue-50',
  'timed-out': 'border-orange-300 bg-orange-50',
  endpoint: 'border-purple-300 bg-purple-50',
};

const STATUS_BADGE: Record<Step['status'], string> = {
  waiting: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  signed: 'bg-blue-100 text-blue-800',
  'timed-out': 'bg-orange-100 text-orange-800',
  endpoint: 'bg-purple-100 text-purple-800',
};

const TYPE_LABELS: Record<Step['type'], string> = {
  groupApproval: 'Group Approval',
  rankApproval: 'Rank Approval',
  signature: 'Signature',
  endpoint: 'Resource Grant',
};

function MetaRow({ label, value }: { label: string; value: string | number | undefined }) {
  if (value === undefined || value === '') return null;
  return (
    <span className="text-xs text-gray-500">
      {label}: <span className="font-medium text-gray-700">{value}</span>
    </span>
  );
}

function formatMs(ms: number): string {
  if (ms <= 0) return '—';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  return `${minutes}m`;
}

export function StepCard({ step, workflowId, isLast }: Props) {
  const cardColor = STATUS_COLORS[step.status];
  const badgeColor = STATUS_BADGE[step.status];

  return (
    <div className="flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 bg-white text-sm">
          {STATUS_ICON[step.status]}
        </div>
        {!isLast && <div className="mt-1 flex-1 w-px bg-gray-200" />}
      </div>

      {/* Card */}
      <div className={`mb-4 flex-1 rounded-lg border p-3 ${cardColor}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 font-mono">
                {step.stepId}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}>
                {step.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{TYPE_LABELS[step.type]}</p>
          </div>
          {step.scheduledAt && (
            <span className="text-xs text-gray-400 shrink-0">
              {new Date(step.scheduledAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
          <MetaRow label="Group" value={step.meta.groupId} />
          <MetaRow label="Rank" value={step.meta.rank} />
          <MetaRow label="User" value={step.meta.userId} />
          {step.meta.timeoutMs ? (
            <MetaRow label="Timeout" value={formatMs(step.meta.timeoutMs)} />
          ) : null}
          {step.meta.message && <MetaRow label="Message" value={step.meta.message} />}
        </div>

        {step.signal && (
          <div className="mt-2 rounded border border-gray-200 bg-white/60 p-2 text-xs">
            <span className="font-medium text-gray-700">{step.signal.actorId}</span>
            {' → '}
            <span className="capitalize font-medium">{step.signal.decision}</span>
            {step.signal.reason && (
              <span className="text-gray-500"> — {step.signal.reason}</span>
            )}
          </div>
        )}

        {step.status === 'waiting' && (
          <SignalPanel step={step} workflowId={workflowId} />
        )}
      </div>
    </div>
  );
}
