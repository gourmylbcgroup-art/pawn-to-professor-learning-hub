/* Pawn to Professor v1.6.3
   Trusted-device verification reliability patch.
   Loaded AFTER app.js. It intercepts the device verification form before the
   older submit handler and provides visible status + robust retry behavior. */
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
      // Keep the lower error area in sync too, even if the board is small.
      errorBox.textContent = isError ? text : '';
    }
  }

  form.addEventListener('submit', async (event) => {
    // Run before the older app.js submit listener.
    event.preventDefault();
    event.stopImmediatePropagation();

    const submitButton = form.querySelector('button[type="submit"]');

    if (!state?.pendingDeviceChallenge?.id) {
      setVisibleStatus('Your verification session is no longer available. Please go back and sign in again.', true);
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
        const detail = body.error || raw || `Verification failed (${response.status}).`;
        throw new Error(detail);
      }

      setVisibleStatus('✅ Device verified. Opening your classroom…');
      state.pendingDeviceChallenge = null;

      // Re-run the normal login security check. The device should now be trusted.
      // This keeps the existing one-device/session logic intact.
      await completeMemberLogin();
    } catch (error) {
      setVisibleStatus(`⚠️ ${error?.message || 'Verification failed. Please try again.'}`, true);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Verify Device';
      }
    }
  }, true);
})();
