# Pawn to Professor v1.9.8g — Mailbox Repair

## Fixes

- Reliable **📨 Messages** tab in Admin.
- **Message User** and **Open Mailbox** inside Admin → Users & Access.
- Admin can message Teachers/Learners.
- Teachers/Learners remain limited to Admin-only messaging.
- Admin/Owner can permanently delete an individual message.
- Admin/Owner can permanently delete an entire conversation.
- Fixes the misleading situation where a message was delivered but the UI later showed an error.
- Send buttons are disabled during transmission to reduce duplicate messages.
- Existing Sent / Delivered / Read receipts remain.

## Why the old send could show an error after delivery

The old UI performed:
1. send message
2. refresh/render mailbox

inside one error handler.

If step 1 succeeded but step 2 failed, the UI could report an error even though the member already received the message.

v1.9.8g separates delivery success from UI refresh.

## Files

- `api/mailbox-admin-v1.9.8g.js`
- `mailbox-repair-v1.9.8g.js`

## Install

1. Upload `mailbox-admin-v1.9.8g.js` to the repository folder:
   `api/`

2. Upload `mailbox-repair-v1.9.8g.js` to the repository ROOT.

3. Open `index.html`.

4. Add this as the LAST script before `</body>`:

```html
<script src="./mailbox-repair-v1.9.8g.js" defer></script>
```

It should be after:
- `member-mailbox.js`
- `payments-accounting.js`
- `activity-experience-v1.9.8.js`
- `admin-menu-v1.9.8.js`
- any performance patch you installed

5. Commit and wait for Vercel Production → Ready.

6. Hard refresh:
   Mac: `Command + Shift + R`
   Windows: `Ctrl + F5`

## Test checklist

### Admin menu
- Admin → **📨 Messages** is visible.

### Users & Access
- Select a Teacher or Learner.
- You should see:
  - **📨 Message [name]**
  - **📬 Open Mailbox**

### Send
- Send one message.
- Recipient receives it.
- UI shows success.
- A mailbox refresh problem must NOT be reported as a failed delivery.

### Delete one message
- Open conversation.
- Click **🗑 Delete Message**.
- Confirm.

### Delete conversation
- Click **🗑 Delete Conversation**.
- Type `DELETE`.
- The conversation and all messages are permanently removed.

## No SQL required

The existing database already uses:
`support_messages.thread_id → support_threads.id ON DELETE CASCADE`

so deleting a thread automatically deletes its messages.
