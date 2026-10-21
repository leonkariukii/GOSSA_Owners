# GOSSA

GOSSA is an owner-facing workshop operations app for a single garage. It provides a dashboard, a mechanic roster, and repair-job tracking without mechanic logins or money-related features.

The authoritative product scope, domain rules, and API contract are in [docs/SPEC.md](./docs/SPEC.md). Coding-agent rules and the pinned stack are in [AGENTS.md](./AGENTS.md).

## What it does

- Owner sign-in and sign-out with server-managed sessions (PostgreSQL `sessions` table, HttpOnly/SameSite=Lax cookie, per-session CSRF token, 8-hour sliding idle and 7-day absolute lifetimes).
- Dashboard with open, in-progress, waiting and completed-today counts plus recent jobs.
- Mechanic roster: create, search, edit, mark off duty/available, archive.
- Repair jobs: create with customer and vehicle snapshot, search/filter/sort/paginate, edit, assign or unassign a mechanic, move through the status lifecycle, view history, archive.
- Optimistic concurrency on every mutation (`ETag` / `If-Match: "vN"`), atomic job/mechanic updates, one in-progress job per mechanic enforced in the database, and tenant-scoped data access.
- Garage settings (name and time zone).

## Stack

| Area | Choice |
|---|---|
| Frontend | React (JSX) + Vite in `src/`, TanStack Query, axios |
| API | Node.js 24 + Express in `server/` (plain JavaScript, no build step) |
| Database | PostgreSQL via `pg`, migrations via `node-pg-migrate` |
| Auth | `argon2` (Argon2id) and a project-owned sessions table (no `express-session`) |
| Validation | `zod` |
| Tests | Vitest + Supertest (server), Vitest + React Testing Library (client) |

## Requirements

- Node.js 24 or newer, and npm.
- PostgreSQL 14 or newer (CI uses 16).

## Set up

Install dependencies for the frontend and the server:

```sh
npm install
npm --prefix server install
```

Create a database and point the API at it. See [server/.env.example](./server/.env.example) for every variable; `DATABASE_URL` is required and has no default.

```sh
createdb gossa
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/gossa
```

Apply migrations, then create the initial garage and owner:

```sh
npm --prefix server run migrate:up
npm --prefix server run bootstrap:owner
```

`bootstrap:owner` is idempotent and never overwrites an existing owner. In a terminal it prompts for the garage name, IANA time zone, owner name and email, and a password (12–128 characters, entered without echo). Outside a terminal it reads `GOSSA_GARAGE_NAME`, `GOSSA_GARAGE_TIMEZONE`, `GOSSA_OWNER_NAME`, `GOSSA_OWNER_EMAIL` and `GOSSA_OWNER_PASSWORD` from the process environment. It never prints the password, and there is no default password. Do not commit credentials.

### Owner login details

There are no default or shared login credentials. Sign in using the owner email and password supplied when the initial owner was created:

- For local setup, `server/src/bootstrap-owner.js` reads the `GOSSA_OWNER_EMAIL` and `GOSSA_OWNER_PASSWORD` environment variables, or securely prompts for them when run in a terminal. `server/.env.example` documents the variable names with placeholders only.
- For Render, set `GOSSA_OWNER_EMAIL` and `GOSSA_OWNER_PASSWORD` in the service's environment settings as secrets. They are used only to create the first owner.
- The email is stored in the PostgreSQL `owner_users` table. The password is Argon2id-hashed into `owner_users.password_hash`; the original password cannot be recovered from the database. Bootstrap does not overwrite an existing owner, so changing those environment variables later does not change the login.

On the sign-in screen, use the browser's password manager to save and autofill the login on future visits. The Show password control can help check for typing mistakes. If the password has been lost, contact the deployment/database administrator; this project does not yet include a password-reset command.

## Run locally

In separate terminals from the repository root:

```sh
npm --prefix server run dev   # API on http://localhost:3000
npm run dev                   # Vite on http://localhost:5173, proxying /api to the API
```

Open <http://localhost:5173> and sign in with the owner you bootstrapped. The API also serves a health check at `/health`. To use another API port, set `PORT` for the API and update the proxy target in [vite.config.js](./vite.config.js).

## Production

Build the frontend, then run the API with `NODE_ENV=production`. Express serves the built `dist/` after the API routes, so the app is same-origin and CORS stays disabled. Session cookies get the `Secure` flag in production, so serve over HTTPS. Behind a reverse proxy set `TRUST_PROXY` to the number of proxy hops so client IPs (used for login rate limiting) are correct.

```sh
npm run build
npm --prefix server ci --omit=dev
npm --prefix server run migrate:up
npm --prefix server start
```

[render.yaml](./render.yaml) describes a single Render web service plus a PostgreSQL database that runs these steps. Set `GOSSA_OWNER_EMAIL` and `GOSSA_OWNER_PASSWORD` as secrets in the dashboard. Configuration is validated at startup; missing required values stop the server rather than falling back to development defaults.

## Checks

Frontend, from the repository root:

```sh
npm run lint
npm test
npm run build
```

Server tests need a dedicated, **disposable** PostgreSQL database. The suite applies migrations to it and truncates every table between tests, and it refuses to run against a database whose name does not contain `test`.

```sh
createdb gossa_test
export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/gossa_test
npm --prefix server run lint
npm --prefix server test
```

The tenant-isolation tests create a second garage directly in that database; there is deliberately no API for creating garages.

## Repository layout

```text
.
├── src/                    # React + Vite frontend (pages, components, hooks, API client in lib/)
├── server/
│   ├── migrations/         # Versioned, non-destructive PostgreSQL migrations
│   ├── src/                # Express app: routes, services, repos (SQL), validation, http middleware
│   └── test/               # Vitest + Supertest API and database tests
├── docs/SPEC.md            # Product scope, domain rules, and API contract
├── render.yaml             # Render deployment (web service + PostgreSQL)
├── index.html
├── package.json            # Frontend scripts and dependencies
└── vite.config.js
```

## Not yet done

- `npm --prefix server run reset:owner-password` (secure owner password reset with session revocation) is planned operational follow-up.
- The hardening items in SPEC §11 (full accessibility audit, latency measurement, browser end-to-end tests, backup and restore rehearsal) have not been done or measured.
- [vercel.json](./vercel.json) is a leftover from an earlier split deployment that proxied `/api` to a separate host. The supported deployment is a single same-origin Express service, so it can be removed unless you still deploy the frontend separately.

## Scope

GOSSA v1 intentionally excludes inventory, parts purchasing, billing, estimates, invoices, payments, taxes, accounting, mechanic/staff accounts, customer and vehicle master records, multi-garage access, and public registration.
