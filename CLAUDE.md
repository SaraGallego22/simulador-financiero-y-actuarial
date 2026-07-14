# CLAUDE.md — simulador-financiero-y-actuarial

Architecture and context guide for working in this repository. Read it before touching code: the project is **greenfield** (nothing is built yet except a reference prototype), so this document defines the *target* architecture and the decisions already made, not just conventions found in existing code.

Repository name: **`simulador-financiero-y-actuarial`**. This CLAUDE.md file stays in English by design; the repo's README is written in Spanish for the target audience (Colombian interns/evaluators).

## 1. Project purpose

A web platform for a **technical internship test in actuarial science, finance, and risk** at a Colombian insurance company. Teams of interns price an auto insurance book, manage an investment portfolio, and are graded both objectively (auto-scored against an actuarial/financial engine) and subjectively (manual rubric) across **4 challenge "days" / 2 simulated years**. An admin/evaluator manages the whole process for ~12 teams per cohort: generates the market dataset, defines the rubric, triggers simulations, grades, and publishes results.

## 2. Current status

**Nothing is built yet.** The only thing in the repo is `Pasantia_SURA_v3_inversiones_dinamicas.html`: a single-file prototype (4,094 lines, vanilla HTML+CSS+JS, no backend, no build step) that implements **the entire business domain** (pricing model, market simulation engine, reserving, P&L, solvency, ALM, grading) but as a **single-operator tool**: the professor/evaluator clicks through everything for every team in one browser tab, with no login, no roles, no multi-tenancy.

That file is the **domain source of truth** (formulas, CSV schemas, copy, pedagogical flow) and must be consulted when porting any piece of logic — but its code (global state, manual parsing, localStorage/IndexedDB persistence) is not preserved.

## 3. Stack and rationale

**Hard constraint: the project must run 100% on free tiers, with zero paid services.** Every stack decision is filtered through this — before adding any external service/dependency, confirm it has a free plan sufficient for the real volume (~12 teams per cohort, a handful of simulation runs).

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router)**, full-stack | One repo/deploy for UI + API; native role-based routing; deploys free on Vercel Hobby |
| Database | **Neon Postgres (free plan)** + **Prisma**, via `@prisma/adapter-neon` | End-to-end typing, versioned migrations, generous free tier (0.5 GB); the Neon serverless driver adapter (not a plain `pg` connection) is required — Neon's free compute suspends after inactivity, and the adapter's WebSocket-based driver handles the wake-up far more gracefully than a raw TCP connection, which can fail outright on the first query after idle (see `src/lib/prisma.ts`) |
| Auth | **NextAuth**, Credentials provider | Team accounts are username+password, created by the admin (no self-signup, **no email** — avoids depending on a paid transactional email service) |
| Bulk data | **`bytea` in the same Postgres** (not Vercel Blob) | A 1M-row `Float32` array is ~4 MB; with ~12 teams × 2 years this fits comfortably in Neon's free 0.5 GB. Avoids adding a second service (Vercel Blob) with its own separate free-tier limit — one free provider is simpler to operate and monitor |
| Deployment | **Vercel (Hobby plan, free)** | Direct Next.js integration, automatic deploys from GitHub, free `*.vercel.app` domain (no custom domain needed) |
| CSV | **Papa Parse** + **zod** (both MIT, free) | The legacy app hand-parses CSV (`split(',')`) with no quote/comma escaping — replace with a real library + schema validation |

Explicitly rejected for cost reasons: Vercel Blob as a separate service, any managed queue/worker provider (Redis Cloud, paid QStash, etc.), transactional email services, a custom domain, Vercel/Neon Pro or Team plans.

**Next.js version note:** the project was scaffolded on **Next.js 16** (React 19.2 canary), which is very recent and has real breaking changes vs. older training data — before writing App Router code, skim `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`. The two changes that matter most here: (1) `middleware.ts` is deprecated and renamed to **`proxy.ts`** (exported function renamed `proxy`) — this repo uses `proxy.ts`, not `middleware.ts`; (2) `params`/`searchParams`/`cookies()`/`headers()` are now fully async (must `await` them) everywhere, with no synchronous fallback. `next-auth@5` (beta) declares `next: ^16.0.0` as a supported peer, so it's used as originally decided (§3), but double-check its docs/examples still assume `middleware.ts` — adapt the export to `proxy.ts`'s `proxy` function name.

## 4. Key architecture decisions

### 4.1 Heavy compute (the riskiest decision in the project)

The prototype generates a synthetic universe of **10,000,000** policies (`generarColombia`) and runs a market simulation (`correrSim`) in the browser, using `await sleep()` every 10k-row batch **purely to avoid freezing the browser's render thread**. That doesn't apply on a server, and as-is it wouldn't fit a Vercel serverless function's time/memory limits.

**Decision adopted (revised under the zero-cost constraint — see §3):**

1. **Shrink the universe to 1,000,000 rows** (Chile reference set: 50k–100k, down from 200k). This is pedagogically equivalent: at n=1M, frequency/severity estimates and market outcomes (discrete-choice/logit) are statistically indistinguishable from n=10M for teaching purposes — the point of the exercise is interpreting model outputs, not large-sample precision. This alone cuts compute/storage ~10x, which is also what makes it feasible to avoid paid background-job infrastructure (point 3).
2. **Rewrite the engine in TypeScript with typed arrays** (`Float32Array`/`Int32Array`/etc.), dropping the yield `sleep()` calls (unnecessary with no UI thread to protect). With typed arrays and no artificial yields, 1M rows × ~12 teams through the 3 phases of `runSimulation` runs in the order of seconds in Node, not minutes.
3. **Run universe generation and simulation synchronously inside a single Vercel serverless function (Route Handler), triggered by the admin — no queue, no separate worker, no polling.** A dedicated queue/worker service (Redis, QStash, a persistent Node process on Railway/Fly) would almost always mean an additional paid service outside the free tier — explicitly rejected under the zero-cost constraint. Instead: the Route Handler does all the work (generate/simulate with the optimized engine) and responds when done, using `export const maxDuration = 300` (the *actual* max on Vercel's Hobby plan — an earlier revision of this decision incorrectly assumed 60s). If any single computation risked approaching the limit, the mitigation is to keep optimizing the engine (more typed arrays, fewer allocations) or split the work into 2-3 sequential calls chained from the admin client itself (e.g. generate Colombia, then Chile, then simulate) — not standing up new infrastructure.
4. **The universe is NOT persisted as a blob — it's regenerated from the seed.** Revised after a real production incident: storing the Colombia universe as a ~40MB `bytea` value and reading it back measured **84-100 seconds**, both via `@prisma/adapter-neon` (WebSocket) and a plain `pg` connection (TCP) — ruling out the adapter as the cause. Follow-up measurement on a 4MB tariff blob (~10s) shows the same ~0.4-0.5 MB/s effective rate, so this is a **per-byte throughput ceiling on Neon's free-tier compute**, not an overhead specific to very large single values — expect roughly 1 second per ~0.5MB read from any `bytea` column on this tier, budget accordingly. The 40MB universe exhausted the simulation route's `maxDuration` in production (confirmed: `Vercel Runtime Timeout Error: Task timed out after 120 seconds`). Since `generateColombia(seed)`/`generateChile(seed)` are deterministic and take ~1 second, **only the seed is persisted** (`UniverseRun.seed`, already a trivial field); any route that needs the universe regenerates it in memory instead of reading it from the database. `src/lib/binary.ts` still keeps `serializeColombiaUniverse`/`deserializeColombiaUniverse` (with tests) in case some future use case (export/audit) genuinely needs to persist a specific universe snapshot, but the live code path doesn't use them.
5. **Postgres persistence only for what can't be regenerated**: per-team aggregates (what leaderboards/results actually query) live in normal tables; each team's uploaded tariff (~4MB per team per day, real user data, not regeneratable) lives in a `bytea` column. At the measured ~0.4-0.5 MB/s, fetching N teams' tariffs sequentially costs roughly `N × 10s` (measured: 3 teams ≈ 30s total) — still comfortably inside the 300s budget for realistic cohort sizes (~12 teams ≈ ~2 min), but worth knowing before assuming the simulation route is "fast": it isn't, the free tier's bandwidth is the ceiling now, not compute. If team counts grow much larger, revisit (candidates: parallelize the per-team fetches, though this is likely bandwidth- not latency-bound so may not help much; or accept a paid Neon tier if the user opts into that). **Never** store 1M rows as individual relational records (one row per policy).
6. Explicitly rejected: running the unmodified 10M-row generator behind a serverless function as-is (exceeds time/memory); any job/queue architecture that requires a paid service; and persisting the full universe as a blob (see point 4).

### 4.2 Result visibility/publishing

The legacy app already has a claims-visibility-censoring pattern by notice date (`esVisible2027`/`esVisible2028`/`esVisible2029`, simulating real IBNR opacity). This generalizes into a **`published`** flag on every result/score (per team, per day): the admin controls when each team sees its results, grading at their own pace without forcing an all-or-nothing global reveal.

### 4.3 Team CSV uploads: chunked, not a single request

A team's tariff CSV covers all 1,000,000 exposures (`id_expuesto,prima`) — as plain text that's realistically 15-20 MB. **Vercel Functions hard-cap the request body at 4.5 MB** (`FUNCTION_PAYLOAD_TOO_LARGE` above that, confirmed against Vercel's docs, no streaming workaround for request bodies on the Node.js runtime). A single-request upload would fail in production for any real-size file, even though it "works" against a small test CSV — this is exactly the kind of gap that only shows up at realistic scale.

**Decision:** the team's browser does the CSV parsing (reusing `src/lib/csv.ts`, which is plain isomorphic TS — no server-only APIs) and builds the full `Float32Array(1_000_000)` client-side, then uploads it in ~800 KB binary chunks (200,000 floats each, 5 chunks total) via sequential `POST` requests to the same submission. The server accumulates chunks by reading the current stored `Bytes` value, splicing in the new chunk at its offset, and writing back — no new Prisma model needed, `TariffSubmission.data` just gets progressively filled in. `meanPremium` is only set (marking the submission complete) after the final chunk, so a submission stuck mid-upload is visibly incomplete rather than silently corrupt.

This keeps every individual request tiny and free-tier-safe without adding Vercel Blob or any other service, at the cost of a few sequential round-trips per upload — acceptable given uploads happen a handful of times per team per day, not continuously.

## 5. Repo structure (target)

```
/prisma
  schema.prisma
  migrations/
/src
  /domain                     # pure engine, NO dependency on Next.js/Prisma/React — testable in isolation
    /pricing/                 # calcLambda, calcMediaSev
    /generation/              # seedRand (deterministic LCG), generateColombia, generateChile
    /market/                  # runSimulation (3-phase logit market clearing)
    /reserving/               # precomputeLiability, precomputeDevelopment (chain-ladder / IBNR)
    /finance/                 # finBench, almSim, almNav, almLadder, scoreFinanciero
    /grading/                 # scoreConcepto, scoreAnalitica
    *.test.ts                 # unit tests, fixed seed, no DB/network
  /lib
    prisma.ts                 # Prisma client singleton
    auth.ts                   # NextAuth config, role callbacks
    csv.ts                    # Papa Parse + zod validators per schema
    binary.ts                 # typed array <-> Buffer/Postgres bytea (de)serialization
  /app
    /(team)/
      dashboard/page.tsx
      day/[n]/page.tsx        # sub-tabs: submissions, objective results, subjective grading, leaderboard
      standings/page.tsx
      layout.tsx              # enforces role===TEAM, scopes by teamId
    /admin/
      universe/page.tsx
      chile/page.tsx
      config/page.tsx         # rubric + team account creation
      day/[n]/page.tsx         # all teams' submissions, trigger sim, grade
      standings/page.tsx
      layout.tsx              # enforces role===ADMIN
    /api/
      auth/[...nextauth]/route.ts
      universe/route.ts        # generates Colombia/Chile synchronously (only the seed is persisted), maxDuration=300
      simulation/route.ts       # regenerates the universe from its seed + runs runSimulation, maxDuration=300
      teams/[id]/tariffs/route.ts  # + one route per submission type
    proxy.ts                    # role-based route gating (NextAuth) — Next.js 16 renamed middleware.ts to proxy.ts
```

`/src/domain` imports nothing from Next.js/Prisma/React: it takes plain typed arrays/params in and returns plain data out, so it can be tested in isolation. There is no `/scripts` worker folder — no separate process exists; everything runs inside Next.js Route Handlers.

## 6. Domain glossary (legacy → new)

| Legacy function/variable (approx. line) | New module | What it does |
|---|---|---|
| `calcLambda` (2490), `calcMediaSev` (2533) | `src/domain/pricing` | GLM-style frequency/severity model (multiplicative, with interactions and deliberately weak "trap" variables) |
| `seedRand` (2444), `gammaRand`/`lognormalRand` | `src/domain/generation` | Deterministic seeded LCG — **reproducibility must be preserved** |
| `generarColombia` (2543), `generarChile` (2618) | `src/domain/generation` | Synthetic universe generators (Colombia target 1M, Chile 50-100k) |
| `correrSim`/`correrSim2` (3013+) | `src/domain/market/runSimulation.ts` | 3-phase market clearing: logit-utility assignment, rejection by market-share cap, redistribution of excess demand |
| `precomputeAllLiab`/`computeLiab` (1532/1569), `precomputeDevel` (1590) | `src/domain/reserving` | Chain-ladder-style development pattern, IBNR emergence |
| `finBench` (1113) | `src/domain/finance/finBench.ts` | P&L + simplified balance sheet + Solvency-II-style capital (underwriting/financial/operational risk) |
| `almSim`/`scoreFinanciero`/`almNAV`/`almLadder` (1659-1837) | `src/domain/finance` | Portfolio-vs-liability cashflow matching, NAV sensitivity to rate shocks |
| `scoreConcepto` (1227), `scoreAnalitica` (1222) | `src/domain/grading` | Auto-grading of uploaded financial deliverables and sector recommendations against tolerance bands |
| `esVisible2027/2028/2029` (2482, 3660, 4060) | `published` flags on `MemberDayEvaluation`/`TeamSimResult` | Claims censoring by notice date → generalized into grading visibility |
| `page-tarifas3`/`simulacion3`/`resultados3`/`reportes3`, `correrSim3` | **do not migrate** | Orphaned "Year 3" code with no sidebar entry point — an abandoned feature, not a spec. See §10. |

## 7. Data model (Prisma summary)

Principles: role lives on `User` (enum `ADMIN`/`TEAM`, nullable `teamId`); everything that was global-per-run in the legacy app (universe, rubric) carries a `cohortId` to isolate future cohorts/classes without collision; bulk data lives in `Bytes` (`bytea`) columns of the same Postgres, never a separate blob service; visibility via `published`.

Main models: `User`, `Cohort`, `Team`, `TeamMember`, `UniverseRun` (universe/Chile; `data Bytes?` column with the serialized array), `SimulationRun` + `TeamSimResult` (per-team aggregates; `extra Json` field for the many `finBench`/`almSim` outputs until the schema stabilizes after the engine port), `TariffSubmission` (`data Bytes` column with 1M serialized floats), `PortfolioAllocation`, `Deliverable`, `AnalyticsRecommendation`, `RubricConfig` (objective weights/tolerances only), `MemberDayEvaluation` (one row per team member per day, Días 2-4 only: a 1-5 `notaGeneral`, an independent `aprobado` check, a categorical `perfil`, and a free-text `comentario`/`comentarioAutor`, with `published`).

Field-by-field detail is defined when writing `prisma/schema.prisma`; this summary fixes the entities and relations, not the final DDL. Watch Neon's free 0.5 GB as cohorts accumulate — if it approaches the limit, purge `UniverseRun`/`TariffSubmission` rows from closed cohorts before considering a paid plan.

## 8. Views by role

**Team (intern):** only their own currently-open day (tariffs/portfolio/deliverables/analytics), objective results only after admin publishes, their own subjective grade read-only, read-only leaderboard (everyone's rank/position, but other teams' raw data never visible). No access to: universe generation, rubric config, other teams' submissions, uncensored master CSVs, triggering simulations.

**Admin (evaluator):** all of the above unrestricted, plus universe/Chile generation, rubric/weight configuration, team account creation, triggering simulations, subjective grading per team/member, publish control, uncensored master exports.

Every team-data query must be filtered by `teamId = session.teamId` at the data-access layer (not just hidden in the UI) — the legacy app had zero enforcement of this because one trusted operator handled everything; this is now a real self-service portal.

## 9. Next.js routes

```
/login
/(team)/dashboard
/(team)/day/[n]
/(team)/standings
/(team)/model-docs
/admin
/admin/universe
/admin/chile
/admin/config
/admin/day/[n]
/admin/standings
```

`proxy.ts` (the Next.js 16 name for what used to be `middleware.ts` — the `middleware` file convention is deprecated in v16, renamed to `proxy`/`proxy.ts`) blocks `/admin/*` unless `session.role === 'ADMIN'`, and any unauthenticated request redirects to `/login`.

## 10. What to port vs rewrite from the legacy file

**Port** (adapt into Tailwind/React): the brand palette (`--azul:#0033A0`, `--azul-oscuro:#002280`, `--azul-claro:#EEF2FB`, yellow accent), Barlow/Barlow Condensed typography, per-day instructions/copy (**keep in Spanish** — the actual users, interns and evaluators, are Spanish-speaking; only this CLAUDE.md file and code identifiers are in English, the product UI is not), the sub-tab structure (Entregables / Resultados objetivos / Calificación subjetiva / Top del día), the rubric shape (weighted skills list).

**Rewrite completely:** all global JS state, manual CSV parsing, localStorage/IndexedDB persistence, and the no-auth model. **Do not migrate**: the orphaned "Year 3" pages (`tarifas3`/`simulacion3`/`resultados3`/`reportes3`) — they have no entry point in the legacy sidebar and are an abandoned feature, not a pending spec.

## 11. Dev workflow commands (planned)

`package.json` doesn't exist yet. Once the project is scaffolded, expect commands equivalent to:

```
npm run dev                        # Next.js dev server
npx prisma migrate dev             # apply local migrations
npx prisma studio                  # browse data
npm run test                       # unit tests for /src/domain
```

## 12. Deployment

Vercel **Hobby plan (free)** + Neon Postgres **free plan**. No custom domain (uses the `*.vercel.app` subdomain). Expected env vars: `DATABASE_URL`, `AUTH_SECRET` (Auth.js v5's env var name — the `NEXTAUTH_*` names are the legacy v4 convention). No `BLOB_READ_WRITE_TOKEN` or queue/worker variables — those services don't exist here. Heavy generation/simulation runs inside normal Route Handlers with `export const maxDuration = 300` (Hobby's actual max — see §4.1); there is no background function or dedicated worker to deploy separately. Auth uses `trustHost: true` (see `src/lib/auth.ts`) since Vercel preview URLs change per branch and there's no fixed domain to hardcode as `AUTH_URL`.

## 13. Constraints — what NOT to do

- **Do not add any paid service or plan** (Vercel Pro/Team, Neon paid tier, Vercel Blob, managed queues, transactional email, a custom domain) without explicitly confirming with the user first — the project must run 100% on free tiers.
- Do not resurrect the orphaned "Year 3" pages or create routes for them without an explicit user request.
- Do not hand-parse CSV (`split(',')`) — use Papa Parse + zod schema validation.
- Do not break the seeded RNG's determinism when porting the engine — pin tests to outputs for a fixed seed.
- Do not expose results or scores to a team session without respecting the `published` flag.
- Do not store individual policy-level rows (hundreds of thousands/millions) as Postgres records — aggregates per team only; bulk arrays go in `Bytes` columns of the same Postgres.
- Do not persist the Colombia/Chile universe as a `Bytes` blob — regenerate it from `UniverseRun.seed` instead. A ~40MB `bytea` read measured 84-100s on Neon's free tier (both via the adapter and plain `pg`), which is why this changed; don't reintroduce it for a "small optimization" without re-testing against the free-tier compute at realistic size.
- Do not introduce a separate queue/worker service for heavy compute — it must run synchronously inside the Route Handler (see §4.1).
- Do not upgrade `@prisma/adapter-neon` independently of `@prisma/client`/`prisma` — their major versions must match (installing "latest" once pulled in a v7 adapter against a v6 client, which is incompatible; pin the adapter to the exact same version as `@prisma/client`).
- Do not write product-facing copy (UI strings, README/guide prose — not internal code comments, which are a different audience and already follow their own rationale-heavy convention in this repo) that emphasizes what does *not* happen, references alternatives that were only discussed in conversation, or reassures that something was implemented "correctly"/"as discussed". Phrases like "(el que realmente sometió, no la solución óptima)" or "ya conectado correctamente" read fine mid-iteration but are noise to someone reading the shipped product cold — state only what *is* true, directly. This pattern crept into copy across a whole feature (Día 1 min-variance exercise, July 2026) before being caught and cut; watch for it recurring.
