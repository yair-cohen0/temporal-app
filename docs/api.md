# API Reference

Base URL: `http://localhost:3000/api/v1`

All request and response bodies are JSON. All error responses follow the same envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

---

## Table of Contents

1. [Start a Workflow](#1-start-a-workflow)
2. [Describe a Workflow](#2-describe-a-workflow)
3. [Send a Signal](#3-send-a-signal)
4. [Run a Query](#4-run-a-query)
5. [Cancel a Workflow](#5-cancel-a-workflow)
6. [Terminate a Workflow](#6-terminate-a-workflow)
7. [List Workflows](#7-list-workflows)
8. [Get Event History](#8-get-event-history)
9. [Reset a Workflow](#9-reset-a-workflow)
10. [Health Check](#10-health-check)

---

## 1. Start a Workflow

```
POST /workflows/:workflowType
```

Starts a new workflow execution. The workflow type must match the name of a function exported from `src/workflows/index.ts`.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `workflowType` | string | Name of the workflow function to run (e.g., `exampleApprovalFlow`, `permissionApprovalFlow`) |

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `workflowId` | string | ✓ | Unique identifier for this execution. **Must be supplied by the caller** — the server never generates it. Use the same ID on retry to achieve idempotent starts (see 409 below). |
| `taskQueue` | string | ✓ | Name of the Worker pool that will execute this workflow. Must match the `TEMPORAL_TASK_QUEUE` env var of a running Worker (default: `workflow-default`). |
| `args` | unknown[] | | Input arguments passed to the workflow function. Should match the workflow's input type. Defaults to `[]`. **Always wrap the input in an array** — e.g., `"args": [{ "groupId": "managers" }]`, not `"args": { "groupId": "managers" }`. Temporal spreads `args` as positional parameters into the workflow function: `args: [myObj]` is equivalent to calling `myWorkflow(myObj)`. Passing the object directly (without the array) delivers `undefined` to the workflow function. |
| `searchAttributes` | object | | Key-value metadata indexed by Temporal for visibility queries. Values must be arrays. |
| `memo` | object | | Arbitrary key-value data attached to the execution. Not indexed, visible in describe/list responses. |
| `workflowExecutionTimeout` | string | | Max lifetime of the entire execution including retries (e.g., `"24h"`, `"3600s"`). |
| `workflowRunTimeout` | string | | Max lifetime of a single run attempt. |
| `workflowTaskTimeout` | string | | Max time a single workflow task can take to process (rarely needed). |
| `workflowIdReusePolicy` | string | | Controls whether the same `workflowId` can be reused after completion. Values: `ALLOW_DUPLICATE`, `ALLOW_DUPLICATE_FAILED_ONLY`, `REJECT_DUPLICATE`, `TERMINATE_IF_RUNNING`. |
| `retryPolicy` | object | | How to retry the workflow on failure. See [Retry Policy](#retry-policy). |
| `cronSchedule` | string | | Cron expression to run the workflow on a schedule (e.g., `"0 9 * * MON-FRI"`). |

#### Retry Policy

| Field | Type | Description |
|---|---|---|
| `initialInterval` | string \| number | Delay before first retry (e.g., `"1s"`). |
| `backoffCoefficient` | number | Multiplier applied to interval on each retry. |
| `maximumInterval` | string \| number | Cap on retry delay. |
| `maximumAttempts` | integer | Maximum number of attempts (0 = unlimited). |
| `nonRetryableErrorTypes` | string[] | Error type names that should not be retried. |

### Responses

**`201 Created`** — Workflow started successfully.
```json
{
  "workflowId": "order-123",
  "runId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field | Description |
|---|---|
| `workflowId` | The ID you supplied. |
| `runId` | Temporal's internal ID for this specific run attempt. Changes on reset or continue-as-new. |

**`409 Conflict`** — A workflow with this `workflowId` is already running. Callers should treat this identically to `201` — it confirms the workflow exists.
```json
{
  "error": {
    "code": "WORKFLOW_ID_CONFLICT",
    "message": "Workflow with id \"order-123\" is already running"
  }
}
```

**`400 Bad Request`** — Request body failed validation.

### Example

```bash
curl -X POST http://localhost:3000/api/v1/workflows/exampleApprovalFlow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "order-123",
    "taskQueue": "workflow-default",
    "args": [{
      "requestedResource": "read-access",
      "groupId": "qa-team"
    }]
  }'
```

---

## 2. Describe a Workflow

```
GET /workflows/:workflowId
```

Returns the current state and metadata of a workflow execution.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The workflow execution ID. |

### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `runId` | string | Pin to a specific run. If omitted, returns the latest run for this `workflowId`. |

### Response

**`200 OK`**
```json
{
  "workflowId": "order-123",
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "RUNNING",
  "type": "exampleApprovalFlow",
  "taskQueue": "workflow-default",
  "startTime": "2024-01-15T09:00:00.000Z",
  "closeTime": null,
  "historyLength": 12,
  "memo": {},
  "searchAttributes": {},
  "parentExecution": null
}
```

| Field | Description |
|---|---|
| `status` | Current state: `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `TERMINATED`, `TIMED_OUT`, `CONTINUED_AS_NEW` |
| `runId` | Temporal's run ID for this attempt. |
| `type` | Workflow function name. |
| `startTime` | ISO 8601 timestamp when the workflow started. |
| `closeTime` | ISO 8601 timestamp when the workflow ended, or `null` if still running. |
| `historyLength` | Number of events recorded in the execution history. |

**`404 Not Found`** — No workflow found with that ID.

### Example

```bash
curl http://localhost:3000/api/v1/workflows/order-123
```

---

## 3. Send a Signal

```
POST /workflows/:workflowId/signals/:signalName
```

Sends a signal into a running workflow. Signals are the mechanism for advancing human-in-the-loop steps.

The primary signal used by this system is `stepCompleted`, which unblocks a waiting step.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The workflow execution ID. |
| `signalName` | string | Name of the signal. Use `stepCompleted` to advance an approval or signature step. |

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | string | | Pin the signal to a specific run. If omitted, targets the latest run. |
| `args` | unknown[] | | Arguments delivered to the signal handler. Defaults to `[]`. **Always wrap the payload in an array** — Temporal spreads `args` as positional parameters into the signal handler. |

#### `stepCompleted` Signal Payload

When signaling `stepCompleted`, `args` must contain exactly one object:

| Field | Type | Required | Description |
|---|---|---|---|
| `stepId` | string | ✓ | Must exactly match the `stepId` the workflow registered for the waiting step. |
| `actorId` | string | ✓ | ID of the user taking the action (e.g., email, user UUID). |
| `decision` | string | ✓ | `"approve"`, `"reject"`, or `"sign"`. Determines the next step in the workflow. |
| `reason` | string | | Optional explanation for the decision. Recorded in the outbox and history. |
| `payload` | unknown | | Optional extra data from the actor (e.g., form values, attachments). |
| `timestamp` | string | ✓ | ISO 8601 timestamp of when the actor acted. |

### Responses

**`204 No Content`** — Signal delivered successfully.

**`404 Not Found`** — No workflow found with that ID.

**`400 Bad Request`** — Request body failed validation.

### Example — approve a step

```bash
curl -X POST http://localhost:3000/api/v1/workflows/order-123/signals/stepCompleted \
  -H "Content-Type: application/json" \
  -d '{
    "args": [{
      "stepId": "order-123:managerApproval",
      "actorId": "alice@example.com",
      "decision": "approve",
      "reason": "Looks good",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }]
  }'
```

### Example — reject a step

```bash
curl -X POST http://localhost:3000/api/v1/workflows/order-123/signals/stepCompleted \
  -H "Content-Type: application/json" \
  -d '{
    "args": [{
      "stepId": "order-123:managerApproval",
      "actorId": "bob@example.com",
      "decision": "reject",
      "reason": "Missing budget approval",
      "timestamp": "2024-01-15T11:00:00.000Z"
    }]
  }'
```

---

## 4. Run a Query

```
POST /workflows/:workflowId/queries/:queryName
```

Executes a query against the workflow's in-memory state. Queries are synchronous read-only operations — they do not alter workflow execution.

> **Note:** Queries only work on **RUNNING** workflows. A completed or terminated workflow cannot be queried.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The workflow execution ID. |
| `queryName` | string | Name of the query handler registered in the workflow code. |

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | string | | Pin to a specific run. |
| `args` | unknown[] | | Arguments passed to the query handler. Defaults to `[]`. |

### Response

**`200 OK`**
```json
{
  "result": "<whatever the query handler returns>"
}
```

**`404 Not Found`** — No workflow found with that ID.

### Example

```bash
curl -X POST http://localhost:3000/api/v1/workflows/order-123/queries/getStatus \
  -H "Content-Type: application/json" \
  -d '{ "args": [] }'
```

---

## 5. Cancel a Workflow

```
POST /workflows/:workflowId/cancel
```

Requests a graceful cancellation. The workflow receives a `CancelledFailure` and can handle cleanup logic before ending. This is cooperative — the workflow can choose to delay or ignore the request.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The workflow execution ID. |

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | string | | Pin to a specific run. |
| `reason` | string | | Human-readable reason. Logged but not passed to the workflow (Temporal SDK limitation). |

### Responses

**`204 No Content`** — Cancellation request delivered.

**`404 Not Found`** — No workflow found with that ID.

### Example

```bash
curl -X POST http://localhost:3000/api/v1/workflows/order-123/cancel \
  -H "Content-Type: application/json" \
  -d '{ "reason": "User withdrew their request" }'
```

---

## 6. Terminate a Workflow

```
POST /workflows/:workflowId/terminate
```

Immediately and forcefully stops a workflow, with no chance for cleanup. Use this when a workflow is stuck or needs to be killed. Prefer cancel when cleanup matters.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The workflow execution ID. |

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `runId` | string | | Pin to a specific run. |
| `reason` | string | | Human-readable reason for termination. Recorded in history. |
| `details` | unknown[] | | Additional structured details attached to the termination event. |

### Responses

**`204 No Content`** — Workflow terminated.

**`404 Not Found`** — No workflow found with that ID.

### Example

```bash
curl -X POST http://localhost:3000/api/v1/workflows/order-123/terminate \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Compliance hold — do not process" }'
```

---

## 7. List Workflows

```
GET /workflows
```

Lists workflow executions using Temporal's visibility store. Supports filtering with a SQL-like query string and pagination.

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | | Temporal visibility query (e.g., `WorkflowType='exampleApprovalFlow' AND ExecutionStatus='Running'`). Defaults to all executions. |
| `pageSize` | integer | | Number of results per page. Range: 1–1000. Default: 100. |
| `nextPageToken` | string | | Opaque token from the previous response to fetch the next page. |

#### Common Query Fields

| Field | Example |
|---|---|
| `WorkflowType` | `WorkflowType='exampleApprovalFlow'` |
| `ExecutionStatus` | `ExecutionStatus='Running'` |
| `WorkflowId` | `WorkflowId='order-123'` |
| `StartTime` | `StartTime > '2024-01-01T00:00:00Z'` |

### Response

**`200 OK`**
```json
{
  "executions": [
    {
      "execution": { "workflowId": "order-123", "runId": "..." },
      "type": { "name": "exampleApprovalFlow" },
      "startTime": "...",
      "status": 1
    }
  ],
  "nextPageToken": "base64encodedtoken=="
}
```

| Field | Description |
|---|---|
| `executions` | Array of raw Temporal execution objects. |
| `nextPageToken` | Present only if more pages exist. Pass it back as the `nextPageToken` query parameter to fetch the next page. |

### Examples

```bash
# List all running workflows
curl "http://localhost:3000/api/v1/workflows?query=ExecutionStatus%3D'Running'"

# List a specific workflow type, newest first
curl "http://localhost:3000/api/v1/workflows?query=WorkflowType%3D'permissionApprovalFlow'&pageSize=20"

# Fetch page 2
curl "http://localhost:3000/api/v1/workflows?nextPageToken=abc123=="
```

---

## 8. Get Event History

```
GET /workflows/:workflowId/history
```

Returns the full event history of a workflow execution. This is the source of truth for everything that has happened in the workflow: activities scheduled, signals received, timers, workflow task completions, etc.

The Workflow Viewer UI (`ui/`) uses this endpoint to reconstruct the step timeline.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The workflow execution ID. |

### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `runId` | string | | Pin to a specific run. |
| `pageSize` | integer | | Events per page. Range: 1–1000. |
| `nextPageToken` | string | | Token from previous response to fetch the next page. |
| `eventFilterType` | string | | `ALL_EVENT` (default) or `CLOSE_EVENT` (only the final event). |

### Response

**`200 OK`**
```json
{
  "events": [
    {
      "eventId": "1",
      "eventType": "EVENT_TYPE_WORKFLOW_EXECUTION_STARTED",
      "eventTime": "2024-01-15T09:00:00.000Z",
      "workflowExecutionStartedEventAttributes": { ... }
    },
    {
      "eventId": "4",
      "eventType": "EVENT_TYPE_ACTIVITY_TASK_SCHEDULED",
      "activityTaskScheduledEventAttributes": {
        "activityType": { "name": "awaitRankApproval" },
        "input": {
          "payloads": [{
            "metadata": { "encoding": "anNvbi9wbGFpbg==" },
            "data": "<base64-encoded JSON>"
          }]
        }
      }
    },
    {
      "eventId": "7",
      "eventType": "EVENT_TYPE_WORKFLOW_EXECUTION_SIGNALED",
      "workflowExecutionSignaledEventAttributes": {
        "signalName": "stepCompleted",
        "input": { "payloads": [{ "data": "<base64-encoded JSON>" }] }
      }
    }
  ],
  "nextPageToken": "base64encodedtoken=="
}
```

> **Payload encoding:** Activity inputs and signal payloads are base64-encoded JSON. Decode with `atob(data)` (browser) or `Buffer.from(data, 'base64').toString()` (Node.js), then `JSON.parse`.
>
> Activity inputs are `OutboxDocInput` objects — the step parameters live inside `actionConfig`, not at the top level.

**`404 Not Found`** — No workflow found with that ID.

### Example

```bash
curl "http://localhost:3000/api/v1/workflows/order-123/history?pageSize=100"
```

---

## 9. Reset a Workflow

```
POST /workflows/:workflowId/reset
```

Resets a workflow to a specific point in its history, creating a new run from that event forward. Events after the reset point are replayed. Useful for recovering from bugs or reprocessing after a code fix.

> **Warning:** This creates a new `runId`. Any work done after the reset point is discarded and must be re-done. Use with care in production.

### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `workflowId` | string | The workflow execution ID. |

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `eventId` | integer | ✓ | The history event ID to reset to. Typically the ID of the last `WorkflowTaskCompleted` event before the problem. Retrieve event IDs from the `/history` endpoint. |
| `reason` | string | ✓ | Human-readable explanation for the reset. Recorded in history. |
| `runId` | string | | Pin to a specific run to reset. |
| `resetReapplyType` | string | | Controls which events are reapplied after the reset. Values: `ALL`, `SIGNAL`, `NONE`. Default: `ALL`. |

### Response

**`200 OK`**
```json
{
  "workflowId": "order-123",
  "newRunId": "new-run-id-here"
}
```

**`404 Not Found`** — No workflow found with that ID.

### Example

```bash
# First, find the eventId to reset to
curl "http://localhost:3000/api/v1/workflows/order-123/history"

# Then reset
curl -X POST http://localhost:3000/api/v1/workflows/order-123/reset \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": 8,
    "reason": "Bug fix deployed — reprocessing from approval step"
  }'
```

---

## 10. Health Check

```
GET /health
```

Returns the health of the service and its connection to Temporal. Used by Docker and load balancers to determine if the API server is ready to serve traffic.

### Response

**`200 OK`**
```json
{
  "status": "ok",
  "temporal": {
    "connected": true,
    "namespace": "default"
  }
}
```

**`200 OK`** (degraded — Temporal unreachable)
```json
{
  "status": "degraded",
  "temporal": {
    "connected": false,
    "namespace": "default"
  }
}
```

| Field | Description |
|---|---|
| `status` | `"ok"` if fully operational, `"degraded"` if Temporal is unreachable. |
| `temporal.connected` | Whether the API server has a live gRPC connection to Temporal. |
| `temporal.namespace` | The Temporal namespace this server is connected to. |

### Example

```bash
curl http://localhost:3000/api/v1/health
```

---

## Error Reference

All error responses share the same envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

| Code | HTTP Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body or query params failed Zod schema validation. |
| `NOT_FOUND` | 404 | No workflow execution found for the given `workflowId`. |
| `WORKFLOW_ID_CONFLICT` | 409 | A workflow with the given `workflowId` is already running. Treat as success. |
| `INTERNAL_ERROR` | 500 | Unexpected server or Temporal error. |
