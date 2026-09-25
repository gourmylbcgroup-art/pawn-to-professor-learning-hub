# Pawn to Professor v1.6.6 — Device Verification Auto-Open Display Fix

## Exact cause found

The six-digit code was already being accepted correctly.

After successful verification, `enterPortal()` opened the Learning Hub, but
`enterPortal()` did not hide `deviceVerifyView`.

Both screens were therefore present at the same time:

- Verify New Device screen = still visible
- Learning Hub portal = opened underneath/below it

Because `.board-shell` uses `overflow: hidden`, you continued seeing the
verification screen and it looked like nothing happened.

When you manually refreshed, `deviceVerifyView` started hidden, so the already
verified account opened normally. This is why refresh always fixed it.

## Fix

v1.6.6 explicitly hides:

`deviceVerifyView`

before calling:

`enterPortal()`

## Installation

In GitHub replace only:

`device-verify-fix.js`

Do NOT change:

- `app.js`
- `index.html`
- `login-compatibility.js`
- `password-recovery.js`
- `api/security.js`
- `vercel.json`
- Supabase SQL

No SQL is required.

Commit to `main`, wait for Vercel Production to show **Ready**, then hard refresh:

Mac: `Command + Shift + R`

## Expected test

1. Login on the new device.
2. Receive the six-digit email.
3. Enter the code.
4. Press **Verify Device**.
5. See briefly:
   `✅ Device verified. Opening your classroom…`
6. The Learning Hub should immediately replace the verification screen.

No manual refresh should be necessary.
