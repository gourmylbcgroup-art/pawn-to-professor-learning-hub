# Pawn to Professor Learning Hub v1.6.1 — Password Recovery

Small patch for the existing v1.6 Learning Hub.

Adds a secure self-service **Forgot password?** flow using the member's real `profiles.contact_email`.

Install in this order:

1. Run `supabase/v1.6.1-password-recovery.sql`
2. Replace `index.html`
3. Add `password-recovery.js`
4. Add the two API files in `api/security/`
5. Deploy through Vercel
6. Test with one normal member

See `SETUP-v1.6.1.md` for the complete instructions.
