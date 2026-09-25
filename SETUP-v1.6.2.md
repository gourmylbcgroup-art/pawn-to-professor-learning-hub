# Pawn to Professor v1.6.2 — Consolidated Security API

This patch fixes the Vercel deployment problem caused by having too many separate `/api` functions on the Hobby project.

## What changes

Five security endpoints are consolidated into one Vercel Function:

- `check-device`
- `verify-device`
- `session-status`
- `request-password-reset`
- `reset-password`

The browser URLs do not change. `vercel.json` rewrites the old URLs internally to the single new function.

## Important

**No new Supabase SQL is required for v1.6.2.**

Keep the v1.6 and v1.6.1 database migrations you already ran.

Do not run `schema.sql` again.

---

## Installation — GitHub web interface

### 1. Add the new consolidated function

In your repository root, add:

`api/security.js`

Use the file from this package.

### 2. Replace `vercel.json`

Replace the existing root `vercel.json` with the v1.6.2 version from this package.

### 3. Delete the five old function files

Delete exactly these files:

- `api/security/check-device.js`
- `api/security/verify-device.js`
- `api/security/session-status.js`
- `api/security/request-password-reset.js`
- `api/security/reset-password.js`

After deleting them, the `api/security/` folder may disappear. That is fine.

### 4. Do NOT delete these shared libraries

Keep:

- `api/_lib/security.js`
- `api/_lib/email.js`
- `api/_lib/rate-limit.js`

They are used by the new `api/security.js` function.

### 5. Do NOT change the frontend

Keep your current:

- `app.js`
- `password-recovery.js`
- `index.html`
- `styles.css`

The rewrites preserve the existing frontend API URLs.

### 6. Commit

Commit the changes to `main`, for example:

`v1.6.2 consolidate security functions for Vercel Hobby`

### 7. Vercel

Open:

**Vercel → pawn-to-professor-learning-hub → Deployments**

The new deployment should move from **Building** to **Ready**.

The project should now have approximately 10 Vercel Functions instead of 14.

### 8. Test in this order

1. Open the normal Learning Hub.
2. Log in as Owner/Admin.
3. Confirm Admin still opens.
4. Log out.
5. Test a normal member login.
6. Test trusted-device verification.
7. Test `Forgot password?`.
8. Send a reset email.
9. Open the reset link and save a new password.
10. Log in with the new password and verify the device code if requested.

## Rollback

If this deployment fails, the previous Vercel Production deployment remains available. Do not delete the previous Ready deployment until v1.6.2 has been tested.
