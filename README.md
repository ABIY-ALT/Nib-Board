# BOD Directives, Decisions & Resolutions Tracking System
### NIB International Bank

Registers, routes, monitors and audits every official direction issued by the Board of
Directors — until the responsible Director reports what was actually done and the matter
is formally closed.

Built on Next.js 16 (App Router) with PostgreSQL, accessed through Prisma ORM 7.

---

## Running

```bash
npm install               # also runs `prisma generate`
cp .env.example .env      # then set DATABASE_URL
npm run db:migrate        # apply the migrations
npm run db:seed           # load the demonstration data
npm run dev               # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | TypeScript check (strict) |
| `npm run db:migrate` | `prisma migrate deploy` — apply pending migrations |
| `npm run db:seed` | Load the demonstration dataset |
| `npm run db:reset` | `prisma migrate reset` — **drops the database**, re-migrates, re-seeds |
| `npm run db:studio` | Prisma Studio, for inspecting the data |

`db:reset` is destructive. Never run it against a database holding real Board records;
`db:migrate` is the forward-only one that is safe there.

### Schema changes

`prisma/schema.prisma` is the source of truth. Edit it, then
`npx prisma migrate dev --name <what-changed>` to generate and apply a migration.

Two things live in migration SQL rather than in the schema, because Prisma cannot express
them: the CHECK constraints on the fixed vocabularies (role, status, priority, …) and the
triggers that make `audit_logs` and `auth_events` append-only. See
`prisma/migrations/1_integrity_rules`. If you add a value to one of those vocabularies,
add it to the TypeScript union in `lib/types.ts` **and** to the constraint.

---

## Design system

NIB institutional identity: brown navigation, gold as the single accent, warm-white working
surface. Tokens live in `app/globals.css` — brand scale first, then semantic roles
(`surface`, `ink`, `line`, `sidebar`, status hues). Components reference the semantic roles
only, so light and dark stay in step and no page invents its own values.

| Token | Light | Role |
| --- | --- | --- |
| `app` | `#FCF8EF` | Application background |
| `surface` | `#FFFFFF` | Cards, tables, forms, modals |
| `sidebar` | `#4B2507` | Navigation rail |
| `nib-gold-600` | `#B89334` | Primary actions, active navigation |
| `nib-gold-100` | `#F8E9C5` | Selected and informational backgrounds |

Status colour is resolved in one map (`StatusBadge`), so a status can never render one
colour on the dashboard and another in a table. Every badge carries a dot as well as a hue,
so state is never communicated by colour alone.

Dark mode is a deep warm charcoal rather than an inversion; gold stays an accent. Theme is
Light / Dark / System, applied before first paint to avoid a flash.

Shared components live in `components/ui`: `Button`, `Card`, `StatusBadge`, `PriorityBadge`,
`SlaPill`, `DataTable`, `FilterBar`, `Pagination`, `Tabs`, `EmptyState`, `ErrorState`,
skeleton loaders and form primitives.

### Navigation and data backing

Every sidebar item is a projection of the scoped matter set, with two honest exceptions:

| Item | Backing |
| --- | --- |
| Board Decisions / Directives / Resolutions | Matters filtered by type |
| Incoming, My Tasks, Pending Actions, Overdue | Derived from owner, status and deadline |
| Implementation Tracking, Decision Overview, SLA & Aging | Derived from progress, status and deadline |
| Audit Trail, Reports | `/api/matters/:id/audit-trail`, `/api/metrics` |
| **Users & Roles** | Officer directory; provisioning and administration for ADMIN / Board Secretariat |
| **Escalated Matters** | No backing: escalation is not part of the workflow, and the page says so rather than inventing data |

## Layout

```
app/
  page.tsx            single authenticated workspace
  globals.css         design tokens (brand + semantic, light/dark)
  api/                20 route handlers — the whole server surface
components/
  ui/                 design-system primitives and DataTable
  layout/             Sidebar, TopHeader
  dashboard/          KPIs, pipeline, management attention
  governance/         matter list views
  monitoring/         overview, SLA & aging
  admin/              users, settings, audit trail
lib/
  auth.ts             session resolution; no fallback principal
  authz.ts            the visibility rule, as a Prisma `where`, defined exactly once
  repo.ts             Prisma queries and row → API shape mapping
  prisma.ts           the Prisma client singleton, adapter and transaction helper
  users.ts            account-administration policy shared by API and UI
  handler.ts          error → HTTP status mapping
  generated/prisma/   generated client — not checked in; `prisma generate` rebuilds it
components/           UI (client components)
context/AuthContext   session state and data fetching
prisma/
  schema.prisma       the source of truth for the database
  migrations/         forward-only SQL, including the constraints and triggers
  seed.ts             demonstration data loader
  seed-data.ts        the fixture itself
```

---

## Matter types

Every record carries a mandatory type: Decision, Directive, Resolution, Instruction,
Policy / Rule, or Other Board Direction. Board Secretariat and administrators can add
further types at runtime without touching the workflow.

## Workflow

```
Board Secretariat → CEO → [Chief] → [Deputy Chief] → Director
   → Implementation Report → Review / Confirmation → Closed
```

Chief and Deputy Chief are optional; the CEO may assign straight to a Director. Routing
only moves down the hierarchy, and the Director is the final operational level — they
cannot forward a matter further down.

Routing distinguishes **Forward** (review and decide the next step) from **Assign** (you
are now responsible). Ownership settles only when the recipient **accepts** it.

## Status lifecycle

```
Received → Under Review → Assigned → In Progress → Clarification Required
   → Implementation Submitted → Under Review / Confirmation → Closed
```

Transitions are enforced server-side. A matter cannot be closed merely because it reached
the Director: closure requires a submitted Implementation Report that an authorized
executive has confirmed. A reviewer may instead request revision, which returns the
matter to the Director — the timeline records both passes.

Partial or ongoing implementation must carry a written reason before it can be submitted.

---

## Authentication

Sign-in is **email and password**, verified with **Argon2id** (19 MiB, 2 passes — the OWASP
minimum configuration). Only the hash is stored; no plaintext or reversible form exists.

| Control | Behaviour |
| --- | --- |
| Password policy | 12+ characters, mixed case, digit, symbol; rejects passwords containing the account's own name or email local part |
| Forced change | Seeded accounts carry a temporary credential and `must_change_password`; the API refuses **every** endpoint except password-change until it is replaced |
| Account lockout | 5 consecutive failures locks the account for 15 minutes — the correct password is refused while locked |
| Rate limiting | 20 failures from one address in 15 minutes returns 429, catching password-spraying that per-account lockout would never see |
| Enumeration | Unknown address, wrong password and credential-less account return the identical message and all pay the Argon2 cost; verification runs against a dummy hash when no account exists so timing cannot distinguish them |
| Sessions | Server-side table; the cookie holds a 256-bit random token and only its SHA-256 hash is stored, so reading the database yields nothing replayable |
| Session lifetime | 30-minute idle timeout (slid forward on use) and an 8-hour absolute cap |
| Rotation | Sign-in revokes prior sessions and issues a new token, defeating session fixation |
| Revocation | Sign-out and password change revoke server-side, not just clear the cookie |
| Security audit | Every sign-in, failure, lockout, logout and password change lands in the append-only `auth_events` table |

Cookies are `httpOnly`, `SameSite=Strict`, and `Secure` in production.

## Authorization

Authorization is enforced in the API, never by hiding UI.

`getPrincipal` validates the session against the database on every request and returns null
for an absent, unknown, revoked or expired session; `requireUser` then rejects with 401.
**There is deliberately no fallback principal** — an earlier revision defaulted an
unidentified caller to the first directory entry, the Board Secretariat, turning a missing
header into bank-wide access.

Every matter-scoped route calls `assertMatterAccess` before touching the record, so a
matter outside the caller's scope returns 403 regardless of the id in the URL. The
visibility rule itself lives in one place — `visibilityPredicate` in `lib/authz.ts` — and
the same SQL predicate drives listing, fetching, metrics and notification targeting, so a
dashboard can never count a matter its owner could not open.

| Role | Scope and rights |
| --- | --- |
| Board Secretariat | Bank-wide; registers matters, configures matter types, formally closes |
| CEO / CEO Secretariat | Bank-wide; accepts, assigns downward, confirms, closes |
| Chief | Own business area plus matters routed through them; assigns downward, confirms |
| Deputy Chief | Assigned matters and area matters under execution; assigns to Director |
| Director | Own matters only; executes and submits the Implementation Report |

Further rules: only the addressee of a clarification may answer it, and only once; only
parties accountable for a matter may attach documents; a closed matter accepts no further
documents; notifications are readable only by their recipient and are only ever sent to
users who could open the matter.

**Account administration.** Provisioning an officer, amending one, resetting a credential,
clearing a lockout and deactivating or reactivating an account are restricted to `ADMIN`
and `BOARD_SECRETARIAT`. Each of those writes an event to the append-only `auth_events`
table naming who did it, so the security history records who provisioned an account and
not merely who used one.

Three rules the API enforces on top of that:

- **Deactivation is a soft delete.** An officer is referenced by every matter they touched
  and by the audit trail, so the row is never removed — `is_active` goes false and their
  sessions are revoked. `GET /api/users` stops listing them; `?scope=all` still does, for
  the one screen that can bring them back.
- **A role change, a credential reset and a deactivation all revoke live sessions.** Each of
  them changes what that session should be allowed to do, and a session is only authorized
  when it is created.
- **A temporary credential is shown exactly once**, in the response that issues it. It is
  stored only as an Argon2 hash and cannot be read back — only reset.

There are no pre-authentication endpoints. `GET /api/users` used to be one, for a sign-in
page that offered a roster to pick from; the page now asks for an email address, so the
directory — which names every officer and their role — sits behind a session like
everything else.

---

## Audit trail

Every action appends an immutable event carrying the actor and role, timestamp, previous
and new owner, previous and new status, comment and any supporting document. Workflow
actions write the matter update, the timeline node, the audit event and any notifications
in a single transaction, so the trail can never disagree with the record.

Immutability is enforced in the database, not just the application:

```sql
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE ON audit_logs ...
CREATE TRIGGER audit_logs_no_delete BEFORE DELETE ON audit_logs ...
```

`audit_logs.matter_id` uses `ON DELETE RESTRICT`, so a matter with any history cannot be
deleted at all. UPDATE and DELETE fail even from a direct `psql` session.

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST/DELETE | `/api/auth/session` | Current session, sign in, sign out |
| POST | `/api/auth/password` | Change own password (reachable during forced change) |
| GET/POST | `/api/users` | Officer directory (`?scope=all` for admins) / provision an account |
| PATCH/DELETE | `/api/users/:id` | Amend, reset credential, unlock, deactivate / reactivate |
| GET/POST | `/api/matter-types` | Read / configure matter types |
| GET/POST | `/api/matters` | Visible matters / register a matter |
| GET | `/api/matters/:id` | Matter detail |
| GET | `/api/matters/:id/audit-trail` | Full history |
| POST | `/api/matters/:id/routing` | Forward or assign |
| POST | `/api/matters/:id/accept-ownership` | Accept responsibility |
| POST | `/api/matters/:id/clarifications` | Request clarification |
| POST | `/api/matters/:id/clarifications/:clarId/reply` | Answer clarification |
| POST | `/api/matters/:id/submit-implementation` | Director's Implementation Report |
| POST | `/api/matters/:id/confirm-completion` | Approve or request revision |
| POST | `/api/matters/:id/close` | Formal closure |
| POST | `/api/matters/:id/documents` | Attach a document |
| GET | `/api/notifications` | Caller's notifications |
| POST | `/api/notifications/:id/mark-read`, `/api/notifications/mark-all-read` | Mark read |
| GET | `/api/metrics` | Dashboard metrics, scoped to the caller |

---

## Implementation notes

**Calendar dates.** Prisma returns `@db.Date` columns as a `Date` pinned to UTC midnight,
so `toIsoDate` in `lib/repo.ts` can slice the ISO string and get the stored day back
exactly. This is the one thing to be careful about when writing a date: pass
`new Date('2026-09-30')`, which parses as UTC, and never a local-midnight `Date` — east of
Greenwich that would store 2026-09-29. Board deadlines carry no time zone and must not pass
through a timestamp conversion.

**Row locks.** Every workflow transition reads a matter's status, decides a transition from
it and writes the result, so it must serialise against other handlers doing the same.
Prisma has no row-locking API, so `lockMatter` in `lib/repo.ts` issues the
`SELECT … FOR UPDATE` directly. It is the first statement inside each of those
transactions, and it is the only place in the application that uses raw SQL.

**Derived timing.** `daysRemaining` and `isOverdue` are computed on read rather than
stored, so they cannot go stale between requests.

---

## Transport and browser hardening

`proxy.ts` applies to every response:

- **Content-Security-Policy** — nonce-based in production (`script-src 'self' 'nonce-…'
  'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`). The root page is
  `force-dynamic` because a prerendered page cannot carry a per-request nonce, which would
  leave Next.js's own scripts blocked.
- **CSRF** — state-changing `/api` requests are rejected unless `Sec-Fetch-Site` is
  same-origin and `Origin` matches the serving host. Enforced in `proxy.ts` so a new route
  cannot forget it; `SameSite=Strict` on the session cookie is the first layer.
- **HSTS** (production), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- `/api` responses are `no-store`, so Board data never enters a shared or browser cache.

Set `ALLOWED_ORIGINS` (comma-separated) if the app is served behind a hostname the
`Host` header does not reflect.

## Before production

1. **Documents are metadata only.** Names and categories are recorded; no file is stored
   or served. Real deployment needs authenticated binary storage with per-matter access
   checks on download.
2. **Seeded officer accounts share one temporary password.** `npm run db:seed` prints it
   and flags every officer account for forced change. Set `SEED_PASSWORD`, or provision real
   accounts, before any environment that is not a local demo.
3. **The administrator account is exempt from the forced change.** `admin@nibbank.et` is
   seeded from `ADMIN_PASSWORD` with `must_change_password = FALSE`, because it is the
   account used to recover the others. Set `ADMIN_PASSWORD` to a real secret — nothing
   forces this one to be replaced, so it is only as good as the value you seed it with.
4. **The password policy is six characters.** Length only: no composition requirement, with
   the account's own name/email and a single repeated character still rejected
   (`src/lib/password-policy.ts`). Online guessing is held off by lockout and the
   per-address rate limiter rather than by the policy, so raise the floor here if the
   deployment is internet-facing.
5. **No self-service password reset.** A locked-out or forgotten-password officer needs an
   administrator to reset the credential or clear the lockout from Users & Roles — there is
   no email-based self-service flow. Add one, or wire the directory to SSO.

Also review: connection-pool sizing, a forward-only migration tool in place of the
rebuild-from-scratch `db:migrate`, retention and backup policy for `audit_logs` and
`auth_events`, and alerting on `ACCOUNT_LOCKED` / `LOGIN_BLOCKED_RATE_LIMIT`.
