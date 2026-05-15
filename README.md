# CodeForge

CodeForge is a full-stack asynchronous code execution platform built to simulate production-grade online judge infrastructure using Docker sandboxing, Redis/BullMQ workers, deterministic verdict aggregation, and PostgreSQL-backed execution lifecycle tracking.

The system focuses on safe execution of untrusted workloads, asynchronous processing, execution isolation, and end-to-end backend architecture.

The project is developed phase-by-phase with strict validation gates, ensuring each layer (data, auth, async processing, execution, evaluation, frontend) is independently correct, testable, and defensible.

---

## Why CodeForge?

Most coding platform clones focus primarily on UI and problem rendering.

CodeForge focuses on the backend infrastructure and execution pipeline required to safely execute untrusted workloads using asynchronous processing, isolated execution environments, deterministic evaluation, and queue-driven system design.

---

## Core Objective

Build a production-style execution system with the following flow:

1. User submits code
2. API validates and persists submission
3. Submission is enqueued (Redis + BullMQ)
4. Worker executes code inside an isolated Docker sandbox
5. Results are stored in PostgreSQL
6. Verdict is computed deterministically
7. Frontend displays execution status and results

---

## System Flow

```text
Client
   ↓
Next.js API Layer
   ↓
PostgreSQL (Persistence)
   ↓
Redis Queue (BullMQ)
   ↓
Worker Process
   ↓
Docker Sandbox Execution
   ↓
Verdict Aggregation
   ↓
Frontend Status & Results
```

---

## Tech Stack

### Frontend
- Next.js (App Router)
- TypeScript
- Tailwind CSS

### Backend
- Node.js
- Next.js API Routes

### Infrastructure & Processing
- Redis
- BullMQ
- Docker

### Database
- PostgreSQL
- Prisma ORM

### Authentication
- JWT (stateless authentication)

---

## Implemented Phases

### Phase 1 — Foundation
- Strict TypeScript setup
- Project structure
- Infrastructure configuration

### Phase 2 — Relational Data Modeling
- PostgreSQL schema design
- Prisma migrations
- Foreign key constraints
- QA validation

### Phase 3 — Authentication & Submission APIs
- JWT authentication
- Protected routes
- Submission validation pipeline

### Phase 4 — Queue-Driven Execution System
- BullMQ integration
- Redis-backed queue lifecycle
- Worker architecture

### Phase 5 — Docker Sandbox Execution
- Isolated container execution
- JavaScript runtime support
- C++ compile + execution pipeline
- Timeout enforcement
- Resource isolation & cleanup

### Phase 6 — Deterministic Verdict Aggregation
- Verdict priority system
- Execution result aggregation
- Submission statistics tracking

### Phase 7 — Frontend Integration
- Problem browsing
- Code submission interface
- Real-time polling
- Submission history
- Per-test execution visualization

---

## Project Structure

```text
src/
  app/           # Next.js pages and API routes
  components/    # UI components
  lib/           # Infrastructure (env, prisma, redis, auth)
  services/      # Business logic
  worker/        # BullMQ worker process
  types/         # Shared TypeScript types

prisma/
  schema.prisma
  migrations/
  seed.ts
```

---

## Core Data Model

### Entities
- User
- Problem
- TestCase
- Submission
- ExecutionResult

### Key Design Decisions
- Strong foreign key enforcement
- Deterministic submission lifecycle
- Per-test execution tracking
- Snapshot-based storage (`input`, `expected`, `actual`)
- Strict verdict aggregation logic

### Submission Lifecycle

```text
QUEUED → RUNNING → COMPLETED → FAILED
```

---

## Execution System

Code execution never runs directly on the host machine.

Each submission is executed inside an isolated Docker container with strict resource controls.

### Isolation Features
- No network access
- Memory & CPU limits
- Read-only filesystem
- Non-root execution user

### Supported Languages
- JavaScript (Node.js)
- C++ (compile + run separation)

### Safety Guarantees
- Per-test timeout enforcement
- Global execution safety
- Temporary file cleanup
- Container cleanup after execution

---

## Queue Observability

CodeForge exposes lightweight, operational metrics for queue health and tracing.

### Tracing Identifiers
- `requestId` traces an API request across services
- `jobId` traces the BullMQ lifecycle
- `submissionId` is the persisted evaluation entity
- `runId` is the ephemeral execution entity

### Metrics Highlights
- Average runtime and queue wait time (by language, status, queue state)
- Retry frequency (by language)
- Failure distribution (by language and reason)

### DLQ Tooling
- List/requeue/delete failed jobs
- Failure categories: `INFRA_FAILURE`, `EXECUTION_TIMEOUT`, `SANDBOX_ERROR`, `REDIS_ERROR`, `COMPILATION_ERROR`

---

## Verdict System

Final submission verdicts are derived using strict deterministic priority ordering:

```text
COMPILE_ERROR > TIMEOUT > RUNTIME_ERROR > WRONG_ANSWER > ACCEPTED
```

Each submission stores:
- final verdict
- total tests
- passed tests
- failed tests

---

## Frontend Features

Minimal, functional, and system-focused UI.

### Features
- Problem browsing
- Code editor & submission flow
- Real-time execution polling
- Per-test result visualization
- Submission history
- JWT-based authentication

### UX Considerations
- Polling cleanup & resume support
- localStorage state persistence
- Output truncation for large responses
- Clear loading/error/empty states

---

## Setup

### 1. Clone Repository

```bash
git clone https://github.com/ManasBhardwaj07/CodeForge.git
cd CodeForge
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create `.env` using `.env.example`

---

## Database Setup

```bash
npm run db:migrate
npm run db:generate
npm run db:seed
```

---

## Start Services

### Development Server

```bash
npm run dev
```

### Worker Process

```bash
npm run worker
```

---

## QA Validation

```bash
npm run qa:phase2
npm run qa:phase3
npm run qa:phase4
npm run qa:phase5
npm run qa:phase6
```

---

## Available Scripts

### Core

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run check
```

### Database

```bash
npm run db:migrate
npm run db:generate
npm run db:seed
```

### Worker

```bash
npm run worker
```

---

## QA Coverage

Each phase includes dedicated validation checks.

### Phase 2
- Relational integrity
- Foreign key enforcement

### Phase 3
- Authentication flows
- Route protection
- Validation checks

### Phase 4
- Queue lifecycle validation
- Async processing behavior

### Phase 5
- Docker sandbox execution
- Timeout handling
- Cleanup guarantees

### Phase 6
- Verdict correctness
- Aggregation logic validation

---

## Security Practices

- `.env` ignored from version control
- `.env.example` included
- No hardcoded secrets
- Containerized execution for untrusted code
- Resource limits enforced during execution

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
