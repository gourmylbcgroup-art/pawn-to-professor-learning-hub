# Pawn to Professor v1.6.7 — Larger Board After Login

This patch changes ONLY the logged-in presentation.

## What stays unchanged

- Login screen keeps the current original classroom background.
- Registration screen keeps the current original classroom background.
- New-device verification keeps the current original classroom background.
- Supabase database and all SQL stay unchanged.
- Login compatibility, password recovery and device security stay unchanged.

## What changes after login

Once `portalView` opens:

- the site switches to `assets/classroom-bg-portal.png`
- the green chalkboard becomes much larger
- the HTML board area is repositioned to fit the new background
- dashboard / Grade / Unit cards become larger
- card titles, subtitles, buttons and activity text become easier to read
- Admin still scrolls normally inside the board
- logging out automatically restores the original login background

## Install in GitHub

Repository:

`gourmylbcgroup-art/pawn-to-professor-learning-hub`

Add:

1. `assets/classroom-bg-portal.png`
2. `portal-layout.css`
3. `portal-layout.js`

Replace:

4. `index.html`

Do NOT replace:

- `app.js`
- `styles.css`
- `login-compatibility.js`
- `password-recovery.js`
- `device-verify-fix.js`
- `api/security.js`
- `vercel.json`

## SQL

NO SQL is required.

Do not run any Supabase migration for this visual update.

## Deploy

Commit the four file changes to `main`.

Suggested commit message:

`v1.6.7 larger board after login`

Wait for Vercel Production to show **Ready**.

Then hard refresh:

Mac:
`Command + Shift + R`

## Test

Before login:
- original classroom remains unchanged.

After login:
- new larger-board classroom appears automatically.
- 2026 / Teacher Tools / Grades / Units are substantially larger.
- Log out returns to the original login background.
