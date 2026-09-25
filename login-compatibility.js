/* Pawn to Professor v1.6.4 — username compatibility login
   Allows a teacher to type their Pawn to Professor username even if their
   older Supabase Auth account uses a real email instead of @portal.local. */
(() => {
  const form = document.getElementById('loginForm');
  const identifierInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const message = document.getElementById('loginMessage');

  if (!form || !identifierInput || !passwordInput || !message) return;

  form.addEventListener('submit', async (event) => {
    // Capture phase: replace the older browser-side username@portal.local
    // conversion before app.js receives this submit event.
    event.preventDefault();
    event.stopImmediatePropagation();

    const identifier = String(identifierInput.value || '').trim();
    const password = String(passwordInput.value || '');

    if (!identifier || !password) {
      message.textContent = 'Enter your username and password.';
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    message.textContent = 'Signing in…';

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ identifier, password })
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok || !body?.session?.access_token || !body?.session?.refresh_token) {
        message.textContent = body.error || 'Username or password is not correct.';
        return;
      }

      const { data, error } = await state.client.auth.setSession({
        access_token: body.session.access_token,
        refresh_token: body.session.refresh_token
      });

      if (error || !data?.session) {
        message.textContent = 'Username or password is not correct.';
        return;
      }

      state.session = data.session;
      message.textContent = '';

      // Existing security flow stays unchanged:
      // normal members now continue to the trusted-device check.
      await completeMemberLogin();
    } catch (error) {
      message.textContent = 'Could not sign in. Please try again.';
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }, true);
})();
