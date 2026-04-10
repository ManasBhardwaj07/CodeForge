# CodeForge

CodeForge is an asynchronous code execution platform built to demonstrate real backend systems thinking, relational data modeling, and safe workload execution architecture.

This repository is developed phase by phase. The current implementation includes:

- Phase 1: Project foundation
- Phase 2: Core relational data model with migrations, seed data, and QA checks
- Phase 3: JWT authentication, protected routes, and submission entry API
- Phase 4: BullMQ queue pipeline with independent worker, lifecycle transitions, and QA

## Core Goal

Build a defendable end-to-end system with this mandatory flow:

1. User submits code
2. API validates request
3. Submission enters queue
4. Worker executes code in isolated runtime
5. Results persist to PostgreSQL
6. Frontend displays submission status and result

## Tech Stack

- Next.js (App Router)
- TypeScript (strict mode)
- PostgreSQL
- Prisma ORM
- Redis + BullMQ (async submission queue)
- Dedicated Node worker process for queue execution
- Docker (execution isolation planned for Phase 5)

## Project Structure

```text
src/
	app/           # App Router pages and API routes
	lib/           # Infrastructure clients (env, prisma, redis)
	services/      # Business/domain logic
	worker/        # Queue worker process (BullMQ consumer)
	types/         # Shared TypeScript types

prisma/
	schema.prisma
	migrations/
	seed.ts
	phase2-qa.ts
	phase3-qa.ts
	phase4-qa.ts
```

## Current Data Model (Phase 2)

Entities implemented:

- User
- Problem
- TestCase
- Submission
- ExecutionResult

Key modeling decisions:

- Strong foreign keys for relational integrity
- Submission lifecycle status enum (`QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`)
- Programming language enum for controlled execution types
- ExecutionResult snapshots (`inputSnapshot`, `expectedOutputSnapshot`, `actualOutput`) for reproducibility
- Data-preserving migration from `sourceCode` to `code`

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and set values.

Required keys:

- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `JWT_SECRET`

### 3. Run migrations and generate client

```bash
npm run db:migrate
npm run db:generate
```

### 4. Seed sample data

```bash
npm run db:seed
```

### 5. Run QA checks

```bash
npm run qa:phase2
npm run qa:phase3
npm run qa:phase4
```

### 6. Start app

```bash
npm run dev
```

Health endpoint:

- `GET /api/health`

## Scripts

- `npm run dev` - start development server
- `npm run build` - production build
- `npm run lint` - lint checks
- `npm run typecheck` - strict TypeScript check
- `npm run check` - lint + typecheck + build
- `npm run db:migrate` - apply dev migration
- `npm run db:generate` - generate Prisma client
- `npm run db:seed` - seed core data
- `npm run qa:phase2` - phase 2 acceptance QA checks
- `npm run qa:phase3` - phase 3 acceptance QA checks
- `npm run qa:phase4` - phase 4 queue + worker acceptance QA checks
- `npm run worker` - start queue worker as separate process

## QA Coverage

### Phase 2 QA validates:

- Seed data availability (2+ problems, 5+ test cases)
- User -> Submissions relation
- Problem -> TestCases relation
- Submission -> ExecutionResults relation
- Foreign key enforcement (invalid insert rejected)

### Phase 3 QA validates:

- Register returns token and public user payload
- Login returns JWT and rejects invalid credentials
- Passwords are hashed in DB and not returned in API
- Protected route behavior (`401` without token, `200` with valid token)
- Public problems API availability
- Submit API auth enforcement and validation errors
- Submission persistence with status `QUEUED`
- Standardized API error response format: `{ error, code }`

### Phase 4 QA validates:

- Worker starts in a separate process
- Submit API remains non-blocking while work executes asynchronously
- Queue job is created and visible by submission id
- Submission lifecycle transitions: `QUEUED -> RUNNING -> COMPLETED`
- Worker processing evidence (logs or transition fallback proof)
- Queue retry policy and backoff behavior through configured BullMQ defaults

## Security and Repository Hygiene

- `.env` is ignored by git
- `.env.example` is committed for safe onboarding
- Generated Prisma output is ignored and recreated via scripts

## Roadmap

Planned upcoming phases:

- Phase 5: Docker-based code execution engine
- Phase 6+: Evaluation, lifecycle tracking, realtime updates, hardening, deployment

## Phase 3 API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/protected`
- `GET /api/problems`
- `POST /api/submit`

Submission behavior in Phase 3:

- Auth required
- Stores submission with status `QUEUED`
- In current system (Phase 4), submissions are queued and consumed asynchronously by the worker

## Phase 4 Runtime Flow

1. `POST /api/submit` authenticates and validates payload
2. Service creates a `Submission` row with status `QUEUED`
3. Service enqueues BullMQ job with deterministic job id
4. Worker picks job and atomically flips `QUEUED -> RUNNING`
5. Worker completes and atomically sets `RUNNING -> COMPLETED`
6. Failure paths set `FAILED` with `failedAt`; stale `RUNNING` records are recovered by timeout policy

## Development Policy

This project follows strict phase gates:

- Each phase requires measurable acceptance criteria
- No phase is marked complete without validation evidence
- README is updated phase by phase as implementation evolves
