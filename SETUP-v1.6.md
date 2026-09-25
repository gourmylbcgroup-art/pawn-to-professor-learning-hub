# Pawn to Professor Learning Hub v1.6 — Step-by-Step Installation

This upgrade assumes v1.5 is already working.

## What this patch does

### Normal members

- One trusted browser/device at a time.
- First/new device → 6-digit code to the member's real `contact_email`.
- Code expires after 10 minutes by default.
- Device stays trusted for 90 days by default.
- Verifying PC/Browser B replaces PC/Browser A.
- Secure Game and Resource access on the old session is rejected immediately.
- The normal portal checks the active session every 30 seconds and signs the old browser out.

### Owner/Admin

- No trusted-device verification.
- No one-device restriction.

### Resources

- Add iCloud/file-share links to Year → Grade → Unit.
- OPEN and/or DOWNLOAD buttons.
- Unit-members or staff-only audience.
- The raw iCloud URL remains in the protected target table, not in the normal resource query.

### Notifications

- Optional checkbox when publishing a Game, Resource or Unit.
- Only entitled normal members are emailed.
- Emails link back to the Learning Hub, never directly to the protected Game/file.

---

# STEP 1 — Back up GitHub

Open:

`gourmylbcgroup-art/pawn-to-professor-learning-hub`

Create a branch from the current `main` called:

`backup-before-v1.6`

Return to `main` before replacing files.

---

# STEP 2 — Run the v1.6 Supabase migration

Open:

**Supabase → SQL Editor → New query**

Open:

`supabase/v1.6-security-resources-notifications.sql`

Copy the entire file and press **Run** once.

The migration uses `BEGIN ... COMMIT` and is designed to be rerunnable.

It adds new tables/settings. It does not intentionally delete your existing users, Years, Grades, Units, Games, Access Groups, or forum content.

Do **not** rerun the old `schema.sql`.

Expected result:

`Success. No rows returned`

---

# STEP 3 — Configure email BEFORE enabling device security

The verification code must be delivered to the real member email stored in:

`profiles.contact_email`

v1.6 uses Resend for server-side email.

## 3A. Create/prepare Resend

Create a Resend account and add/verify your sending domain, preferably:

`pawntoprofessor.com`

Resend will give DNS records. Add those records in Cloudflare DNS and wait until the domain shows verified.

Create an API key in Resend.

## 3B. Add Vercel Environment Variables

Open:

**Vercel → pawn-to-professor-learning-hub → Settings → Environment Variables**

Add:

`RESEND_API_KEY`

Value: your Resend API key.

Add:

`EMAIL_FROM`

Example:

`Pawn to Professor <security@pawntoprofessor.com>`

Add:

`PORTAL_BASE_URL`

Example:

`https://learn.pawntoprofessor.com`

Optional but recommended:

`DEVICE_CODE_SECRET`

Use a long random secret of at least 32 characters. Do not share it or put it in GitHub.

Apply variables to Production (and Preview if you test there).

---

# STEP 4 — Replace the v1.6 website files in GitHub

Replace/add the v1.6 package files in the same paths.

Important changed/new files include:

- `index.html`
- `app.js`
- `styles.css`
- `play.js`
- `package.json`
- `api/_lib/email.js`
- `api/_lib/security.js`
- `api/security/check-device.js`
- `api/security/verify-device.js`
- `api/security/session-status.js`
- `api/admin/reset-device.js`
- `api/admin/notify-content.js`
- `api/admin/create-user.js`
- `api/admin/system-health.js`
- `api/resource/resolve.js`
- `api/game/create-launch.js`
- `supabase/v1.6-security-resources-notifications.sql`

Keep the existing files that are already in the package as well.

Commit to `main`, for example:

`Upgrade Learning Hub to v1.6 security resources notifications`

---

# STEP 5 — Wait for Vercel

Open:

**Vercel → pawn-to-professor-learning-hub → Deployments**

Wait until the newest Production deployment says:

`Ready`

Then hard-refresh the site.

On Mac:

`Command + Shift + R`

---

# STEP 6 — Check System Health

Login as Owner/Admin.

Open:

**Admin → System Health**

Confirm:

- Supabase URL configured
- Server secret configured
- Email provider configured
- Portal base URL configured

If Email Provider says not configured, do not enable trusted-device security yet.

---

# STEP 7 — Check member real emails

Before enabling security, open:

**Admin → Users & Access**

Every normal member who will use the site must have a valid real contact email.

Example:

`teacher@example.com`

Do not use `@portal.local` as the contact email. `@portal.local` is only your internal login alias.

New Admin-created member accounts now require a real contact email.

---

# STEP 8 — Test trusted-device security with ONE test member

Keep yourself logged in as Owner in one browser.

Open:

**Admin → Settings**

For the first test set:

- Member Trusted-Device Security → ON
- Trust period → 90 days
- Verification code → 10 minutes

Use a normal test member whose `contact_email` you can access.

## PC/Browser A

1. Login as the test member.
2. The Learning Hub should stop at **Verify New Device**.
3. A 6-digit code is sent to the real contact email.
4. Enter the code.
5. PC/Browser A becomes trusted.
6. The member enters the Learning Hub.

## PC/Browser B

1. Login to the same member account from another browser/device.
2. A new verification email is required.
3. Enter the new code.
4. Browser B becomes the only trusted device.
5. Browser A loses trusted status.

The old browser's secure Game/Resource requests are rejected immediately. The open portal checks every 30 seconds and signs the old session out.

If Browser A logs in again later, it must verify again, and Browser B then becomes the old/revoked device.

This means there are **not multiple 90-day trusted devices**. There is always one current trusted device per normal member.

---

# STEP 9 — Owner/Admin behavior

Owner/Admin accounts do not receive device verification.

They can login normally from their own browsers/devices.

In **Admin → Users & Access**, selecting an Admin/Owner displays full-access/exempt status.

---

# STEP 10 — Reset a member's trusted device

Open:

**Admin → Users & Access → select a normal member**

The Security card shows the currently trusted browser/device and trust expiry.

Press:

**Reset Trusted Device**

The next member login requires a new email verification code.

Use this when a teacher replaces/loses a computer or you suspect account sharing.

---

# STEP 11 — Add an iCloud resource

In iCloud Drive, upload your PDF, flashcards, worksheet, audio or ZIP.

Create an iCloud share link. For the simple setup you can use Apple's `Anyone with the Link` / view-download sharing.

Then in the Learning Hub open:

**Admin → Resources**

Choose:

- Year
- Grade
- Unit
- Type
- Title
- Description
- Audience
- Open/View allowed
- Download allowed

Paste the iCloud share URL into:

**iCloud / file share link**

Press:

**Publish Resource**

Normal members with access to that Unit now see the Resource card.

### Important iCloud limitation

The Learning Hub hides the raw target until access is checked. However, once iCloud opens, the member can see/copy an `Anyone with the Link` URL. iCloud links are therefore convenient access control, not strong DRM.

---

# STEP 12 — Email members when new content is published

Open:

**Admin → Settings**

Turn:

**New Content Email Notifications → ON**

When publishing a Game or Resource, tick:

**Email members who can access this Unit**

When creating a new Unit, tick:

**Email members who automatically receive this Unit**

Only normal active members who effectively have access to that Unit are selected. This includes Dynamic Access Group access.

The email contains:

- what was added
- Year / Grade / Unit
- button back to the Learning Hub

It does **not** contain the private Game/iCloud link.

Existing Games and Resources also have an **Email Members** button in Admin if you want to announce something later.

---

# STEP 13 — Recommended first production settings

Use:

- Member Trusted-Device Security: ON
- Trusted device: 90 days
- Code expiry: 10 minutes
- Email notifications: ON
- Owner/Admin: exempt automatically
- Normal members: one trusted browser/device only

---

# STEP 14 — Important browser behavior

The system identifies a trusted browser/device using a random browser identifier stored locally.

A member may be asked to verify again if they:

- change physical computer
- change browser (Chrome → Safari)
- use another browser profile
- clear browser storage
- use Incognito/Private mode
- reinstall/reset the browser

A simple IP change by itself does **not** revoke the trusted device. IP is recorded only as a one-way hash and can change normally between home, school and mobile networks.

---

# STEP 15 — Rollback

If the frontend causes a problem:

1. Redeploy the last known-good Vercel deployment, or
2. Restore GitHub `main` from `backup-before-v1.6`.

The v1.6 database migration adds tables/columns and does not require deletion just to roll the frontend back.

If email is temporarily unavailable, Owner/Admin can login and turn **Member Trusted-Device Security OFF** until email delivery is fixed.
