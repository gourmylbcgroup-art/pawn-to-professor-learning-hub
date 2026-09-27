#!/usr/bin/env node
/*
Pawn to Professor v1.9.6a
Patches the CURRENT api/security.js in-place.

Usage from repository root:
  node apply-v1.9.6a.js

It:
- adds the mailbox shared-library import
- adds support-message + approve-registration cases to api/security.js
- rewrites member-mailbox.js to call api/security
- deletes the two extra Vercel endpoint files
*/

import fs from 'node:fs';

const securityPath = 'api/security.js';
const mailboxPath = 'member-mailbox.js';

if (!fs.existsSync(securityPath)) {
  throw new Error('api/security.js not found. Run this from the repository root.');
}
if (!fs.existsSync(mailboxPath)) {
  throw new Error('member-mailbox.js not found. Install v1.9.6 files first.');
}

let security = fs.readFileSync(securityPath, 'utf8');

const importLine =
  "import { handleSupportMessage, handleApproveRegistration } from './_lib/mailbox-actions.js';";

if (!security.includes(importLine)) {
  const anchor = "import { emailConfigured, sendEmail } from './_lib/email.js';";
  if (!security.includes(anchor)) {
    throw new Error('Could not find the expected email import in api/security.js.');
  }
  security = security.replace(anchor, `${anchor}\n${importLine}`);
}

if (!security.includes("case 'support-message':")) {
  const anchor = "    case 'reset-password':\n      return resetPassword({ req, res, admin });";
  if (!security.includes(anchor)) {
    throw new Error('Could not find the reset-password switch case in api/security.js.');
  }
  security = security.replace(
    anchor,
    `${anchor}
    case 'support-message':
      return handleSupportMessage({ req, res, admin });
    case 'approve-registration':
      return handleApproveRegistration({ req, res, admin });`
  );
}

fs.writeFileSync(securityPath, security);

let mailbox = fs.readFileSync(mailboxPath, 'utf8');

mailbox = mailbox.replaceAll(
  "fetch('/api/support/message', {",
  "fetch('/api/security?action=support-message', {"
);

mailbox = mailbox.replaceAll(
  "fetch('/api/admin/approve-registration', {",
  "fetch('/api/security?action=approve-registration', {"
);

fs.writeFileSync(mailboxPath, mailbox);

for (const extra of [
  'api/support/message.js',
  'api/admin/approve-registration.js'
]) {
  if (fs.existsSync(extra)) fs.unlinkSync(extra);
}

console.log('v1.9.6a applied successfully.');
console.log('Deleted extra endpoints and returned the project to 12 Vercel functions.');
