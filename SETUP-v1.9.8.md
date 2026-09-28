# Pawn to Professor v1.9.8
## Activity Guides + Launch Navigation + Message Receipts + Admin Messaging + Menu Order

This patch deliberately leaves the fixed v1.9.7b Payments code alone.

### New features

1. Games can have a secure downloadable **HOW TO PLAY** guide.
2. Interactive Lessons / Practice Activities can have a secure downloadable **HOW TO USE** guide.
3. Activity types are simplified to:
   - Game
   - Interactive Lesson
   - Practice Activity
4. The secure activity player now has:
   - Back
   - Home
   - How to Play / How to Use when a guide exists
   - Hide
5. The green player navigation bar:
   - appears when the activity loads
   - auto-hides after about 4 seconds
   - leaves a small `▼ MENU` tab
   - reappears when the tab is tapped
   - on desktop, moving the pointer to the very top also reveals it
6. Private messages now show:
   - ✓ Sent
   - ✓✓ Delivered
   - ✓✓ Read by Admin / Read by Member + timestamp
7. Admin can send private messages to:
   - one member
   - several selected members
   - all Teachers
   - all Learners
   - all Members
8. Group sends create a separate private copy for each member.
9. Admin can optionally email each recipient.
10. Admin menu is reordered by practical use.

---

# STEP 1 — Supabase SQL

Run:

`supabase/v1.9.8-guides-receipts-admin-messaging.sql`

Expected:

`Success. No rows returned`

This adds:
- `activities.guide_resource_id`
- support-message Delivered / Read receipt fields

It does NOT alter payment/accounting tables.

---

# STEP 2 — GitHub

## ADD

- `activity-experience-v1.9.8.js`
- `admin-menu-v1.9.8.js`
- `v1.9.8.css`
- `supabase/v1.9.8-guides-receipts-admin-messaging.sql`

## REPLACE

- `member-mailbox.js`
- `api/_lib/mailbox-actions.js`
- `api/game/create-launch.js`
- `play.html`
- `play.js`
- `play.css`
- `index.html`

## DO NOT CHANGE

- `payments-accounting.js`
- `payments-accounting.css`
- payment SQL
- `api/_lib/payment-actions.js`
- `api/security.js`

No new Vercel endpoint is added, so this does not increase the Vercel function count.

Suggested commit:

`v1.9.8 guides receipts admin messaging`

Wait for:

`Vercel → Production → Ready`

Then on Mac:

`Command + Shift + R`

---

# USING HOW TO PLAY / HOW TO USE

## 1. Upload the guide first

Go to:

`Admin → Resources`

Upload/publish the guide as a Resource.

Recommended:
- Type: Teacher Guide or PDF
- Audience: Members with Unit access
- Download: ON

## 2. Attach it to the activity

Go to:

`Admin → Activities`

For a NEW activity:
- choose Game / Interactive Lesson / Practice Activity
- choose the guide in `How to Play / How to Use guide`

For an EXISTING activity:
- find the activity
- click `📘 Type / Guide`
- choose the type
- choose the guide
- Save

## 3. Member view

Game:
- PLAY
- HOW TO PLAY
- Discuss

Interactive Lesson:
- START
- HOW TO USE
- Discuss

Practice Activity:
- PRACTICE
- HOW TO USE
- Discuss

The guide download still uses the existing secure Resource resolver and Unit-access check.

---

# ACTIVITY PLAYER

When the user starts an activity:

`← Back   🏠 Home   📘 How to Play/Use   ▲ Hide`

The green bar appears initially.

After approximately 4 seconds it hides to maximize activity space.

A small top tab remains:

`▼ MENU`

Tap/click it to show the bar again.

Desktop:
moving the pointer to the top edge also brings the bar back.

`Home` always returns to the Learning Hub home page.

---

# MESSAGE RECEIPTS

For a message you sent:

Before the recipient opens it:

`✓✓ Delivered`

After the recipient opens the conversation:

Teacher/Learner sees:

`✓✓ Read by Admin · [time]`

Admin sees:

`✓✓ Read by Member · [time]`

`Sent` means the message was stored successfully.
`Delivered` means it is available in the recipient's private in-site mailbox.
`Read` means the recipient actually opened the conversation.

Email delivery remains separate from in-site read receipts.

---

# ADMIN SEND MESSAGE

Go to:

`Admin → 📨 Messages → + New Message`

Choose:

- One member
- Several selected members
- All Teachers
- All Learners
- All Members

Each recipient receives a separate private message.

Members cannot see the other recipients.

Before sending to more than one person, Admin gets a confirmation showing the recipient count.

The result reports:
- mailbox deliveries
- emails sent
- email failures

---

# ADMIN MENU ORDER

The menu is automatically arranged:

1. Dashboard
2. Messages
3. Payments
4. Requests
5. Users & Access
6. Activities
7. Resources
8. Content Structure
9. Community
10. Access Groups
11. Access Packages
12. Teacher Tools
13. Legal & Registration
14. Design Studio
15. Settings
16. System Health
17. Audit Log
18. Cleanup

Payments are only reordered visually. The working v1.9.7b payment code is not modified.
