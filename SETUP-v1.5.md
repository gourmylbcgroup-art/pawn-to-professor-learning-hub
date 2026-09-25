# Pawn to Professor Learning Hub v1.5 — Step-by-Step Upgrade

This upgrade is intentionally focused on **speed, stability and monitoring**. It does not change your Year/Grade/Unit structure, Dynamic Access Groups, Community content, secure games or existing users.

---

## STEP 1 — Make a safe GitHub backup

Open your repository:

`gourmylbcgroup-art/pawn-to-professor-learning-hub`

Create a branch from the current `main` called:

`backup-before-v1.5`

Then return to `main` before uploading the update.

If you already have an older backup branch, keep it too.

---

## STEP 2 — Upgrade Supabase

Open:

**Supabase → Pawn to Professor Learning Hub → SQL Editor → New query**

Open this file from the v1.5 package:

`supabase/v1.5-performance-reliability.sql`

Copy the entire file into the SQL Editor and press **RUN**.

Supabase may warn that the script replaces triggers/functions. That is expected. The migration does **not intentionally delete your users, Years, Grades, Units, games, access groups or Community discussions**.

Wait for a successful result.

Do **not** run the old `schema.sql` again.

### What the SQL adds

- Query indexes for accounts, activities, access permissions, forum content and secure game tokens.
- `api_rate_limits` — a small internal table used only by trusted server-side code.
- `consume_api_rate_limit(...)` — the server-side limiter function.
- Community posting guards:
  - maximum 5 new topics per member within 5 minutes;
  - maximum 20 replies per member within 5 minutes.

These limits are intended to prevent accidental double-click floods and simple automated abuse, not to interfere with normal teacher use.

---

## STEP 3 — Replace/add the v1.5 files in GitHub

From the v1.5 package, upload these files to the **same paths** in the repository.

### Replace

- `app.js`
- `styles.css`
- `package.json`
- `vercel.json`
- `play.html`
- `play.js`
- `play.css`
- `api/register-request.js`
- `api/admin/create-user.js`
- `api/game/create-launch.js`

### Add

- `api/_lib/rate-limit.js`
- `api/admin/system-health.js`
- `supabase/v1.5-performance-reliability.sql`

`README.md` can also be replaced with the v1.5 copy.

Do not delete your existing game-security or older migration files.

Commit to `main` with a message such as:

`Upgrade Learning Hub to v1.5 performance reliability`

---

## STEP 4 — Wait for Vercel

Open:

**Vercel → pawn-to-professor-learning-hub → Deployments**

Wait for the newest deployment to show:

`Ready`

No new Vercel environment variables are needed. Keep your existing:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## STEP 5 — Hard-refresh the website

Open the live Learning Hub.

On Mac use:

`Command + Shift + R`

On Windows use:

`Ctrl + Shift + R`

Log in as your Owner account.

---

## STEP 6 — Check normal Learning Hub access

Before testing the new performance tools, confirm the normal portal still works:

1. Open `2026`.
2. Open a Grade.
3. Confirm Owner/Admin Units are all open automatically.
4. Open a secure game.
5. Confirm the v1.4.1 loading overlay appears while the game loads.

If these work, continue.

---

## STEP 7 — Test System Health

Go to:

**Admin → 🩺 System Health**

You should see cards for:

- Database response time
- Total accounts
- Activities
- Community topics
- Active secure-launch tokens
- Recent rate-limit buckets
- Supabase server configuration status

Press **Run Again** to repeat the checks.

A database check below roughly 700 ms is shown as healthy in the UI. A slower result is not automatically a failure; network distance and temporary platform load can affect it.

The page never displays your Supabase secret value. It only says whether the required configuration exists.

---

## STEP 8 — Test the improved Users screen

Go to:

**Admin → Users & Access**

The account list now shows up to **25 accounts at a time** on the board.

Use:

`Search username, name or email`

Then press **Search**.

Use **Previous / Next** to move between pages.

Important: the Admin session still loads the account metadata it needs for Access Groups and pending-request counts, but v1.5 avoids rendering a huge list of account cards at once. Normal members never download the Admin user list.

---

## STEP 9 — Test Community pagination

If Community is enabled:

- A category shows up to **20 discussions per page**.
- A discussion shows up to **30 replies per page**.

If there are more, **Previous / Next** controls appear automatically.

You do not need to change existing Community posts.

---

## STEP 10 — Understand the new rate limits

### Public registration

A browser/device is allowed up to **5 registration attempts per 10 minutes**.

Normal registration is unaffected. Repeated automated requests receive HTTP `429 Too Many Requests`.

### Secure game launches

A user/device is allowed up to **120 secure launch requests per minute**.

This is intentionally generous for classroom use. It mainly stops loops or automated abuse.

### Admin account creation

An Admin/Owner can make up to **30 account-creation requests per 10 minutes** from the same session/device.

These limits can be adjusted later if your real usage shows a reason to change them.

---

## STEP 11 — Static asset caching

`vercel.json` now allows classroom files under `/assets/` to be cached for longer.

This means repeated visitors should not repeatedly download the same large classroom background image.

Application JavaScript itself is not aggressively cached, so future portal updates can still appear promptly after deployment/hard refresh.

---

## STEP 12 — What v1.5 does NOT claim

v1.5 improves the architecture, but it does **not** guarantee a specific number of simultaneous teachers.

Actual capacity depends on:

- Vercel plan/limits
- Supabase plan/limits
- game file sizes
- number of simultaneous secure launches
- geographic/network conditions
- Community activity

The correct next step after real usage grows is to measure actual traffic and only optimize the bottleneck that appears.

---

## STEP 13 — Recommended test before inviting many teachers

Use a small staged rollout:

1. Owner/Admin test.
2. 2–5 normal teacher accounts.
3. 10 teachers.
4. 25 teachers.
5. 50+ only after the previous stage is stable.

During testing, periodically check:

**Admin → System Health**

and the Vercel/Supabase dashboards for errors and resource limits.

---

## STEP 14 — Rollback

If the new frontend has a problem:

1. In Vercel, redeploy the last known-good deployment, **or**
2. Restore GitHub `main` from `backup-before-v1.5`.

The v1.5 database additions can safely remain while you temporarily run the previous frontend. They do not require removing existing Learning Hub data.
