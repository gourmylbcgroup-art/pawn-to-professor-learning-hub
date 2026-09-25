# Pawn to Professor Learning Hub v1.6

v1.6 adds three practical features without changing the existing Year → Grade → Unit access model:

1. **One trusted browser/device per normal member**
2. **iCloud/file-link Resources inside Units**
3. **Optional email notifications when new Games, Units or Resources are published**

## Trusted-device rule

- Owner and Admin are exempt.
- Normal members can have **one trusted browser/device at a time**.
- A new browser/device triggers a 6-digit code sent to the member's real `contact_email`.
- Verifying the new device replaces the previous trusted device.
- The previous portal session is detected by a 30-second heartbeat and signed out; secure Game and Resource endpoints reject the old session immediately.
- Same trusted browser with a changed IP remains allowed. The IP is stored only as a one-way hash.
- Clearing browser storage, using Incognito, changing browser, or changing browser profile can count as a new device.

## Resources

Admin can add an iCloud or other file-share link to a Unit as:

- PDF
- Flashcards
- Worksheet
- Teacher Guide
- Audio
- ZIP
- Other

The raw file URL is kept in a protected `resource_targets` table. Members see only OPEN/DOWNLOAD buttons after Unit access is checked.

**Important:** an iCloud “Anyone with the Link” URL can still be copied after the member opens it. v1.6 controls who sees/opens it from the Learning Hub; it is not DRM for iCloud.

## Email notifications

When publishing a Game, Resource or new Unit, Admin can optionally email only normal members who effectively have access to that Unit (direct Unit permission or Dynamic Access Group).

Emails link back to the Learning Hub. They do not include the private Game/file URL.

## Required email provider

v1.6 uses Resend through server-side Vercel functions. Configure:

- `RESEND_API_KEY`
- `EMAIL_FROM`
- `PORTAL_BASE_URL`
- optional `DEVICE_CODE_SECRET`

Device security and content notifications default **OFF** in the database migration so you can configure/test email before enabling them.

Read `SETUP-v1.6.md` before installing.
