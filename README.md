# Pawn to Professor Learning Hub v1.5

**Performance & Reliability update** for the existing v1.4 / v1.4.1 Learning Hub.

This release deliberately avoids adding major new product features. It focuses on keeping the existing portal responsive and easier to diagnose as the number of teachers, games and Community posts grows.

## Main changes

- Database indexes for the queries used most often by the portal.
- Server-side rate limiting for public registration, Admin user creation and secure game launch requests.
- Community anti-spam write limits.
- Forum topic pagination: 20 discussions per page.
- Forum reply pagination: 30 replies per page.
- Admin user search and 25-account pages so the board does not try to render every account at once.
- Owner/Admin **System Health** page with database latency and basic service counts.
- Automatic cleanup of stale rate-limit rows and old launch tokens during health checks.
- Improved caching for static classroom assets.
- Includes the v1.4.1 fast secure-player files.

## Important

This package assumes **v1.4 is already installed**. Run only:

`supabase/v1.5-performance-reliability.sql`

Do not rerun the original `schema.sql` or older migrations.

No new Vercel environment variables are required.

Read `SETUP-v1.5.md` before uploading the files.
