# CodeForge

CodeForge is a queue-backed asynchronous multi-language code execution platform focused on sandboxed evaluation, worker recovery, operational visibility, and deterministic execution pipelines. The project demonstrates backend infrastructure behavior, execution reliability, and operational correctness under real-world conditions.

---

## Live Demo

**[CodeForge Live](https://codeforgeapp.duckdns.org)**

---

## Screenshots

![Dashboard Overview](docs/screenshots/dashboard.png)

![Code Editor](docs/screenshots/editor.png)

![Run Execution](docs/screenshots/ran.png)

![Submit Execution](docs/screenshots/submit.png)

![Execution Verdict](docs/screenshots/verdict.png)

---

## Features

- Multi-language execution (JS, Python, C, C++, Java)
- Docker-isolated sandboxing
- Queue-backed asynchronous execution
- BullMQ distributed worker architecture
- Runtime and memory limit enforcement
- Dead-letter queue (DLQ) recovery
- Persistent submission history tracking
- Seamless problem navigation and serial indexing
- Operational metrics and worker heartbeats
- Production-ready deployment configuration

---

## Tech Stack

- **Frontend:** Next.js 16, React, TypeScript, Tailwind CSS
- **Backend:** Next.js App Router API routes, Node.js (Worker Process)
- **Queue & Persistence:** BullMQ, Redis, Prisma ORM (v7+), PostgreSQL (Neon Serverless compatible)
- **Infrastructure:** Docker, Docker Compose
- **Deployment:** Azure VM, Caddy Reverse Proxy, DuckDNS

---

## Production Deployment

CodeForge is deployed on an Azure VM using Docker Compose orchestration with dedicated BullMQ workers, Redis queue infrastructure, Neon Serverless PostgreSQL persistence, Docker sandbox execution, and Caddy reverse proxying for automatic TLS.

Frontend traffic communicates exclusively through the reverse proxy layer (`/api`) rather than directly exposing backend services publicly.

---

## What CodeForge Is

CodeForge is designed as:
- An async execution platform
- A queue-backed evaluation system
- A worker-driven sandbox execution pipeline
- An operationally verifiable backend system

Core characteristics:
- Asynchronous execution lifecycle
- Docker-based isolated execution
- Retries and dead-letter handling
- Deterministic verdict evaluation
- Worker heartbeat visibility
- Operational recovery validation
- Cleanup auditing

CodeForge is intentionally **not**:
- A contest platform
- A LeetCode clone
- A gamified coding website
- A microservices/Kubernetes showcase

---

## Why Queue-Backed Execution?

Execution workloads are intentionally separated from the HTTP request lifecycle to:
- Avoid blocking API workers
- Support retries and recovery
- Isolate execution concerns from UI/API concerns
- Provide operational visibility
- Handle long-running or failing workloads safely
- Support deterministic execution pipelines

This architecture allows the platform to behave more like a real execution system instead of a synchronous request-response demo.

---

## Architecture Overview

```text
┌──────────────────────────────┐
│          Client UI           │
│  (Next.js Frontend + Polling)│
└──────────────┬───────────────┘
               │
               ▼
┌──────────────────────────────┐
│      Next.js API Routes      │
│ Auth • Run • Submit • Queue  │
└──────────────┬───────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ PostgreSQL   │  │ Redis/BullMQ │
│ Prisma ORM   │  │ Queue Engine │
└──────┬───────┘  └──────┬───────┘
       │                 │
       │                 ▼
       │       ┌─────────────────┐
       │       │ Worker Process  │
       │       │ Retry + DLQ     │
       │       │ Heartbeats      │
       │       └────────┬────────┘
       │                │
       │                ▼
       │      ┌──────────────────┐
       │      │ Docker Sandbox   │
       │      │ JS • Python • C  │
       │      │ C++ • Java       │
       │      └────────┬─────────┘
       │               │
       └───────────────▼
        Execution Results + Verdicts
```

---

## Core Concepts

### Asynchronous Execution Pipeline
- API requests enqueue execution jobs.
- BullMQ + Redis orchestrate execution.
- Dedicated workers process jobs asynchronously.
- Frontend polls execution status independently.

### Run vs Submit Model

**Run Code**
- Ephemeral execution.
- Custom input support.
- Fast iteration workflow.
- No persistent submission record.

**Submit**
- Persistent DB-backed evaluation.
- Hidden test case execution.
- Deterministic verdict aggregation.
- Retry and DLQ support.
- Submission history tracking.

### Submission Lifecycle
`QUEUED` → `RUNNING` → `COMPLETED` | `FAILED`

### Deterministic Verdict Priority
`COMPILATION_ERROR` > `TIMEOUT` > `RUNTIME_ERROR` > `WRONG_ANSWER` > `ACCEPTED`

---

## Sandbox Design

CodeForge aims for reasonable isolation for a portfolio-grade execution sandbox — not cloud-provider-grade hostile multi-tenant security.

Current isolation model includes:
- Docker-based execution
- Timeout enforcement
- Stdout/stderr truncation
- Non-root execution
- Read-only root filesystem
- tmpfs-backed writable workspace
- Cleanup auditing

### Workspace Modes

**No-Host-Mount Mode (Recommended)**
```bash
CODEFORGE_SANDBOX_USE_HOST_MOUNT=0
```
Characteristics:
- Avoids host temp-dir leaks
- Writable tmpfs-backed workspace
- Reduced host filesystem exposure

**Host-Mount Mode (Dev / Fallback)**
```bash
CODEFORGE_SANDBOX_USE_HOST_MOUNT=1
```
Characteristics:
- Bind-mounted host workspace
- Easier local debugging
- Less isolated than tmpfs mode

---

## Operational Visibility & Recovery

### Worker Heartbeats
Workers publish TTL-based heartbeat keys into Redis. Queue health endpoints expose:
- Online workers
- Active jobs
- Worker status
- Heartbeat TTL information

This allows operational liveness verification instead of assuming workers are healthy.

### Request Tracing
Every run/submission receives a `requestId` propagated through:
- API layer
- Queue job metadata
- Worker logs
- Run-status responses

Identifiers used: `requestId`, `jobId`, `submissionId`, `runId`.

### Dead Letter Queue (DLQ)
Failed jobs move into a DLQ with:
- Retry metadata
- Replay tracking
- Failure categorization
- Operational inspection endpoints

Supported failure categories include: `INFRA_FAILURE`, `SANDBOX_ERROR`, `REDIS_ERROR`, `EXECUTION_TIMEOUT`, `COMPILATION_ERROR`.

DLQ endpoints support inspection, replay/requeue, and deletion.

### Queue Metrics
Operational metrics include:
- Runtime averages
- Queue wait averages
- Retry frequency
- Failure distributions
- Worker health visibility

---

## Validation & Operational Testing

The project includes dedicated validation scripts to verify operational behavior.

### Abuse Validation
Tests: Infinite loop timeout handling, stdout spam truncation, memory pressure handling.
```bash
npm run ops:abuse-infinite-loop
npm run ops:abuse-stdout-spam
npm run ops:abuse-memory-pressure
```
Pass conditions: Timeouts enforced, truncation enforced, worker survives, no container leaks, no temp-dir leaks.

### Cleanup Validation
Validates: No orphan execution containers, no orphan temp directories.
```bash
npm run ops:audit-cleanup
```

### Recovery Validation
Tests: Redis restart recovery, worker hard-kill recovery, DB-backed submission recovery.
```bash
npm run ops:recovery-redis-restart
npm run ops:recovery-kill-worker
npm run ops:recovery-kill-worker-submission
```
Pass conditions: Retries recover correctly, no zombie RUNNING submissions, queue state remains truthful.

### Heartbeat Validation
Tests: Heartbeat TTL expiry, graceful shutdown cleanup, worker liveness tracking.
```bash
npm run ops:check-heartbeats
npm run ops:validate-heartbeat-expiry
npm run ops:validate-worker-shutdown
```

---

## Operational Endpoints

**Queue Health** 
`GET /api/queue/health`
Provides: Worker heartbeat state, queue counts, active jobs, stalled jobs.

**Queue Metrics** 
`GET /api/queue/metrics`
Provides: Runtime metrics, retry metrics, queue latency information, failure distributions.

**DLQ Operations**
- `GET /api/queue/dlq`
- `POST /api/queue/dlq/[id]/requeue`
- `POST /api/queue/dlq/[id]/delete`

---

## Local Setup

### Prerequisites
- Node.js
- Docker
- PostgreSQL
- Redis

### Environment Setup
Create a `.env` file:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/codeforge"
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
JWT_SECRET="replace_with_a_strong_secret"
```

Optional operational variables:
```env
CODEFORGE_WORKER_ID=
CODEFORGE_WORKER_HEARTBEAT_INTERVAL_MS=
CODEFORGE_WORKER_HEARTBEAT_TTL_MS=
CODEFORGE_GRACEFUL_SHUTDOWN_TIMEOUT_MS=
CODEFORGE_SELF_SHUTDOWN_AFTER_MS=
CODEFORGE_STALE_RUNNING_TIMEOUT_MS=
CODEFORGE_STALE_RECOVERY_INTERVAL_MS=
CODEFORGE_SANDBOX_USE_HOST_MOUNT=
CODEFORGE_SANDBOX_WORKSPACE_TMPFS_MB=
```

### Install Dependencies
```bash
npm install
```

### Generate Prisma Client
```bash
npx prisma generate
```

### Apply Database Migrations
```bash
npx prisma migrate deploy
```

### Seed Database
```bash
npm run db:seed
```
Seed includes 20 curated problems and 64 test cases.

### Start External Services
```bash
docker start codeforge-redis
```

### Start Development Server
```bash
npm run dev
```

### Start Worker
```bash
npm run worker
```

---

## Deployment Readiness Checklist

### Static Quality Gates
```bash
npm run lint
npm run typecheck
npm run build
npm run check
```
Pass condition: Zero ESLint errors, zero TypeScript errors, successful production build.

### Runtime Validation
Verify:
- Login/register flow
- Run execution
- Submit execution
- Queue polling
- Worker heartbeat visibility
- Cleanup audit success

### Sandbox Validation
```bash
npm run ops:abuse-infinite-loop
npm run ops:abuse-stdout-spam
npm run ops:abuse-memory-pressure
```

### Recovery Validation
```bash
npm run ops:recovery-redis-restart
npm run ops:recovery-kill-worker
npm run ops:recovery-kill-worker-submission
```

### Cleanup Validation
```bash
npm run ops:audit-cleanup
```

---

## Development Philosophy & Current Scope

**Development Philosophy**
- Validation-driven implementation
- Operational correctness over feature breadth
- Deterministic execution behavior
- Infrastructure-first design
- Measurable recovery guarantees
- Explicit operational visibility

**Current Scope**
CodeForge intentionally focuses on async execution infrastructure, worker lifecycle management, sandbox execution, operational recovery, execution observability, and deterministic evaluation.

The project intentionally avoids contests, ratings, social systems, gamification, hyperscale orchestration, and Kubernetes complexity.

---

## Deployment & Operational Hardening

Current deployment readiness includes validated startup flow, migration reproducibility, worker heartbeat truthfulness, recovery validation, cleanup guarantees, operational metrics, and DLQ tooling.

Intentionally out of scope: Kubernetes orchestration, hyperscale multi-tenancy, cloud-grade hostile workload isolation, and advanced orchestration systems.

Recommended deployment model:
- Single VPS
- App + Worker + Redis + PostgreSQL
- Docker installed on host

---

## Summary

CodeForge demonstrates:
- Asynchronous backend architecture
- Queue-driven execution systems
- Docker-based sandbox execution
- Isolated execution of untrusted workloads
- Deterministic evaluation pipelines
- Operational recovery validation
- Cleanup guarantees
- Worker lifecycle management
- Request tracing and observability
- Full-stack system integration
```