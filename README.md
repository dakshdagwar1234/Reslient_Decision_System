# Resilient Decision System

An enterprise-grade, deterministic, and fault-tolerant business decision system powered by a **generic configurable workflow engine** and demonstrated through a **loan application underwriting** domain.

---

## 1. Core Architecture & Highlights

- **Generic Workflow Engine**: Workflows, steps, condition predicates (`eq`, `gt`, `gte`, `lt`, `lte`, `in`, `AND`/`OR` groups), and actions are fully declarative JSON configurations stored in MongoDB.
- **Explicit Safe Fallback (No Silent Approvals)**: Applications only receive `APPROVED` status if they satisfy explicit positive qualification rules. If neither rejection nor explicit approval rules trigger, the engine safely routes to `MANUAL_REVIEW` (`NO_EXPLICIT_APPROVAL_MATCH`).
- **Execution State vs. Decision Outcome Separation**:
  - **Execution State**: Technical lifecycle (`PENDING` $\rightarrow$ `RUNNING` $\rightarrow$ `COMPLETED`, `AWAITING_RETRY`, `FAILED`).
  - **Decision Outcome**: Business verdict (`APPROVED`, `REJECTED`, `MANUAL_REVIEW`, `RETRY`).
- **Robust Idempotency**:
  - **Atomic Unique-Key Insertion**: Prevents duplicate concurrent execution via a unique index on `IdempotencyRecord.key`.
  - **Canonical Request Hashing**: Deterministic SHA-256 fingerprinting of payloads.
  - **Payload Conflict Detection**: Re-submitting the same idempotency key with differing payload yields `422 Unprocessable Entity` (`IDEMPOTENCY_PAYLOAD_MISMATCH`).
  - **Zero Duplicate Execution**: Identical submissions return cached responses with header `X-Cache-Lookup: HIT`.
  - **Stale/Interrupted Recovery**: Recovers in-flight locks if a worker process crashes (`heartbeatAt` tracking).
- **Persistent Retry Recovery Across Server Restarts**:
  - Retries are scheduled with exponential backoff (`nextRetryAt`) in MongoDB.
  - A persistent background worker uses atomic `findOneAndUpdate` to claim and execute due retries even after server restarts.
- **Configuration Versioning & Immutability**:
  - Workflow configurations are versioned (`v1`, `v2`, ...).
  - Active configurations are **strictly immutable**; modifications must be published as a new incremental version.
- **Comprehensive Audit Trail**:
  - Monotonic chronological sequence of every state change, external call (latency, success/failure), rule evaluated, retry attempt, and underwriter manual override.
- **Simulated External Dependency**:
  - Credit Bureau client with configurable latency, timeout simulation (`ETIMEDOUT`), and 503 Service Unavailable chaos injection.

---

## 2. Tech Stack

- **Backend**: Node.js, Express, MongoDB Atlas, Mongoose
- **Frontend**: React.js, Vite, Tailwind CSS, Lucide Icons (JavaScript only, no TypeScript)
- **Testing**: Jest, Supertest, MongoMemoryServer, Puppeteer-Core (53 automated tests across 9 test suites + Real Browser E2E suite)

---

## 3. Directory Layout

```
resilient-decision-system/
├── .env.example                      # Sanitized environment template
├── .gitignore                         # Strict exclusion of .env and build files
├── README.md                          # Comprehensive documentation
├── package.json                       # Monorepo development scripts
├── server/
│   ├── src/
│   │   ├── app.js                    # Express app & static hosting
│   │   ├── index.js                  # Server bootstrap & graceful shutdown
│   │   ├── config/
│   │   │   ├── database.js           # Mongoose connection manager
│   │   │   └── env.js                # Environment config loader
│   │   ├── engine/                   # GENERIC WORKFLOW CORE
│   │   │   ├── RuleEvaluator.js      # Declarative condition parser
│   │   │   ├── StateMachine.js       # Lifecycle transitions & guards
│   │   │   ├── WorkflowRunner.js     # Step orchestrator & context accumulator
│   │   │   └── RetryWorker.js        # Persistent DB-backed retry poller
│   │   ├── external/
│   │   │   └── CreditBureauClient.js # Flaky mock client with chaos simulation
│   │   ├── middleware/
│   │   │   ├── idempotency.js        # Atomic deduplication, conflict detection
│   │   │   ├── validator.js          # Strict input schema validator
│   │   │   └── errorHandler.js       # Centralized error handler
│   │   ├── models/
│   │   │   ├── WorkflowConfig.js     # Versioned, immutable-when-active configs
│   │   │   ├── Execution.js          # Execution lifecycle & decision outcome
│   │   │   ├── AuditLog.js           # Immutable chronological audit logs
│   │   │   └── IdempotencyRecord.js  # Atomic key, request hash, response cache
│   │   ├── controllers/
│   │   │   ├── decisionController.js # Evaluate, fetch, and retry executions
│   │   │   ├── reviewController.js   # Underwriter manual overrides
│   │   │   ├── workflowController.js # Workflow versioning & activation
│   │   │   └── auditController.js    # Audit traces & aggregated metrics
│   │   ├── routes/
│   │   │   ├── api.js                # Consolidated v1 API routes
│   │   │   └── health.js             # Liveness probe
│   │   └── scripts/
│   │       └── seed.js               # Auto-seeds default LOAN_APPROVAL v1 config
│   └── tests/
│       ├── unit/                     # 7 unit test suites
│       └── integration/              # 2 integration test suites
└── client/
    ├── vite.config.js                # Vite config with API proxy
    ├── tailwind.config.js            # Tailwind styling config
    └── src/
        ├── App.jsx                   # Main dashboard application
        ├── api/                      # Backend API client
        └── components/
            ├── Header.jsx            # Top navigation & DB health indicator
            ├── MetricsBar.jsx        # Aggregated KPI statistics
            ├── ApplicationSimulator.jsx # Loan form with demo presets & chaos injection
            ├── ExecutionsTable.jsx   # Live executions feed with search & filters
            ├── ExecutionModal.jsx    # Diagnosis modal with audit trail & rule traces
            ├── ManualReviewModal.jsx # Underwriter manual override interface
            └── ConfigManager.jsx     # Rule matrix viewer & version switcher
```

---

## 4. Reference Loan Underwriting Rule Matrix (v1)

| Priority | Rule ID | Condition | Action Outcome | Reason Code |
| :---: | :--- | :--- | :---: | :--- |
| **1** | `R_UNEMPLOYED` | `input.employmentStatus == 'UNEMPLOYED'` | `REJECTED` | `UNEMPLOYED_INELIGIBLE` |
| **2** | `R_HIGH_DTI` | `context.debtToIncomeRatio > 0.50` | `REJECTED` | `DTI_TOO_HIGH` |
| **3** | `R_SUBPRIME_CREDIT` | `context.creditScore < 580` | `REJECTED` | `SUBPRIME_CREDIT_SCORE` |
| **4** | `R_LARGE_LOAN` | `input.requestedAmount > 50000` | `MANUAL_REVIEW` | `LARGE_LOAN_SUPERVISORY_REVIEW` |
| **5** | `R_BORDERLINE_RISK` | `context.creditScore < 650 AND context.debtToIncomeRatio > 0.35` | `MANUAL_REVIEW` | `BORDERLINE_CREDIT_RISK` |
| **6** | `R_PRIME_AUTO_APPROVAL` | `context.creditScore >= 720 AND context.debtToIncomeRatio <= 0.35 AND input.annualIncome >= 60000` | `APPROVED` | `PRIME_AUTO_APPROVAL` |
| **7** | `R_STANDARD_AUTO_APPROVAL` | `context.creditScore >= 650 AND context.debtToIncomeRatio <= 0.30` | `APPROVED` | `STANDARD_QUALIFIED` |
| **Fallback** | *Safe Default* | *No explicit approval rule matched* | `MANUAL_REVIEW` | `NO_EXPLICIT_APPROVAL_MATCH` |

---

## 5. REST API Reference

### Health Probes
- `GET /health` / `GET /api/health`
  - Returns server uptime, database connectivity state (`connected`, `connecting`, `disconnected`), and environment info.

### Decision Evaluation
- `POST /api/v1/decisions/evaluate`
  - **Header**: `Idempotency-Key: <unique-uuid>`
  - **Body**:
    ```json
    {
      "applicantName": "Sarah Prime",
      "annualIncome": 110000,
      "monthlyDebt": 1200,
      "requestedAmount": 25000,
      "loanTermMonths": 36,
      "employmentStatus": "EMPLOYED",
      "chaosOverrides": {
        "forceTimeout": false,
        "force503": false
      }
    }
    ```
  - **Success Response (200 OK / 202 Accepted)**:
    ```json
    {
      "executionId": "6af6...",
      "workflowVersion": 1,
      "executionState": "COMPLETED",
      "decisionOutcome": "APPROVED",
      "decisionDetails": {
        "reasonCode": "PRIME_AUTO_APPROVAL",
        "message": "Fast-track auto-approval granted: Prime tier credit profile and strong income stability.",
        "triggeredRuleId": "R_PRIME_AUTO_APPROVAL"
      },
      "context": {
        "debtToIncomeRatio": 0.1309,
        "creditScore": 780,
        "bureauReferenceId": "CRB-9A4B"
      }
    }
    ```

- `GET /api/v1/decisions`
  - Query params: `page`, `limit`, `outcome`, `search`.
- `GET /api/v1/decisions/:id`
  - Fetches complete execution record.
- `POST /api/v1/decisions/:id/retry`
  - Manually re-triggers execution in `AWAITING_RETRY` or `FAILED` state.

### Manual Review Overrides
- `POST /api/v1/decisions/:id/review`
  - **Body**:
    ```json
    {
      "reviewDecision": "APPROVED",
      "reviewedBy": "Senior Underwriter John",
      "notes": "Verified secondary collateral assets."
    }
    ```

### Audit Trail & Metrics
- `GET /api/v1/decisions/:id/audit-trail`
  - Returns chronological sequence of transitions, rule evaluations, and external calls.
- `GET /api/v1/metrics`
  - Returns aggregate counts (total applications, approved, rejected, manual reviews, approval rate).

### Workflow Configuration Management
- `GET /api/v1/configs` - List all workflow versions.
- `GET /api/v1/configs/:id` - Fetch configuration tree.
- `POST /api/v1/configs` - Create a new version in `DRAFT` state.
- `PATCH /api/v1/configs/:id/activate` - Activate version (locks version as immutable and archives previous version).

---

## 6. How to Run

### Setup Environment
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure your MongoDB Atlas URI in `.env` (or run locally):
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/resilient_decision_system?retryWrites=true&w=majority
   ```

### Run Automated Tests
```bash
cd server
npm test
```
*Executes all 53 unit and integration tests across 9 test suites.*

### Run MongoDB Atlas Live Persistence Verification
```bash
cd server
node scripts/verify-atlas-persistence.js
```
*Executes all 9 live persistence and lifecycle scenarios directly on MongoDB Atlas.*

### Run Real Browser (Chrome) E2E Verification
```bash
cd client
node test-e2e-browser.cjs
```
*Drives Chrome through all 12 frontend UI workflows, demo presets, manual review overrides, and audit modals.*

### Run Backend Server
```bash
cd server
npm start
```
*Server runs on `http://localhost:5001` (seeds default workflow and starts persistent retry worker).*

### Run Frontend Dashboard
```bash
cd client
npm run dev
```
*Vite client runs on `http://localhost:5173` with automatic API proxying.*

### Full Production Build
```bash
cd client
npm run build
cd ../server
npm start
```
*Express automatically serves the compiled React dashboard at `http://localhost:5001`.*

