# Pawn to Professor Learning Hub v1.4 — Step-by-Step Upgrade

This guide upgrades a working v1.3 Learning Hub to v1.4.

## What v1.4 changes

The most important change is the access model:

- **Owner:** automatic full access.
- **Admin:** automatic full access.
- **User:** direct Unit access and/or Dynamic Access Group access.

A new Game inside a Unit does **not** require any user update. Anyone who can access that Unit automatically sees the new Game.

Dynamic Access Groups solve the future-content problem. For example, a group called **2026 Grade 3 Full Access** can contain a Grade 3 rule. Members of that group automatically receive new Grade 3 Units created later.

---

## STEP 1 — Make a GitHub backup

Open the GitHub repository:

`gourmylbcgroup-art/pawn-to-professor-learning-hub`

Create a branch from the current `main` branch named:

`backup-before-v1.4`

Return to `main` before uploading the v1.4 files.

Do not delete the backup branch.

---

## STEP 2 — Upgrade Supabase

Open:

**Supabase → Pawn to Professor Learning Hub → SQL Editor → New query**

Open this file from the v1.4 package:

`supabase/v1.4-smart-access-community.sql`

Copy the entire file, paste it into the SQL Editor, and press **RUN**.

Supabase may show a warning about destructive operations because policies/functions are replaced. This migration does not intentionally delete your existing users, Years, Grades, Units or Games.

Press **Run query** and wait for success.

Do not rerun the original `schema.sql`.

No new Vercel environment variables are required.

---

## STEP 3 — Replace the website files in GitHub

Upload/replace these files from the v1.4 package into the same paths in your repository:

- `app.js`
- `styles.css`
- `package.json`
- `api/game/create-launch.js`
- `supabase/v1.4-smart-access-community.sql`
- `README.md` (optional but recommended)

The other v1.3 files can stay unchanged.

Commit to `main` with a message such as:

`Upgrade Learning Hub to v1.4`

---

## STEP 4 — Wait for Vercel

Open:

**Vercel → pawn-to-professor-learning-hub → Deployments**

Wait for the newest deployment to show:

`Ready`

Open the live site and perform a hard refresh.

---

## STEP 5 — Confirm Owner/Admin full access

Log in as the Owner.

Open any Year → Grade → Unit.

Every Unit should be open automatically.

Then open:

**Admin → Users & Access**

Select an Admin account.

Instead of Unit checkboxes, the right side should show:

`✅ FULL PORTAL ACCESS`

Admins and Owners do not need Unit permissions anymore.

If an Admin is currently logged in on another browser, refresh or log out/in once after the upgrade.

---

## STEP 6 — Create your first Dynamic Access Group

Example: all paying members who purchased **2026 Grade 3**, including future Units.

Go to:

**Admin → Access Groups**

Create:

- **Group name:** `2026 Grade 3 Full Access`
- **Description:** `All current and future Grade 3 Units`

Press **Create Access Group**.

Select the group.

Under **Dynamic Access Rules** choose:

- Scope: `Grade`
- Target: `2026 / Grade 3`

Press **Add Dynamic Rule**.

This rule is dynamic. If you later create Unit 3, Unit 4 or Unit 10 under 2026 Grade 3, group members receive those Units automatically.

---

## STEP 7 — Put paying members into the Group

Still inside the Access Group, tick the members who purchased that plan.

Press:

**Save Members**

You do not need to tick every Unit for these members.

A user can still have additional individual Unit permissions from **Users & Access**.

The final access is effectively:

`Direct Unit Access + Dynamic Access Groups`

---

## STEP 8 — Understand what happens when you add a new Game

Suppose a paying member has access to:

`2026 → Grade 3 → Unit 2`

You publish a new Game inside Unit 2.

You do **nothing** to the member account.

The member automatically receives the Game because access is controlled at the Unit level.

---

## STEP 9 — Understand what happens when you add a new Unit

### User with individual checkboxes only

If you create `Unit 3`, that Unit is not automatically added to the user.

### User in the dynamic `2026 Grade 3 Full Access` Group

If you create `Unit 3`, it is automatically included because the Group rule covers Grade 3 dynamically.

This is the recommended model for paid plans.

---

## STEP 10 — Preview exactly what a user can access

Go to:

**Admin → Users & Access**

Select a normal User.

Press:

**Preview Effective Access**

The portal lists the Units available from both:

- Individual permissions
- Access Groups

Use this before troubleshooting a paid member's account.

---

## STEP 11 — Enable the Community Forum

Go to:

**Admin → Settings**

Turn:

`Community Forum → ON`

Return to the main portal.

A new tile appears:

`💬 Community`

The default areas are:

- 📢 Announcements
- ❓ Help & Questions
- 💡 Teaching Ideas
- 🎮 Game Feedback
- 📚 Grade Discussions
- 🛠️ Technical Support

Announcements are Admin/Owner-post-only by default.

---

## STEP 12 — Community moderation

Go to:

**Admin → Community**

You can:

- Enable/disable categories
- Make a category Admin-only for new topics
- Add a new category

Inside the normal Community screen, Owner/Admin can:

- Pin a discussion
- Lock a discussion
- Remove a discussion
- Remove a reply

Normal members cannot moderate the Community.

Private member-to-member messaging is intentionally not included in v1.4.

---

## STEP 13 — Grade/Unit discussions

When a member creates a Community topic, they can optionally attach it to a Unit.

Example:

`2026 / Grade 3 / Unit 2`

This lets teachers discuss a particular lesson or Game without creating a separate forum for every Unit.

---

## STEP 14 — Secure Game status

Open:

**Admin → Activities**

Each secure Game now shows its launch mode and a Game Gate status.

For paid Games, the preferred state is:

- `Unit Protected`
- `🟢 Game Gate`
- Private GitHub source repository when possible

If the Gate has been installed in the Game repository, press:

**Mark Gate Installed**

This status is an Admin record; it does not automatically inspect the external repository.

---

## STEP 15 — Final test with one paid member

Use a test User, not your Owner account.

1. Put the test User into `2026 Grade 3 Full Access`.
2. Log in as that User.
3. Open `2026 → Grade 3`.
4. Confirm existing Units are open.
5. As Owner, create a new Unit under 2026 Grade 3.
6. Return to the User browser and re-enter Grade 3 or refresh.
7. Confirm the new Unit is automatically open.
8. Publish a Game inside that Unit.
9. Confirm the User sees the Game without any permission changes.

---

## Recommended commercial setup

For customers buying a complete Grade:

**Use Dynamic Access Groups.**

For one-off bonus content:

**Use individual Unit access.**

For Admin and Owner:

**Never assign Unit access. Their role automatically grants everything.**

---

## Rollback

If the website UI has a problem after deployment:

1. In Vercel, redeploy the last known-good deployment, or
2. Restore GitHub `main` from `backup-before-v1.4`.

The v1.4 database migration adds new tables/functions and does not require you to remove them just to roll the frontend back temporarily.
