import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWorkflow, fetchHistory } from './api';
import { parseHistory, resolveStatus, TERMINAL_STATUSES } from './parseHistory';
import { WorkflowInput } from './components/WorkflowInput';
import { ConnectionBadge } from './components/ConnectionBadge';
import { WorkflowHeader } from './components/WorkflowHeader';
import { StepTimeline } from './components/StepTimeline';
import { ErrorBanner } from './components/ErrorBanner';

function getHashId(): string {
  return decodeURIComponent(window.location.hash.slice(1));
}

function setHashId(id: string) {
  window.location.hash = encodeURIComponent(id);
}

export default function App() {
  const [workflowId, setWorkflowId] = useState(getHashId);

  useEffect(() => {
    function onHashChange() {
      setWorkflowId(getHashId());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function handleLoad(id: string) {
    setHashId(id);
    setWorkflowId(id);
  }

  const enabled = workflowId.length > 0;

  const workflowQuery = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: () => fetchWorkflow(workflowId),
    enabled,
    // Use query.state.data to avoid referencing `workflowQuery` before it's assigned
    refetchInterval: (query) => {
      const status = resolveStatus((query.state.data as { status?: unknown } | undefined)?.status);
      return TERMINAL_STATUSES.has(status) ? false : 3_000;
    },
  });

  const workflowStatus = resolveStatus(workflowQuery.data?.status);
  const isPolling = enabled && !TERMINAL_STATUSES.has(workflowStatus);

  const historyQuery = useQuery({
    queryKey: ['history', workflowId],
    queryFn: () => fetchHistory(workflowId),
    enabled,
    refetchInterval: isPolling ? 3_000 : false,
  });

  const steps = historyQuery.data ? parseHistory(historyQuery.data.events) : [];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">Workflow Viewer</h1>
          <ConnectionBadge />
        </div>

        {/* Search */}
        <div className="mb-6">
          <WorkflowInput onSubmit={handleLoad} initial={workflowId} />
        </div>

        {/* Error states */}
        {workflowQuery.isError && (
          <div className="mb-4">
            <ErrorBanner message={(workflowQuery.error as Error).message} />
          </div>
        )}
        {historyQuery.isError && !workflowQuery.isError && (
          <div className="mb-4">
            <ErrorBanner message={`History: ${(historyQuery.error as Error).message}`} />
          </div>
        )}

        {/* Loading state */}
        {enabled && workflowQuery.isLoading && (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        )}

        {/* Workflow content */}
        {workflowQuery.data && (
          <div className="space-y-4">
            <WorkflowHeader
              workflow={workflowQuery.data}
              onRefresh={() => {
                void workflowQuery.refetch();
                void historyQuery.refetch();
              }}
            />

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Step Timeline
                {historyQuery.isFetching && (
                  <span className="ml-2 font-normal normal-case text-gray-400">refreshing…</span>
                )}
              </h3>
              <StepTimeline steps={steps} workflowId={workflowId} />
            </div>
          </div>
        )}

        {/* Empty prompt */}
        {!enabled && (
          <div className="py-16 text-center text-sm text-gray-400">
            Enter a workflow ID above to get started.
          </div>
        )}
      </div>
    </div>
  );
}
