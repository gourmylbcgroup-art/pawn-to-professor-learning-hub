/* Pawn to Professor v1.6.6
   Trusted-device auto-open display fix.
   The device was being verified correctly, but the verification view stayed
   visible while the portal was opened underneath it. Because board-shell uses
   overflow:hidden, the portal looked stuck until a manual refresh. */
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
       * v1.6.6 critical fix:
       * enterPortal() hides loading/login/register views, but it does NOT hide
       * deviceVerifyView. That left this full-height verification page visible
       * in front of the portal. A browser refresh worked because the verification
       * view starts hidden on a fresh page load.
       *
       * Hide it BEFORE opening the portal.
       */
      hide(els.deviceVerifyView);

      try {
        await enterPortal();
      } catch (portalError) {
        // If portal loading itself fails, restore this view and show the real error.
        show(els.deviceVerifyView);
        throw portalError;
      }

      // Best-effort cleanup of other Supabase sessions.
      // Do not block portal opening on this background action.
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
