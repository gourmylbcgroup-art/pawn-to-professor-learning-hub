/* Pawn to Professor v1.6.5
   Trusted-device auto-open fix.
   Loaded AFTER app.js. After a successful device verification, open the
   classroom directly instead of running a second login-security round trip. */
(() => {
  const form = document.getElementById('deviceVerifyForm');
  if (!form) return;

  const message = document.getElementById('deviceVerifyMessage');
  const errorBox = document.getElementById('deviceVerifyError');
  const codeInput = document.getElementById('deviceVerifyCode');

  function setVisibleStatus(text, isError = false) {
    if (message) {
      message.textContent = text;
      message.style.color = isError ? '#ffd0c9' : '';
      message.style.fontWeight = isError ? '800' : '';
    }
    if (errorBox) {
      errorBox.textContent = isError ? text : '';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const submitButton = form.querySelector('button[type="submit"]');

    if (!state?.pendingDeviceChallenge?.id) {
      setVisibleStatus(
        'Your verification session is no longer available. Please go back and sign in again.',
        true
      );
      return;
    }

    const code = String(codeInput?.value || '').trim();
    if (!/^\d{6}$/.test(code)) {
      setVisibleStatus('Please enter the 6-digit code from your email.', true);
      codeInput?.focus();
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Checking…';
    }
    setVisibleStatus('Checking your verification code…');

    try {
      const headers = await authHeaders();

      const response = await fetch('/api/security/verify-device', {
        method: 'POST',
        headers,
        cache: 'no-store',
        body: JSON.stringify({
          challengeId: state.pendingDeviceChallenge.id,
          code,
          deviceId: getOrCreateDeviceId(),
          deviceLabel: getDeviceLabel()
        })
      });

      const raw = await response.text();
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = {};
      }

      if (!response.ok) {
        const detail =
          body.error ||
          raw ||
          `Verification failed (${response.status}).`;
        throw new Error(detail);
      }

      state.pendingDeviceChallenge = null;
      setVisibleStatus('✅ Device verified. Opening your classroom…');

      /*
       * Important v1.6.5 change:
       * verify-device already saved this exact session + device as trusted.
       * Running completeMemberLogin() again created a second security round trip
       * and could leave the UI waiting until a manual refresh.
       *
       * Go straight into the portal now. The normal 30-second security monitor
       * still enforces the one-device rule afterwards.
       */
      await enterPortal();

      /*
       * Best-effort cleanup of other Supabase sessions.
       * Do not await it, because opening the classroom must not depend on this call.
       */
      state.client?.auth?.signOut?.({ scope: 'others' }).catch(() => {});
    } catch (error) {
      setVisibleStatus(
        `⚠️ ${error?.message || 'Verification failed. Please try again.'}`,
        true
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Verify Device';
      }
    }
  }, true);
})();
