# Pawn to Professor v1.9.5 — Admin Cleanup Center

This patch adds:

**Admin → 🗑 Cleanup**

It implements the safer cleanup structure we discussed.

## 1. Rejected registrations

Rejected registrations appear in Cleanup.

Admin/Owner can press:

`Delete Registration`

The system requires the exact username to be typed.

Permanent deletion removes the Supabase Auth account and its profile cascade.
This frees:

- the username
- the real contact email

so the person can register again later.

Admin/Owner accounts cannot be deleted from this tool.

## 2. Activities / Interactive Lessons

Each activity shows:

- Archive
- Restore
- Delete Permanently

Permanent deletion only appears after the activity is archived/hidden.

The exact activity title must be typed before deletion.

Deleting an Activity also allows PostgreSQL cascade rules to remove its protected
activity target / launch-token relationships.

## 3. Resources

Same safety model:

- Archive first
- Restore if needed
- Delete Permanently only when archived

Exact title confirmation is required.

## 4. Units

A Unit must first be hidden in:

`Admin → Content Structure`

Then it appears in:

`Admin → Cleanup → Hidden Units — Danger Zone`

Permanent Unit deletion is **Owner only**.

Before deletion, the server shows counts for:

- activities
- resources
- direct Unit access
- teaching packages
- curriculum mappings
- access-group rules
- forum topics
- usage records

Then the Owner must type:

`DELETE UNIT Unit X`

exactly.

## 5. Audit Log

No individual audit-entry Delete button is added.

Instead:

- Admin/Owner can export the audit log as JSON.
- Owner can purge records older than:
  - 30 days
  - 90 days
  - 180 days (recommended default)
  - 365 days
  - 730 days

The Owner must type:

`PURGE AUDIT`

A new audit entry is created after the purge.

Legal consent records are NOT touched.

---

# INSTALLATION

No SQL is required.

This patch uses your existing:

- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- Admin/Owner authentication
- RLS
- existing database cascade relationships

## STEP 1 — GitHub

ADD:

- `admin-cleanup.js`
- `admin-cleanup.css`
- `api/admin/cleanup.js`

REPLACE:

- `index.html`

The included `index.html` is based on the latest sequential patch and keeps:

- responsive Desktop / iPad / Mobile layout
- legal Admin fix
- Learner Topic browsing
- Community audience controls
- registration scroll fix

Do NOT replace:

- `app.js`
- `legal.js`
- `member-trial.js`
- `responsive-display.css`
- any SQL file

Suggested commit:

`v1.9.5 admin cleanup center`

## STEP 2 — Vercel

Wait for:

`Production → Ready`

Then hard refresh.

Mac:
`Command + Shift + R`

Windows:
`Ctrl + F5`

## STEP 3 — Test rejected nickname deletion

1. Open Admin.
2. Open `🗑 Cleanup`.
3. Find `Rejected Registrations`.
4. Press `Delete Registration`.
5. Type the exact rejected username.
6. Confirm.
7. The row disappears.
8. That username/contact email is now free to register again.

## STEP 4 — Test an Interactive Lesson

1. Admin → Cleanup.
2. Find `Activities & Interactive Lessons`.
3. Press `Archive`.
4. The item changes to `Archived / hidden`.
5. A red `Delete Permanently` button appears.
6. Press it.
7. Type the exact lesson/activity title.
8. It is permanently removed.

Recommended: normally use Archive. Use permanent deletion only when you are sure.

## STEP 5 — Test Audit retention

As Owner:

1. Admin → Cleanup.
2. Scroll to `Audit Log Retention`.
3. Press `Export Audit Log` first.
4. Keep `180 days` unless you want another period.
5. Press `Purge Older Audit Records`.
6. Type exactly:

`PURGE AUDIT`

Only records older than the chosen retention window are deleted.

## IMPORTANT

This Cleanup tool intentionally does NOT provide casual deletion for:

- legal document versions
- user legal consent records
- Terms acceptance history

Those remain protected records.
