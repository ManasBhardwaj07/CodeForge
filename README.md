# CodeForge

CodeForge is a queue-backed asynchronous multi-language code execution platform with Docker sandboxing, execution telemetry, retries/DLQ handling, operational visibility, and deterministic judge-style evaluation.

This repository is intentionally **infrastructure-first**: it prioritizes the execution pipeline, correctness, recovery behavior, and cleanup guarantees over feature breadth.

## Project Identity (Non-Marketing Definition)

- **Async execution platform**: API requests enqueue work; workers execute in Docker.
- **Two execution paths**:
   - **Ephemeral `run`**: immediate execution used for “Run code”.
   - **Persistent `submission`**: DB-backed lifecycle with deterministic verdict aggregation.
- **Operationally verifiable**: heartbeat truthfulness, abuse tests, recovery tests, cleanup audits.

Non-goals:
- no contests/ratings/gamification
- no microservices/Kubernetes architecture
- no exaggerated security or hyperscale claims

## Architecture Overview

```text
Client UI
   ↓
Next.js App Router (API routes + pages)
   ↓
PostgreSQL (Prisma)        Redis (BullMQ)
   ↓                          ↓
Submissions + results      Queue + retries + DLQ
   ↓                          ↓
Worker process  ── heartbeat + metrics ──┘
   ↓
Docker sandbox (multi-language)
   ↓
Execution outcomes → deterministic verdict → UI polling/status
```

### Core Technical Decisions

- **Async queue model**: execution is not tied to request lifecycle.
- **Ephemeral runs vs persistent submissions**: “run” is fast + non-durable; “submission” is durable + judge-like.
- **Request ID tracing**: `requestId` threads through API → queue → worker logs.
- **Heartbeat-based liveness**: worker publishes TTL-based presence in Redis.
- **DLQ semantics**: failed jobs are inspectable and can be replayed/deleted via ops endpoints.
- **Output limiting**: prevents stdout/stderr spam from destabilizing the worker.
- **Cleanup guarantees**: best-effort teardown of execution containers and temp workspaces.

## Sandbox Design (Accurate Claims Only)

CodeForge aims for **reasonable isolation for a portfolio-grade execution sandbox**, not cloud-provider-grade isolation.

What exists:
- Docker-based execution (no direct host execution)
- timeout enforcement (per-test/global)
- output truncation for stdout/stderr
- best-effort cleanup (containers + temp dirs)

### Workspace modes

- `CODEFORGE_SANDBOX_USE_HOST_MOUNT=0` (recommended): avoids host temp-dir leaks on hard kill.
- `CODEFORGE_SANDBOX_USE_HOST_MOUNT=1` (dev-only): uses a host temp dir and bind-mounts `/workspace`.

## Execution & Determinism

### Submission lifecycle

```text
QUEUED → RUNNING → COMPLETED | FAILED
```

### Deterministic verdict ordering

```text
COMPILATION_ERROR > TIMEOUT > RUNTIME_ERROR > WRONG_ANSWER > ACCEPTED
```

## Observability & Ops Endpoints

### Trace identifiers

- `requestId`: API → queue → worker correlation
- `jobId`: BullMQ lifecycle
- `submissionId`: persistent evaluation entity
- `runId`: ephemeral run entity

### Health

- `GET /api/health`
- `GET /api/queue/health` (includes worker heartbeat truthfulness)
- `GET /api/queue/metrics`

### DLQ operations

- `GET /api/queue/dlq`
- `POST /api/queue/dlq/[id]/requeue`
- `POST /api/queue/dlq/[id]/delete`

## Final Pre-Deployment Checklist (Deploy Only If Clean)

This is the practical “if this passes, deploy” checklist. It is ROI-focused and architecture-preserving.

### Phase 0 — Lock architecture (mandatory)

Allowed changes only:
- bug fixes, validation fixes, deployment fixes
- observability fixes, cleanup guarantees, operational hardening

Do not:
- redesign worker/queue/sandbox architecture
- rewrite core execution paths
- introduce new infra tiers (websockets, microservices, Kubernetes)

### Phase 1 — Static quality gates (all must pass)

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Convenience: `npm run check`

Pass condition: zero TS/ESLint errors + production build succeeds.

### Phase 2 — Execution validation

Automated:
- Smoke: `npm run ops:smoke-sandbox`
- Cleanup audit: `npm run ops:audit-cleanup`

Manual spot-check (recommended):
- `POST /api/run` for each language in `SUPPORTED_LANGUAGES` (`JAVASCRIPT`, `PYTHON`, `CPP`, `C`, `JAVA`)
- validate stdout/stderr capture, timeout enforcement, and compilation/runtime failure reporting

### Phase 3 — Sandbox validation

Automated abuse tests (currently cover JS/Python):
- `npm run ops:abuse-infinite-loop`
- `npm run ops:abuse-stdout-spam`
- `npm run ops:abuse-memory-pressure`

Pass condition:
- timeouts enforced
- truncation enforced
- worker survives
- no container leaks
- no temp-dir leaks

### Phase 4 — Recovery validation (critical)

- Kill worker mid job: `npm run ops:recovery-kill-worker`
- Kill worker mid *real submission* (DB-backed): `npm run ops:recovery-kill-worker-submission`
- Redis restart: `npm run ops:recovery-redis-restart`

Pass condition:
- retries recover correctly
- no zombie `RUNNING` submissions
- queue state remains truthful

### Phase 5 — DLQ + operations validation

Validate via endpoints:
- `GET /api/queue/dlq` (list)
- `POST /api/queue/dlq/[id]/requeue`
- `POST /api/queue/dlq/[id]/delete`

Pass condition:
- replay creates a new job safely
- delete is safe and does not corrupt queue

### Phase 6 — Cleanup guarantees

- `npm run ops:audit-cleanup` after:
   - timeout
   - crash (hard kill)
   - replay failure
   - graceful shutdown

Pass condition:
- no orphan execution containers
- no orphan temp dirs

### Phase 7 — Observability validation

Verify logs include (where applicable):
- `requestId`, `jobId`, `submissionId`/`runId`, language, duration, failure category

Verify metrics endpoints respond:
- `GET /api/queue/metrics`

### Phase 8 — Deployment readiness

This repo does not currently ship a production `docker-compose.yml`.

Deployment readiness here means:
- environment variables are validated at startup
- health endpoints are stable
- worker shutdown + heartbeat expiry are truthful

### Phase 9 — Final UX pass

No redesign; stabilization only:
- polling stable (no duplicate loops)
- submission history accurate
- status chips stable

### Phase 10 — Documentation

This README must describe CodeForge as an execution platform (not a LeetCode clone), only document what exists, and avoid exaggerated claims.

## Setup / Runbook

### Prerequisites

- Node.js
- Docker
- PostgreSQL
- Redis

### Environment

Copy `.env.example` to `.env` and fill:

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `JWT_SECRET`

Optional knobs (ops/testing/hardening):

- `CODEFORGE_WORKER_ID`
- `CODEFORGE_WORKER_HEARTBEAT_INTERVAL_MS`
- `CODEFORGE_WORKER_HEARTBEAT_TTL_MS`
- `CODEFORGE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`
- `CODEFORGE_SELF_SHUTDOWN_AFTER_MS`
- `CODEFORGE_STALE_RUNNING_TIMEOUT_MS`
- `CODEFORGE_STALE_RECOVERY_INTERVAL_MS`
- `CODEFORGE_SANDBOX_USE_HOST_MOUNT`
- `CODEFORGE_SANDBOX_WORKSPACE_TMPFS_MB`

### Database

- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`

### Start app + worker

- App (UI + API): `npm run dev`
- Worker: `npm run worker`

## Script Reference

### Core

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run check`

### QA phases

- `npm run qa:phase2`
- `npm run qa:phase3`
- `npm run qa:phase4`
- `npm run qa:phase5`
- `npm run qa:phase6`

### Ops validation

- `npm run ops:smoke-sandbox`
- `npm run ops:audit-cleanup`
- `npm run ops:check-heartbeats`
- `npm run ops:validate-heartbeat-expiry`
- `npm run ops:validate-worker-shutdown`
- `npm run ops:abuse-infinite-loop`
- `npm run ops:abuse-stdout-spam`
- `npm run ops:abuse-memory-pressure`
- `npm run ops:recovery-redis-restart`
- `npm run ops:recovery-kill-worker`
- `npm run ops:recovery-kill-worker-submission`

---

## Development Philosophy

- Strict phase-based implementation
- Measurable acceptance criteria
- QA-driven progression
- Clear separation of concerns
- Infrastructure-first system design

---

## Roadmap

### Phase 8 — Production Hardening
- Full Docker Compose setup
- Deployment pipeline
- Rate limiting
- Failure recovery improvements

### Future Improvements
- Observability & monitoring
- Execution optimization
- Scaling strategies
- Multi-language execution support

---

## Summary

CodeForge demonstrates:

- asynchronous backend architecture
- queue-driven execution systems
- safe execution of untrusted workloads
- Docker-based sandbox isolation
- deterministic evaluation pipelines
- relational data modeling
- full-stack system integration
