# Pawn to Professor Learning Hub v1.2 — Upgrade Guide

This upgrade is designed for the existing Learning Hub already connected to Supabase + GitHub + Vercel.

## What v1.2 adds

- Owner / Admin / User roles
- Owner-only promotion and demotion of administrators
- Public registration ON/OFF with admin approval
- 2026 school year structure
- Add / rename / duplicate / archive Years and Grades
- Add / edit / duplicate / hide Units
- Bulk-create Units
- Add / edit / duplicate / move / hide Activities
- Access Packages
- Admin Dashboard + JSON backup
- Audit Log
- Design Studio: title, subtitle, fonts, theme, buttons, layout, colors, background
- Teacher / External Tools manager for the EFL Lesson Planner or any URL

## Important

Install the SQL migration first, then update the website files. Do not rerun the old base `schema.sql`.

## Step 1 — Backup

In GitHub, create a branch from `main` called `backup-before-v1.2` if you want an extra manual safety copy.

## Step 2 — Upgrade Supabase

Open:

`Supabase → SQL Editor → New query`

Copy and run the entire file:

`supabase/v1.2-owner-design-tools.sql`

The warning about destructive operations is expected because the migration replaces constraints, policies, and triggers. It does not delete your user/content tables.

After it succeeds, keep:

`Authentication → Sign In / Providers → Email → Allow new users to sign up = OFF`

Your portal registration API handles pending requests.

## Step 3 — Confirm the Owner

The migration promotes the active account with username `owner` to role `owner`.

If no `owner` username exists, it promotes the oldest active admin so the site always keeps one Owner.

Only the Owner can change account roles.

## Step 4 — Update GitHub files

Replace these files on your website branch:

- `index.html`
- `app.js`
- `styles.css`
- `package.json`
- `api/admin/create-user.js`

Add:

- `supabase/v1.2-owner-design-tools.sql`

Keep the existing:

- `api/config.js`
- `api/register-request.js`
- `assets/classroom-bg.png`
- `vercel.json`

## Step 5 — Deploy

Commit the changes. Vercel should build automatically.

No new Vercel environment variables are required for v1.2.

Keep the three existing variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Step 6 — Test Owner/Admin roles

Log in with your Owner account.

Open:

`Admin → Users & Access`

Select a normal user. The Owner can change Role to:

- User
- Admin
- Owner

An Admin can manage content and users but cannot change roles.

The final Owner cannot be demoted unless another Owner already exists.

## Step 7 — Test Design Studio

Open:

`Admin → Design Studio`

Try Preview first. You can change:

- Portal title
- Subtitle
- Brand line
- Body font
- Heading font
- Theme
- Button style
- Menu layout
- Board opacity
- Primary / accent colors
- Custom background URL

Press `Save Design` only when satisfied.

Design changes are stored in Supabase and do not require another GitHub/Vercel deployment.

## Step 8 — Add the EFL Lesson Planner

Open:

`Admin → Teacher Tools`

Example:

- Name: `EFL Lesson Planner`
- Icon: `📝`
- Description: `Create EFL lesson plans`
- URL: paste your planner URL
- Audience: choose who can see it

The tool opens in a new tab. Its code stays separate from the Learning Hub.

## Step 9 — Access Packages

Open:

`Admin → Access Packages`

Create packages such as:

- All Grades — Unit 1
- Grade 5 Full
- Full 2026
- Trial Package

Then open a user in `Users & Access`, choose a package, click `Apply Package`, then `Save User`.

## Step 10 — Content management

Open:

`Admin → Content Structure`

You can add, rename, duplicate, archive, restore, hide, or bulk-create structure items.

Open:

`Admin → Activities`

You can add, edit, duplicate, move, hide, or show activities.

## Step 11 — Dashboard / Backup / Audit

`Admin → Dashboard` shows account and content counts.

`Download JSON Backup` exports the current portal data available to the admin account.

`Admin → Audit Log` shows recent admin actions.

## Recommended test order

1. Owner can log in.
2. 2025 + 2026 appear.
3. Admin panel opens.
4. Promote one test user to Admin, then demote them again.
5. Create a test Unit and Activity.
6. Create an Access Package.
7. Add the EFL Lesson Planner URL.
8. Preview a design change, then save it.
9. Turn Registration ON, test a pending registration, then turn it OFF again if desired.
