# CodeForge

CodeForge is a production-grade, asynchronous multi-language code execution platform. It is built to demonstrate robust backend infrastructure behavior, distributed worker orchestration, execution reliability, and operational correctness under real-world conditions. 

Unlike typical synchronous code evaluators, CodeForge uses a queue-backed architecture designed for scale, resilience, and operational visibility.

---

## Live Demo

**[CodeForge Live](https://codeforgeapp.duckdns.org)**

---

## Screenshots

![Dashboard Overview](docs/screenshots/dashboard.png)

![Code Editor](docs/screenshots/editor.png)

---

## Features

- **Multi-language execution:** Safely evaluate JavaScript, Python, C, C++, and Java.
- **Docker-isolated sandboxing:** Untrusted code runs in ephemeral, resource-constrained Docker containers.
- **Queue-backed asynchronous execution:** Non-blocking API layer with distributed BullMQ workers.
- **Deterministic Evaluation:** Strict aggregation of Compilation Errors, Timeouts, Runtime Errors, and Accepted verdicts.
- **Dead-letter queue (DLQ) recovery:** Failed jobs are safely stored for inspection and replay.
- **Operational metrics & heartbeats:** Real-time visibility into worker health and queue latency.
- **Seamless UI/UX:** Continuous post-submission navigation and persistent submission history tracking.
- **Production-ready deployment:** Configured for zero-downtime orchestration on Azure.

---

## Tech Stack

- **Frontend:** Next.js 16, React, TypeScript, Tailwind CSS
- **Backend:** Next.js App Router API routes, Node.js (Worker Process)
- **Queue & Persistence:** BullMQ, Redis, Prisma ORM (v7+), PostgreSQL (Neon Serverless)
- **Infrastructure:** Docker, Docker Compose
- **Deployment:** Azure VM (B2ats v2), Caddy Reverse Proxy, DuckDNS

---

## Production Deployment (Azure)

CodeForge is currently deployed in a production-ready configuration on an **Azure Linux VM (Ubuntu 24.04)**. 

The deployment relies on Docker Compose orchestration to run:
1. **Next.js Application Container** (Frontend & API)
2. **Node.js Worker Container** (Job processing & Sandboxing)
3. **Redis Container** (BullMQ job state and worker heartbeats)
4. **Caddy Reverse Proxy** (Automatic HTTPS/TLS via DuckDNS)

**Database:** The application connects to a serverless **Neon PostgreSQL** database. The architecture has been rigorously audited to ensure the worker's DB connection pooling respects Neon's scale-to-zero autosuspend constraints (sleeping after 15 minutes of inactivity).

Frontend traffic communicates exclusively through the Caddy reverse proxy layer (`/api`), ensuring backend services (like Redis or Docker sockets) are never exposed publicly.

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
│ Neon Serverless│  │ Redis/BullMQ │
│ PostgreSQL   │  │ Queue Engine │
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
Execution workloads are intentionally separated from the HTTP request lifecycle. API requests simply enqueue jobs in Redis. Dedicated Node.js workers process these jobs asynchronously, while the Next.js frontend independently polls for execution status. This prevents blocking API threads and handles long-running compilations (like C++) safely.

### Run vs Submit Model
- **Run Code:** Ephemeral execution with custom input. Fast iteration workflow with no persistent submission record.
- **Submit:** Persistent, DB-backed evaluation against hidden test cases. Deterministic verdict aggregation (e.g., `TIMEOUT` takes precedence over `WRONG_ANSWER`).

### Sandbox Design
CodeForge utilizes Docker-based isolation. Features include:
- Hard timeout enforcement
- Stdout/stderr truncation (prevents memory exhaustion)
- Read-only root filesystem for executed code
- Non-root execution users

---

## Operational Visibility & Recovery

### Worker Heartbeats
Workers publish TTL-based heartbeat keys into Redis. The Next.js API exposes queue health endpoints detailing online workers, active jobs, and worker status, allowing operational liveness verification instead of blindly assuming workers are healthy.

### Dead Letter Queue (DLQ)
Failed jobs (due to infrastructure or timeout errors) move into a DLQ. Operational endpoints support inspection, replay/requeue, and deletion of failed jobs.

---

## Local Setup

### Prerequisites
- Node.js (v20+)
- Docker (for sandbox containers)
- PostgreSQL (Local or Neon)
- Redis (Local or via Docker)

### Environment Setup
Create a `.env` file:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/codeforge"
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"
JWT_SECRET="replace_with_a_strong_secret"
```

### Install & Initialize
```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```
*(The seed script populates 20 curated problems and 64 test cases).*

### Start Development Server & Worker
Start your Redis instance, then run:
```bash
npm run dev
npm run worker
```

---

## Operational Testing

The project includes dedicated validation scripts to verify operational behavior under stress:

- **Abuse Validation:** Tests infinite loop timeout handling, stdout spam truncation, and memory pressure.
  `npm run ops:abuse-infinite-loop`
- **Cleanup Validation:** Ensures no orphan execution containers or temp directories leak onto the host.
  `npm run ops:audit-cleanup`
- **Recovery Validation:** Tests worker hard-kill recovery and DB-backed submission recovery.
  `npm run ops:recovery-kill-worker`

---

## Summary

CodeForge is built to demonstrate engineering maturity. It intentionally avoids gamification features (like leaderboards or ratings) to focus entirely on the hard infrastructure problems of running untrusted code safely, asynchronously, and reliably at scale.