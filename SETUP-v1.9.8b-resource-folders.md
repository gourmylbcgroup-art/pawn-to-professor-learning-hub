# Pawn to Professor v1.9.8b — Resource Folder Browser

This is a **UI-only compatibility patch** for the current Resources screen.

## What it adds
- Year folders
- Grade folders
- Unit folders
- Search within the selected Unit
- Resource type filter
- File-type icons in the existing resource list

## What it does NOT change
- Supabase tables
- resource security
- iCloud/file links
- OPEN/DOWNLOAD resolver
- Activities
- How to Play / How to Use guide attachment
- Payments
- Messaging
- Device security

## Install
1. In the Learning Hub repository, back up the current `app.js`.
2. Replace `app.js` with `app-v1.9.8b-resource-folders.js`.
3. Rename the replacement file to exactly `app.js`.
4. Commit/deploy.
5. Wait for Vercel Production → Ready.
6. Hard refresh on Mac: `Command + Shift + R`.
7. Open Admin → Resources.

No SQL is required.
