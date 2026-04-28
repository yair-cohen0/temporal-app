# Temporal Workflow Engine

A generic, Temporal-based workflow engine that orchestrates long-running, human-in-the-loop business processes. It exposes a REST API for starting and managing workflow executions, and a Worker process that drives workflow logic by writing side effects to a MongoDB `outbox` collection.

## The Outbox Pattern

The Worker never calls external APIs or sends notifications directly. Instead, it writes documents to a MongoDB collection called `outbox`. A separate consumer service (outside this project) reads the outbox and performs the actual side effects (e.g., sending emails, calling downstream APIs, granting access). When a human completes an action, the consumer signals back into the workflow via this API's signal endpoint.

This pattern ensures:
- **Durability** — every intended side effect is persisted before it happens
- **Audibility** — every action is recorded with full context (workflowId, runId, actorId, timestamp)
- **Decoupling** — this service does not need to know what the consumer does with the signals

## Running Locally

**1. Start Temporal server and its Postgres database:**
```bash
docker-compose -f docker/docker-compose.yml up -d
```
The Temporal UI is available at http://localhost:8233.

**2. Configure environment variables:**
```bash
cp .env.example .env
# Edit .env — at minimum set MONGO_URI and MONGO_DB
```

**3. Install dependencies:**
```bash
npm install
```

**4. Start the API server and Worker in separate terminals:**
```bash
npm run dev:api     # starts Express on port 3000
npm run dev:worker  # starts the Temporal Worker
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | API server listen port |
| `LOG_LEVEL` | `info` | Pino log level (`trace`, `debug`, `info`, `warn`, `error`) |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal server gRPC address |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `workflow-default` | Default task queue for the Worker |
| `MONGO_URI` | *(required)* | MongoDB connection URI |
| `MONGO_DB` | *(required)* | MongoDB database name |
| `MONGO_OUTBOX_COLLECTION` | `outbox` | Name of the outbox collection |

The application MongoDB is **not** included in the Docker Compose file. Provide your own MongoDB instance (local, Atlas, etc.).

## API Reference

Base path: `/api/v1`. All request/response bodies are JSON.

| Method | Path | Description |
|---|---|---|
| `POST` | `/workflows/:workflowType` | Start a workflow |
| `GET` | `/workflows/:workflowId` | Describe a workflow execution |
| `POST` | `/workflows/:workflowId/signals/:signalName` | Send a signal to a running workflow |
| `POST` | `/workflows/:workflowId/queries/:queryName` | Query a workflow's in-memory state |
| `POST` | `/workflows/:workflowId/cancel` | Gracefully cancel a workflow |
| `POST` | `/workflows/:workflowId/terminate` | Forcefully terminate a workflow |
| `GET` | `/workflows` | List executions with a Temporal visibility query |
| `GET` | `/workflows/:workflowId/history` | Fetch event history |
| `POST` | `/workflows/:workflowId/reset` | Reset to a prior history event |
| `GET` | `/health` | Health check (used by Docker) |

### Start a workflow
```http
POST /api/v1/workflows/exampleApprovalFlow
{
  "workflowId": "order-123",
  "taskQueue": "workflow-default",
  "args": [{ "requestedResource": "read-access", "groupId": "managers" }]
}
```
Returns `201 { workflowId, runId }`. Returns `409` with `WORKFLOW_ID_CONFLICT` if a workflow with that ID is already running — callers treat this as success (idempotent start).

### Send a signal (e.g., approve a step)
```http
POST /api/v1/workflows/order-123/signals/stepCompleted
{
  "args": [{
    "stepId": "managerApproval",
    "actorId": "user-456",
    "decision": "approve",
    "timestamp": "2024-01-15T10:30:00Z"
  }]
}
```

## Adding a New Workflow

1. Create `src/workflows/myNewWorkflow.ts` and export an async function:

```ts
export async function myNewWorkflow(input: MyInput): Promise<void> {
  // compose step primitives here
}
```

2. Export it from `src/workflows/index.ts`:
```ts
export * from './myNewWorkflow';
```

The Worker picks it up automatically via `workflowsPath: require.resolve('./workflows')`.

## Step Primitives

Four reusable building blocks for human-in-the-loop steps, from `src/shared/steps.ts`:

| Function | Waits for | Outbox actionType |
|---|---|---|
| `groupApproverStep({ stepId, groupId, timeoutMs })` | Any user in `groupId` | `awaitGroupApproval` |
| `rankApproverStep({ stepId, rank, timeoutMs })` | Any user with `rank` | `awaitRankApproval` |
| `signatureStep({ stepId, userId, timeoutMs })` | Specific `userId` | `awaitSignature` |
| `endpointStep({ resource, message? })` | Nothing (fire-and-forget) | `endpoint` |

Each waiting step: writes an outbox doc → blocks on the `stepCompleted` signal filtered by `stepId` → returns `SignalPayload`. On timeout, writes a `timeout` outbox doc and throws `ApplicationFailure` with type `StepTimeoutError`.

### Example workflow (see `src/workflows/exampleApprovalFlow.ts`)
```ts
export async function exampleApprovalFlow(input: ExampleApprovalInput): Promise<void> {
  const decision = await groupApproverStep({
    stepId: 'managerApproval',
    groupId: input.groupId,
    timeoutMs: 24 * 60 * 60 * 1000,
  });

  if (decision.decision === 'reject') return;

  await endpointStep({ resource: input.requestedResource });
}
```

## Workflow Viewer UI

A standalone React app (`ui/`) for inspecting and advancing workflow executions directly from a browser — no separate tooling required.

**Start it:**
```bash
cd ui
npm install   # first time only
npm run dev   # http://localhost:5173
```

> The API server (`npm run dev:api`) must be running. The UI dev server proxies `/api` → `localhost:3000`, so no CORS configuration is needed in development.

**What it does:**

1. Enter any `workflowId` in the search field. The ID is saved in the URL hash (`#workflowId`) so you can bookmark or share links.
2. The header shows workflow status (RUNNING / COMPLETED / FAILED / etc.), type, task queue, start/close times, and event count.
3. The **Step Timeline** reconstructs every human-in-the-loop step from the Temporal event history:
   - Completed steps show who acted and what decision they made.
   - The currently **waiting** step shows an inline **Advance Step** form with Actor ID, Decision (approve / reject / sign), and an optional reason field.
4. Clicking **Send Signal** posts a `stepCompleted` signal to the API, which forwards it into the workflow. The timeline refreshes automatically.
5. Polling runs every 3 seconds while the workflow is RUNNING and stops automatically on terminal states (COMPLETED, FAILED, CANCELLED, etc.).

**Tech stack:** Vite + React + TypeScript, TanStack Query v5, Tailwind CSS v3.

## Architecture Notes

See [CLAUDE.md](./CLAUDE.md) for constraint documentation, ID conventions, idempotency guarantees, and other non-obvious design decisions.
