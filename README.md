# Pawn to Professor Learning Hub v1.4

v1.4 focuses on **commercial access reliability**, **automatic paid-member access**, and a moderated **Community Forum**.

## Main changes

- Admin and Owner now have automatic full access to every Year, Grade, Unit and Game.
- Fixes the staff-access loading race that could incorrectly show locked Units.
- Dynamic **Access Groups** for paid plans:
  - Entire Learning Hub
  - One Year, including future Grades/Units
  - One Grade, including future Units
  - One specific Unit
- New games inside an already-authorized Unit become available automatically.
- Staff can preview a user's effective access before testing the account.
- Community Forum:
  - Announcements
  - Help & Questions
  - Teaching Ideas
  - Game Feedback
  - Grade Discussions
  - Technical Support
- Owner/Admin moderation: pin, lock, remove topics/replies, enable/disable categories.
- Community can be enabled or disabled from Admin > Settings.
- Secure-game status now tracks whether the Direct Game Gate has been installed.
- Secure launcher now honors Dynamic Access Groups server-side.
- Backups include Access Groups and Community data.

## Important

This package assumes that v1.3 is already installed. Run only:

`supabase/v1.4-smart-access-community.sql`

Do **not** rerun the original `schema.sql`.

See `SETUP-v1.4.md` for the complete installation and testing procedure.
