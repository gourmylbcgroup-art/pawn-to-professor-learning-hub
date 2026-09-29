# Pawn to Professor v1.9.8h — Mailbox Home + Quick Delete

This is a small UI follow-up to v1.9.8g.

## Adds

### Admin / Owner home
A new tile appears on the main home screen:

- 📨 Messages
- unread count when there are unread messages

Clicking it opens Admin → Messages directly.

### Admin → Messages list
Each conversation now has a separate:

- 🗑 Delete

button beside the conversation row.

Deleting a conversation requires typing `DELETE`.

Individual message deletion remains inside the opened conversation from v1.9.8g.

## No SQL required

This patch reuses:
- `api/mailbox-admin-v1.9.8g.js`
- the existing support_threads / support_messages database tables.

## Install

1. Upload `mailbox-ui-v1.9.8h.js` to the repository ROOT.
2. Replace your current `index.html` with the included `index.html`.
3. Commit.
4. Wait for Vercel → Ready.
5. Hard refresh:
   Mac: Command + Shift + R
   Windows: Ctrl + F5
