import type {
  WorkflowDescribeResponse,
  HistoryResponse,
  HealthResponse,
  SignalPayload,
} from './types';

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    const message = (body as { error?: { message?: string } }).error?.message ?? res.statusText;
    throw new Error(`${res.status}: ${message}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function fetchWorkflow(workflowId: string): Promise<WorkflowDescribeResponse> {
  return apiFetch(`/api/v1/workflows/${encodeURIComponent(workflowId)}`);
}

export function fetchHistory(workflowId: string): Promise<HistoryResponse> {
  return apiFetch(`/api/v1/workflows/${encodeURIComponent(workflowId)}/history?pageSize=1000`);
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiFetch('/api/v1/health');
}

export function sendSignal(workflowId: string, payload: SignalPayload): Promise<void> {
  return apiFetch(`/api/v1/workflows/${encodeURIComponent(workflowId)}/signals/stepCompleted`, {
    method: 'POST',
    body: JSON.stringify({ args: [payload] }),
  });
}
