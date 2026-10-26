# QAAGA AGENT — Production Multi-User AI SaaS Platform

**QAAGA AGENT** is a full-stack AI SaaS platform featuring multi-user authentication, mandatory administrator account approval, an append-only ACID prepaid credit ledger with 30-day carry-forward subscriptions, manual Bangladesh MFS (`bKash`, `Nagad`, `Rocket`) payment verification with private screenshot review, server-side OpenAI integration, and a comprehensive Administrator Control & Financial Reconciliation Console.

---

## 1. Environment Variables Setup

Copy `.env.example` to `.env` (or configure secrets in your Cloud Run / hosting environment):

| Variable | Purpose |
| :--- | :--- |
| `OPENAI_API_KEY` | Server-side OpenAI API key (never exposed to browser). Powers live `gpt-4o`, `gpt-4o-mini`, `o3-mini`, `dall-e-3`, `whisper-1`, and `tts-1`. |
| `GEMINI_API_KEY` | Optional server-side multimodal bridge when `OPENAI_API_KEY` is not yet configured. |
| `SQL_HOST` | PostgreSQL / Cloud SQL Auth Proxy socket or host (Object Method). |
| `SQL_DB_NAME` | PostgreSQL database name. |
| `SQL_USER` / `SQL_PASSWORD` | Application runtime database credentials (read/write). |
| `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` | Admin credentials used exclusively by Drizzle Kit migrations (`src/db/drizzle.config.ts`). |
| `AUTH_JWT_SECRET` | 64-byte cryptographic secret for signing Email/Password session tokens. |
| `ADMIN_BOOTSTRAP_EMAIL` | Email address automatically granted `admin` + `ACTIVE` status upon registration or Google Sign-In. |

---

## 2. Local Setup & Database Migrations

1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Push / Migrate PostgreSQL Schema (Drizzle Kit)**:
   ```bash
   npx drizzle-kit push --config=src/db/drizzle.config.ts
   ```
3. **Run Development Server (Port 3000)**:
   ```bash
   npm run dev
   ```
4. **Build & Run Production**:
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```

---

## 3. Pre-Seeded Reference Accounts (For Immediate Verification)

On first launch, QAAGA AGENT idempotently seeds reference accounts so you can test the Guest Front Page, Admin Panel, Unpaid User Recharge Gate, and Active Subscriber workflows immediately:

- **Quick Admin Panel (`ACTIVE`)**: `admin` / `admin` (also `admin@qaaga.ai` / `Admin@12345`) — opens the dedicated **QAAGA AGENT Admin Console** directly.
- **Unpaid / New User (`PENDING` · 0 Credits)**: `user` / `user` — enters the workspace and prompts **Recharge Required** (`20 / 50 / 100 / 200 BDT`) when running commands.
- **Active Subscriber (`ACTIVE` · 30-Day Plan · 80 Credits)**: `tanvir@qaaga.ai` / `User@12345` — full access to Chat, Image Studio, PDF Analysis, Web Search, and Voice Studio.
- **Additional Test States**: `rafiq@qaaga.ai` / `Pending@12345` (`PENDING`) and `arif.hossain@example.com` / `Expired@12345` (`EXPIRED` carry-forward balance).

---

## 4. Progressive Access & Feature Readiness Checklist

| Capability | Status | Details |
| :--- | :--- | :--- |
| **Public Front Page & Guest Chat** | **Fully Functional** | `/` opens the **QAAGA AGENT** Front Page immediately with free streaming text chat (`POST /api/public/chat/stream`). |
| **Progressive Login & Recharge Gates** | **Fully Functional** | Non-chat commands (`Image`, `PDF`, `Web Search`, `Voice`, `Upload`) prompt **Sign In / Register** for guests, and **Recharge Required** (`402`) after login when credits or 30-day plan are inactive. |
| **PostgreSQL Schema & Drizzle ORM** | **Fully Functional** | 10 relational tables (`users`, `credit_ledger`, `provider_usage_logs`, `recharge_packages`, `payment_requests`, `chat_sessions`, `chat_messages`, `notifications`, `platform_settings`, `audit_logs`). |
| **Email/Password + Google Auth** | **Fully Functional** | Salted `scrypt` password hashing + HMAC-SHA256 JWTs + Firebase Google Sign-In popup. In-memory token storage. |
| **Append-Only Credit Ledger** | **Fully Functional** | ACID transactions (`RESERVE` → `SETTLE` / `REFUND`) prevent overspending and automatically refund failed/503 API calls. |
| **30-Day Carry-Forward Recharge** | **Fully Functional** | Manual `bKash`, `Nagad`, and `Rocket` submission (`20 / 50 / 100 / 200 BDT`) with TrxID uniqueness check, private screenshot upload, admin approval/rejection, credit carry-forward, and 30-day validity reset. |
| **Admin Financial & Usage Console** | **Fully Functional** | BDT revenue, separate USD provider cost tracking, admin-reconciled wallet estimate, Recharts daily/feature analytics, CSV exports, model/tool switches, announcements, and audit logs. |
| **HTTP 503 Overload Resilience** | **Fully Functional** | Automatic exponential backoff retry and secondary model failover protect chat, image, STT, and TTS calls during transient provider overload. |
| **Direct OpenAI API Billing** | **Ready for `OPENAI_API_KEY`** | Uses official `openai` SDK on the server when `OPENAI_API_KEY` is set; transparently uses labeled Sandbox Bridge / Demo Mode when `OPENAI_API_KEY` is unconfigured. |

