# Pawn to Professor v1.9.6a — Vercel Free 12-Function Fix

## Why the deployment failed

Your last successful deployment had exactly 12 Vercel API functions.

v1.9.6 added two new endpoint files:

- `api/support/message.js`
- `api/admin/approve-registration.js`

That raised the endpoint count from 12 to 14.

This fix keeps ALL v1.9.6 mailbox/welcome/trial functionality but moves those
two handlers into a shared library used by the EXISTING `api/security.js`
function.

Final Vercel API function count: 12.

## IMPORTANT

NO SQL is needed for v1.9.6a.

If you already ran the v1.9.6 mailbox SQL successfully, leave it exactly as it is.

Do NOT run it again just to fix Vercel.

---

# EASIEST INSTALLATION — GitHub web interface

## STEP 1 — Add one shared-library file

Upload:

`api/_lib/mailbox-actions.js`

Be sure it goes exactly here:

`api`
→ `_lib`
→ `mailbox-actions.js`

This is a library file, NOT a Vercel endpoint.

## STEP 2 — Replace member-mailbox.js

Replace your current root file:

`member-mailbox.js`

with the v1.9.6a version included in this patch.

The only routing change is:

Old:
`/api/support/message`

New:
`/api/security?action=support-message`

and:

Old:
`/api/admin/approve-registration`

New:
`/api/security?action=approve-registration`

## STEP 3 — Edit api/security.js

Open:

`api/security.js`

### At the top, after:

```js
import { emailConfigured, sendEmail } from './_lib/email.js';
```

add:

```js
import { handleSupportMessage, handleApproveRegistration } from './_lib/mailbox-actions.js';
```

### Near the bottom, inside:

```js
switch (action) {
```

find:

```js
case 'reset-password':
  return resetPassword({ req, res, admin });
```

Immediately AFTER it add:

```js
case 'support-message':
  return handleSupportMessage({ req, res, admin });

case 'approve-registration':
  return handleApproveRegistration({ req, res, admin });
```

Do not remove any existing security cases.

## STEP 4 — DELETE the two extra endpoint files

Delete from GitHub:

`api/support/message.js`

and:

`api/admin/approve-registration.js`

These two deletions are essential. If they remain, Vercel still counts them as
two separate functions and the Hobby deployment can still fail.

You may leave the now-empty `api/support` folder or remove the empty folder.
Git itself will not preserve an empty folder anyway.

## STEP 5 — Commit

Suggested commit message:

`v1.9.6a Vercel 12 function fix`

## STEP 6 — Vercel

Open:

Vercel → Deployments

Wait for the NEW deployment.

Expected:

`Ready`

not:

`Error`

## STEP 7 — Hard refresh

Mac:
`Command + Shift + R`

Windows:
`Ctrl + F5`

---

# WHAT DOES NOT CHANGE

v1.9.6a keeps:

- private My Messages
- Admin Messages inbox
- unread badges
- Stéphane Admin email notifications
- all active Admin/Owner email notifications
- member email when Admin replies
- automatic private welcome on approval
- editable Teacher welcome text
- editable Learner welcome text
- 7-day trial
- locked-content Contact Admin
- post-trial Contact Admin
- Access / Payment pre-filled messages
- workflow statuses
- Community
- Learner Topic-only view
- Legal & Registration
- Cleanup Center
- device security
- password reset

It only changes WHERE the two mailbox server actions run.

---

# OPTIONAL AUTOMATIC METHOD

If you work from a local clone of the GitHub repository, this patch also
contains:

`apply-v1.9.6a.js`

Put it at the repository root together with the new
`api/_lib/mailbox-actions.js`, then run:

`node apply-v1.9.6a.js`

It automatically:

- edits api/security.js
- rewrites member-mailbox.js
- deletes the two extra endpoint files

For GitHub web editing, follow Steps 1–4 above instead.
