# Pawn to Professor Learning Hub v1.3 — Installation

## What this update solves

A normal member no longer receives the real game URL as the PLAY link.

Instead:

`Learning Hub → PLAY 🔐 → server checks access → temporary token → protected game`

For a **Unit Protected** activity the server checks:
- the user is logged in;
- the profile is active and not expired;
- the user is Owner/Admin **or** has access to that exact Unit;
- the activity is published and its secure target is enabled.

The browser address bar stays on the Learning Hub player page, for example:

`https://pawn-to-professor-learning-hub.vercel.app/play.html?activity=<id>`

Photographing or copying that address does not bypass login/unit access.

> Important limitation: no browser-delivered game can be made impossible to copy by a highly technical user. This update is designed to stop ordinary link sharing and direct-URL reuse. For paid games, keep source repositories private and add the included game gate.

---

# INSTALL IN THIS ORDER

## Step 0 — Choose the correct SQL path

Do **not** run the original `schema.sql` again.

If you already installed v1.2, run only `v1.3-secure-game-launcher.sql`.

If you are **not sure** whether v1.2 was installed, use `INSTALL-v1.2-and-v1.3-COMBINED.sql`. It applies the v1.2 admin/design upgrade and then the v1.3 secure launcher. The migrations are designed to be safe to run again.

Your existing Vercel variables remain unchanged:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

No new secret is required.

## Step 1 — Back up the current Learning Hub

Before changing `main`, create a GitHub backup branch such as:

`backup-before-v1.3`

Do not delete your working branch.

## Step 2 — Run the database migration

### Recommended if you are unsure whether v1.2 was installed
Open:

`supabase/INSTALL-v1.2-and-v1.3-COMBINED.sql`

### If v1.2 is definitely already installed
Open:

`supabase/v1.3-secure-game-launcher.sql`

Then in Supabase:

`SQL Editor → New query → paste the entire chosen file → RUN`

This migration:
- creates the protected `activity_targets` table;
- copies existing `activities.launch_url` values into it;
- creates short-lived launch-token storage;
- makes `activities.launch_url` nullable for future secure activities;
- keeps the old URLs in place temporarily so your current v1.2 site still works during the upgrade.

Do **not** run the finalization SQL yet.

## Step 3 — Upload the v1.3 website files to GitHub

Replace the v1.2 files with the v1.3 versions from this package, preserving paths.

Important new files:

- `play.html`
- `play.js`
- `play.css`
- `api/game/create-launch.js`
- `api/game/validate-launch.js`
- `game-security/ptp-game-gate.js`

Also replace:

- `app.js`
- `package.json`

Keep your current `assets/classroom-bg.png`, environment variables, and Supabase project.

Commit to your deployment branch (`main` if that is what Vercel currently deploys).

## Step 4 — Wait for Vercel

Open:

`Vercel → pawn-to-professor-learning-hub → Deployments`

Wait until the new deployment says **Ready**.

Open the live Learning Hub and log in as Owner.

## Step 5 — Test an existing game BEFORE hiding old URLs

Go to:

`Admin → Games & Activities`

Choose the Year → Grade → Unit containing an existing game.

The activity should show a security label. Existing migrated activities default to:

`unit`

Open/edit the activity and confirm the real deployed game URL is correct.

Return as an authorized member and press:

`PLAY 🔐`

A new Learning Hub player page should open.

At this point one of two things happens:

### A. The game appears inside the player
Excellent. Continue to Step 6.

### B. The player stays blank / says the host may block embedding
The game host may have an `X-Frame-Options` or CSP rule that prevents iframe embedding. For your own Vercel HTML5 games this is normally easy to correct. Do not run the finalization SQL until the game displays correctly.

## Step 6 — Protect the game itself (recommended for paid games)

The Hub hides the real URL from the address bar, but a technical user could inspect browser network traffic. The game gate prevents the discovered real URL from working normally later.

For each paid/protected HTML5 game:

1. Copy `game-security/ptp-game-gate.js` into the **root of that game's repository**.
2. Open `ptp-game-gate.js` and check this line:

   `const TRUSTED_HUB = 'https://pawn-to-professor-learning-hub.vercel.app';`

   If your Learning Hub uses another live address, replace it. Later, for a custom domain, use something like:

   `https://learn.pawntoprofessor.com`

3. In the game's `index.html`, add this as the **first script in `<head>`**:

   `<script src="./ptp-game-gate.js"></script>`

4. Redeploy that game.

5. Test the game URL directly in an Incognito window. It should show:

   `🔒 Protected activity — Please launch this game from your authorized Learning Hub account.`

6. Then launch it through the Learning Hub. It should work.

### For paid games
Keep the GitHub source repository **PRIVATE** whenever possible. A public source repository lets anyone download the original HTML/JavaScript whether or not the website link is protected.

## Step 7 — Test link sharing

Use an authorized test account:

1. Open Grade 3 → Unit 2 → your game.
2. Press `PLAY 🔐`.
3. Copy the **Learning Hub player URL** from the browser address bar.
4. Open an Incognito window.
5. Paste the player URL.

For `Unit Protected`, an unauthorized visitor should receive login/access denial.

Then try with a logged-in test user who does **not** have Unit 2. The result should say:

`This activity is not included in your account.`

## Step 8 — Finalize and hide the legacy URLs

Only after Step 5–7 work, run:

`supabase/v1.3-finalize-hide-legacy-urls.sql`

In Supabase:

`SQL Editor → New query → paste → RUN`

This clears the old `activities.launch_url` values. The actual destinations remain in `activity_targets`, which normal members cannot read through Supabase RLS.

This is the step that finishes the URL separation.

## Step 9 — Adding a new secure game

From now on:

`Admin → Games & Activities`

Choose:
- Year
- Grade
- Unit
- Type
- Security
- Launch token life
- Title
- **Real Game URL (Admin only)**

Recommended for paid material:

`Security = Unit Protected`

Recommended token life:

`3 minutes`

Then press:

`+ Publish Secure Activity`

The member sees only:

`PLAY 🔐`

not the real external URL.

---

# Security modes

## Unit Protected — recommended for paid Grade/Unit material

Requires the exact Unit permission. Owner/Admin always pass.

## Members

Any active, non-expired Learning Hub member can launch the activity.

## Public

No account is required to create the short-lived launch. Use only for intentionally free activities.

---

# Example — Grade 3 Unit 2

Admin configuration:

- Year: `2026`
- Grade: `Grade 3`
- Unit: `Unit 2`
- Title: `Numbers Tug of War`
- Security: `Unit Protected`
- Token life: `3 minutes`
- Real Game URL: your deployed Vercel game address

User A has Grade 3 / Unit 2 → game opens.

User B does not have Grade 3 / Unit 2 → access denied.

A photo of the Learning Hub `/play.html?activity=...` URL does not grant User B access.

---

# Troubleshooting

## "Secure game target is not configured"
Open Admin → Games & Activities → Edit and enter the real game URL.

## "This activity is not included in your account"
The account does not have that Unit, or its Unit access expired.

## Direct game URL still works
The game's own `ptp-game-gate.js` has not been installed, the trusted Hub address is wrong, or the old deployment is still cached/live.

## Game works directly from source repository
Make the paid game's GitHub repository private. The secure launcher protects access to your hosted game; it cannot make public source code private.

## Player is blank
The external game host may block iframe embedding with security headers. Check the game's Vercel configuration/CSP. Do not finalize old URLs until embedding works.
