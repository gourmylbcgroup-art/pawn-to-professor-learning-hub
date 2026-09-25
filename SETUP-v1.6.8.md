# Pawn to Professor v1.6.8 — Admin Usage Analytics

This patch adds detailed usage analytics visible only to Admin/Owner.

## What it records

The analytics system records the exact content used:

- exact game/activity title
- exact resource/file title
- whether a resource was VIEWED or DOWNLOADED
- exact Year / Grade / Unit path
- exact Teacher Tool used
- Home / Year / Grade / Unit page visits
- Community / category / topic visits
- user who used it
- exact date and time

It also shows:

- Active users
- Game plays
- File views
- Downloads
- Page visits
- Most-used content
- Unique users for each content item
- Detailed activity history
- Published content unused in the selected period

Normal members cannot read analytics.

## Important design choice

Game plays are counted only after the secure game-launch API accepts access.

Resource views/downloads are counted only after the secure resource resolver accepts access.

This is more accurate than simply counting visible button clicks.

## No new Vercel API function

v1.6.8 uses a Supabase RPC and therefore does NOT add another Vercel serverless function.

Your current Vercel Hobby function count is unchanged.

---

# INSTALLATION

## STEP 1 — Supabase

Open:

Supabase → SQL Editor → New query

Run the COMPLETE file:

`supabase/v1.6.8-admin-analytics.sql`

Expected result:

`Success. No rows returned`

This migration creates only the analytics table, indexes, RLS policy and secure logging RPC.

It does NOT delete or modify your users, games, Grades, Units, Resources, Access Groups or security records.

## STEP 2 — GitHub

Add:

- `analytics.js`
- `analytics.css`
- `supabase/v1.6.8-admin-analytics.sql`

Replace:

- `index.html`
- `play.js`

Do NOT replace:

- `app.js`
- `styles.css`
- `portal-layout.css`
- `portal-layout.js`
- `device-verify-fix.js`
- `login-compatibility.js`
- `password-recovery.js`
- `api/security.js`
- `vercel.json`

Commit to `main`.

Suggested commit:

`v1.6.8 admin usage analytics`

## STEP 3 — Vercel

Wait for the Production deployment to show:

`Ready`

Then hard refresh:

Mac:
`Command + Shift + R`

## STEP 4 — Generate test data

Use a normal member account and:

1. Open 2026
2. Open a Grade
3. Open a Unit
4. Play one game
5. View one resource
6. Download one resource
7. Open Teacher Tools if available

## STEP 5 — View analytics

Login as Admin/Owner:

Admin → `📈 Usage Analytics`

You can filter by:

- Today / 7 days / 30 days / All time
- Games / Downloads / Resources / Pages / Tools
- User
- Year
- Grade

The history displays:

Date/time | User | Action | Exact content used | Location

Example:

`25/09/2026 21:42 | Stéphane | 🎮 Played | Numbers 1–10 | 2026 / Grade 3 / Unit 2`

---

# Privacy / Security

- Only authenticated Admin/Owner can SELECT from `usage_events`.
- Normal members cannot read the analytics table.
- Normal members cannot insert directly into the table.
- Usage is written through a SECURITY DEFINER RPC.
- The RPC derives username/content names from the database rather than trusting browser-supplied names.
- No raw IP address is stored.
- No password, device code or security secret is stored.
