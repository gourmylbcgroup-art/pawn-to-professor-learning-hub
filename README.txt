Pawn to Professor v1.9.6a
VERCEL FREE 12-FUNCTION FIX

NO SQL.

ADD:
- api/_lib/mailbox-actions.js

REPLACE:
- member-mailbox.js

EDIT:
- api/security.js
  Add one import + two switch cases.
  Exact snippet is in SECURITY-EDIT-SNIPPET.txt.

DELETE:
- api/support/message.js
- api/admin/approve-registration.js

Result:
14 API endpoint files -> 12 API endpoint files.

All v1.9.6 mailbox, welcome, trial, email and access-contact features remain.
