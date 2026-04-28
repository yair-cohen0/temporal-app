import type { WorkflowDescribeResponse } from '../types';
import { resolveStatus, TERMINAL_STATUSES } from '../parseHistory';

const STATUS_COLORS: Record<string, string> = {
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-yellow-100 text-yellow-700',
  TERMINATED: 'bg-red-100 text-red-700',
  TIMED_OUT: 'bg-orange-100 text-orange-700',
  CONTINUED_AS_NEW: 'bg-purple-100 text-purple-700',
  UNKNOWN: 'bg-gray-100 text-gray-600',
};

interface Props {
  workflow: WorkflowDescribeResponse;
  onRefresh?: () => void;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function WorkflowHeader({ workflow, onRefresh }: Props) {
  const status = resolveStatus(workflow.status);
  const colorClass = STATUS_COLORS[status] ?? STATUS_COLORS.UNKNOWN;
  const isTerminal = TERMINAL_STATUSES.has(status);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-mono text-sm font-semibold text-gray-900 break-all">
              {workflow.workflowId}
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
            >
              {status}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
            <span>
              Type: <span className="font-medium text-gray-700">{workflow.type}</span>
            </span>
            <span>
              Queue: <span className="font-medium text-gray-700">{workflow.taskQueue}</span>
            </span>
            <span>
              Started:{' '}
              <span className="font-medium text-gray-700">{formatDate(workflow.startTime)}</span>
            </span>
            {workflow.closeTime && (
              <span>
                Closed:{' '}
                <span className="font-medium text-gray-700">{formatDate(workflow.closeTime)}</span>
              </span>
            )}
            <span>
              Events: <span className="font-medium text-gray-700">{workflow.historyLength}</span>
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-gray-400">run: {workflow.runId}</p>
        </div>
        {isTerminal && onRefresh && (
          <button
            onClick={onRefresh}
            className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
