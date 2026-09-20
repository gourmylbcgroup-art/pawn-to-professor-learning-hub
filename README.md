# Pawn to Professor Learning Hub v1.3 — Secure Game Launcher

This update builds on v1.2 and adds protected game launching.

Main idea: members click **PLAY 🔐** in the Learning Hub. The browser stays on the Learning Hub player URL, the server checks account + unit permission, and only then issues a short-lived launch token to the game.

## Included
- `play.html`, `play.js`, `play.css` — secure branded player
- `api/game/create-launch.js` — server-side access check + short-lived token
- `api/game/validate-launch.js` — validates the token for protected games
- `supabase/v1.3-secure-game-launcher.sql` — phase 1 database migration
- `supabase/v1.3-finalize-hide-legacy-urls.sql` — removes old public URL values after testing
- `game-security/ptp-game-gate.js` — reusable gate to copy into each paid HTML5 game
- Updated Admin Activities manager with `Public`, `Members`, and `Unit Protected` security modes

Read `SETUP-v1.3.md` before installing.
