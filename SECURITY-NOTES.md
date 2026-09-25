# v1.6 Security Notes

## What the one-device rule guarantees in normal use

For normal members, a new trusted browser/device replaces the previous one. Secure Game launches and Resource opens verify the current trusted session server-side. The portal also performs a session heartbeat every 30 seconds.

## Supabase access-token limitation

Revoking other Supabase sessions removes their refresh tokens, but an already-issued JWT can remain cryptographically valid until its normal expiry. v1.6 therefore also stores the currently authorized `session_id` and checks it on the sensitive Game/Resource endpoints. The old Learning Hub UI is signed out by the heartbeat.

## Not device fingerprinting

v1.6 deliberately does not create an invasive hardware/browser fingerprint. It stores a random local browser ID. This is simpler, more privacy-preserving and less likely to lock legitimate teachers out.

## iCloud links

An iCloud public share URL can be copied after opening it. Use the Learning Hub to control who receives the button, but do not treat an `Anyone with the Link` iCloud URL as DRM.
