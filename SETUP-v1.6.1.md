# Pawn to Professor Learning Hub v1.6.1 — Password Recovery

This is a small patch on top of the working v1.6 site.

## What it adds

- **Forgot password?** button on the normal Learning Hub login screen.
- Teacher can enter either:
  - their Pawn to Professor username, or
  - their real registered `contact_email`.
- A secure one-time reset link is sent through the existing Resend email setup.
- Reset link expires after **20 minutes**.
- Raw reset tokens are never stored in the database; only a SHA-256 hash is stored.
- Successful password reset clears the normal member's trusted-device state.
- The next login can therefore require the normal 6-digit trusted-device verification.
- The API deliberately does not reveal whether a username/email exists.
- Basic rate limiting is included.
- Legacy Supabase `type=recovery` links are also recognized when Supabase provides a recovery session.

## Important advantage for your portal

Many Pawn to Professor accounts use an internal Auth address such as:

`teacher01@portal.local`

while the real teacher email is stored separately in:

`profiles.contact_email`

This patch sends password-reset mail to **contact_email**, so teachers can reset their password even when the internal Supabase Auth email is not a real mailbox.

---

## STEP 1 — Keep v1.6 working

Do not rerun `schema.sql`.

Do not remove the trusted-device migration.

This patch assumes v1.6 is already installed and working.

---

## STEP 2 — Run the v1.6.1 SQL migration

Open:

**Supabase → SQL Editor → New query**

Open:

`supabase/v1.6.1-password-recovery.sql`

Copy the complete file and press **Run** once.

Expected result:

`Success. No rows returned`

The migration only adds the `password_reset_challenges` table and indexes. It does not delete users, Years, Grades, Units, Activities, Access Groups, or forum content.

---

## STEP 3 — Confirm email configuration

The patch reuses your v1.6 Resend email service.

In Vercel, these must already exist:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `PORTAL_BASE_URL`

`PORTAL_BASE_URL` must be the real working HTTPS address of your Learning Hub.

If you are currently using the Vercel URL, use:

`https://pawn-to-professor-learning-hub.vercel.app`

If `https://learn.pawntoprofessor.com` is already live and working, you can use that instead.

Do not put a trailing `/`.

---

## STEP 4 — Upload the patch to GitHub

Open:

`gourmylbcgroup-art/pawn-to-professor-learning-hub`

Replace:

- `index.html`

Add:

- `password-recovery.js`
- `api/security/request-password-reset.js`
- `api/security/reset-password.js`
- `supabase/v1.6.1-password-recovery.sql`
- `SETUP-v1.6.1.md` (optional documentation)

Do **not** replace `app.js`, `styles.css`, or your v1.6 security files for this patch.

Commit to `main`, for example:

`v1.6.1 secure password recovery`

---

## STEP 5 — Wait for Vercel

Open:

**Vercel → pawn-to-professor-learning-hub → Deployments**

Wait until the new Production deployment says:

`Ready`

Then hard refresh:

**Mac:** `Command + Shift + R`

---

## STEP 6 — Test with Stéphane

1. Open the Learning Hub login page.
2. Press **Forgot password?**
3. Enter Stéphane's registered real email, for example:
   `stephane@alphagenus.com`
4. Press **Send Reset Email**.
5. Check the inbox/spam folder.
6. Open the new Pawn to Professor reset email.
7. The link should open the Learning Hub directly on:
   **Create a new password**
8. Enter the new password twice.
9. Press **Save New Password**.
10. You should see:
   `Password changed successfully. Sign in with your new password.`

Because the password reset clears trusted-device state, when Stéphane signs in again the normal **Verify New Device** flow may send the 6-digit device-security email. That is expected.

---

## STEP 7 — Future use

Teachers no longer need an Admin to reset forgotten passwords.

They use:

**Login → Forgot password?**

The Admin's **Reset Trusted Device** button remains separate. It does not reset passwords; it only removes the currently trusted browser/device.

---

## Security notes

- Reset links expire after 20 minutes.
- A link can be used only once.
- Database stores only a SHA-256 hash of the reset token.
- Passwords are changed through Supabase Admin Auth on the server; the service-role key is never exposed to the browser.
- Request endpoint uses generic responses to reduce account-enumeration risk.
- Reset requests and attempts use the existing v1.5 API rate limiter.
