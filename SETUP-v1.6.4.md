# Pawn to Professor v1.6.4 — Username Login Compatibility

## Why this patch is needed

Older member accounts may have a Supabase Auth email such as:

`stephane@alphagenus.com`

while the Learning Hub profile username is simply:

`stephane`

The old browser login automatically converted `stephane` to:

`stephane@portal.local`

That is correct for newer accounts, but wrong for legacy accounts.

## What v1.6.4 does

A teacher may now sign in with either:

- their Pawn to Professor username, e.g. `stephane`
- OR their full Auth email, e.g. `stephane@alphagenus.com`

The server privately resolves the username to the correct Supabase Auth user.

The resolved email is NOT returned to the browser.

The existing trusted-device security still runs immediately after successful password authentication.

## No SQL required

Do NOT run any Supabase SQL for this patch.

## Vercel function count

This patch adds one API function:

`api/login.js`

After the earlier v1.6.2 consolidation, the repository had 10 Vercel API functions.
This patch makes 11, which remains below the Hobby limit of 12.

## Install

In GitHub:

1. Add:
   `api/login.js`

2. Add:
   `login-compatibility.js`

3. Replace:
   `index.html`

4. Do NOT change:
   - `app.js`
   - `api/security.js`
   - `vercel.json`
   - `device-verify-fix.js`
   - `password-recovery.js`
   - any Supabase SQL

5. Commit to `main`.

6. Wait for Vercel Production to show **Ready**.

7. Hard refresh:
   Mac: `Command + Shift + R`

## Test

On another browser/device:

Username:
`stephane`

Password:
the current Stéphane password

Expected flow:

`stephane`
→ password accepted
→ New Device detected
→ 6-digit email code
→ Verify Device
→ Learning Hub

Also test that the full email still works:

`stephane@alphagenus.com`

Both should sign into the same account.

## Security

- Login responses stay generic (`Username or password is not correct.`).
- The real Auth email used internally is not returned to the browser.
- Login attempts use the existing server-side rate limiter.
- Password verification is still performed by Supabase Auth.
- The service-role key never leaves the server.
