# FitTrack

A self-hosted fitness tracker that combines the three things I was otherwise
logging in three different places: meals with real nutrition data, workouts
with estimated calorie burn, and sleep/recovery pulled from a Whoop strap. I
built it because the apps that do all of this charge a subscription and still
guess at nutrition numbers; here, ingredients come from the free USDA
FoodData Central database, and everything lives in a Postgres database I
control. It is a personal project — the main thing I was learning was how a
full Next.js App Router app fits together end to end, from Row Level Security
in the database up to server components and server actions.

<!-- SCREENSHOTS
To add them: save four PNGs into docs/screenshots/ named dashboard.png,
meals.png, trends.png and whoop.png, then replace this entire comment
(from <!-- SCREENSHOTS through the closing marker) with the block below.

## Screenshots

| Dashboard | Meal log |
| --- | --- |
| ![Dashboard](docs/screenshots/dashboard.png) | ![Meals](docs/screenshots/meals.png) |

| Trends | Sleep and recovery |
| --- | --- |
| ![Trends](docs/screenshots/trends.png) | ![Whoop](docs/screenshots/whoop.png) |
-->

## Stack

- **Next.js 16** (App Router, server components, server actions) + **React 19**
- **TypeScript**, **Tailwind CSS 4**
- **Supabase** — Postgres, Auth, and Storage for meal photos. All tables are
  Row-Level-Security-scoped to `auth.uid()`, so the database enforces
  per-user isolation rather than the application layer.
- **Recharts** for trend and week charts
- **Anthropic API** (`@anthropic-ai/sdk`) for the coach chat and photo-to-meal estimates
- **USDA FoodData Central** for ingredient nutrition
- **Whoop API** (OAuth 2.0) for recovery, sleep, strain, and imported workouts
- **Vitest** for unit tests
- Deployed on **Vercel**, including a daily cron that refreshes Whoop data

## What it does

- **Meals** — build a meal from ingredients searched against USDA, or photograph
  the food/package/label and have Claude estimate it. Stores per-100g nutrients
  and scales by weight. Tracks fiber, sugar, sodium, potassium, and cholesterol
  alongside calories and macros.
- **Workouts** — MET-formula calorie estimates, per-set strength logging with
  per-exercise progress charts, and workouts imported from Whoop.
- **Sleep and recovery** — recent nights from Whoop: performance, efficiency,
  and stage breakdown.
- **Daily** — hydration, habits, supplements.
- **Goals and trends** — calorie/macro/water targets, 14-day charts, weekly review.
- **AI coach** — a chat that gets the current day's numbers as context.

## AI limits and Pro

The AI features cost real money per call, so they are metered per user per day,
with a paid tier that raises the ceiling.

| Per day | Free | Pro |
| --- | --- | --- |
| Photo meal scans | 3 | 15 |
| AI meal estimates | 3 | 30 |
| Coach messages | 1 | 15 |
| Spend cap | $0.04 | $0.45 |
| Coach model | Haiku | Sonnet |

The call allowance alone does not bound cost — one long coach conversation is
worth many photo scans — so there is a spend cap behind it. Free users get a
cap too, because a free user generates no revenue and an abusive one is pure
loss.

**Enforcement lives in one place.** Both this app and the iOS client call the
same Supabase Edge Functions (`analyze-photo`, `coach-chat`), which hold the
Anthropic key and check entitlement, quota and spend before anything reaches
the model. The web routes under `/api/coach/` are thin proxies that forward the
caller's access token. This app previously enforced its own limits and the two
implementations had drifted about 25x apart, which is what motivated the
change: a paywall implemented twice is a paywall that disagrees with itself.

Entitlement is recorded per `(user_id, source)` — Stripe for web, the App Store
for iOS, plus a promotional source for comped accounts — and the effective tier
is "pro if any source is currently active", with expiry enforced on read so a
dropped webhook cannot leave access switched on. Only the webhooks, running as
the service role, can write it; the client has a select policy and nothing else,
so a tampered client cannot grant itself Pro.

## Setup

Requires Node.js 20+ and a free Supabase project.

1. Clone and install:

   ```bash
   git clone https://github.com/<you>/fittrack.git
   cd fittrack
   npm install
   ```

2. Create a Supabase project, then open the SQL Editor and run the entire
   contents of [`supabase/schema.sql`](supabase/schema.sql). This creates every
   table, the private `meal-photos` storage bucket, and all RLS policies. Every
   statement is idempotent, so re-running it after a `git pull` is safe.

   Then run [`supabase/migrations/2026-08-16-exercise-sets.sql`](supabase/migrations/2026-08-16-exercise-sets.sql)
   in the same editor. It is not folded into `schema.sql` yet, and without it
   the workout pages and `/week` render empty instead of erroring.

3. Configure environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
   Project Settings → Data API. Those two are enough to sign up and log meals
   manually. The remaining keys are optional and each gates one feature —
   `.env.example` says which.

4. Run it:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and sign up. Supabase sends a confirmation email
   by default; to skip that while developing, turn off email confirmation under
   Authentication → Sign In / Providers.

Tests: `npm test` (Vitest, no environment variables or database needed).

### Notes on local development

- **Whoop cannot be tested on localhost.** Whoop requires an https redirect
  URI, so the connect flow only works from a deployed https URL. Everything
  else works locally.
- **Timezone.** Day bucketing is pinned to `America/Toronto` via `APP_TZ` in
  `src/lib/day.ts`. Change it there if you are elsewhere, or days will roll
  over at the wrong hour.
- **Photo analysis costs money** — roughly 1–2¢ per photo against your own
  Anthropic key. There is a $1/day cap in the code.

## Status

Working and in daily use by its author, deployed on Vercel. It is a personal
project rather than a product: there is no onboarding, no multi-tenant story
beyond Supabase RLS, and the dark theme is not configurable. Whoop support
assumes a Whoop developer app in dev mode, which is capped at 10 users.

A companion iOS client (not in this repo) shares the same Supabase project and
the same Edge Functions, which is why the AI limits above are enforced there
rather than in this app.

Not planned: I am not taking feature requests or maintaining this for other
people. Fork it if it is useful.

## Deploying

It runs on Vercel with no special configuration — connect the repo, add the
same variables from `.env.example`, and push.

Two extra variables are needed in Production, and only for the nightly Whoop
refresh defined in [`vercel.json`](vercel.json):

- `SUPABASE_SERVICE_ROLE_KEY` — the cron has no logged-in user, and Row Level
  Security scopes every row to `auth.uid()`, so it needs a client that bypasses
  RLS. Server-side only; never expose it to the browser.
- `CRON_SECRET` — Vercel sends this as a bearer token, and the route verifies
  it before doing anything.

Without them `/api/cron/whoop` returns 500 and refuses to run, which is
deliberate: an unauthenticated endpoint that mutates every user's data should
fail closed. Whoop data then only refreshes when someone presses **Sync now**.
Environment variable changes need a redeploy before they take effect.

## License

MIT — see [LICENSE](LICENSE).
