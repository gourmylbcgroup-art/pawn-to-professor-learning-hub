/* Pawn to Professor v1.6.1 — password recovery
   This file intentionally stays separate from app.js to keep the patch small and low-risk. */
(() => {
  const $ = (id) => document.getElementById(id);
  let resetToken = null;
  let legacyRecoveryClient = null;

  function injectStyles() {
    if ($('ptpPasswordRecoveryStyles')) return;
    const style = document.createElement('style');
    style.id = 'ptpPasswordRecoveryStyles';
    style.textContent = `
      .ptp-recovery-link{margin-top:.15rem;width:100%}
      .ptp-recovery-overlay{
        position:fixed; inset:0; z-index:99999; display:grid; place-items:center;
        padding:24px; background:rgba(8,54,42,.92); backdrop-filter:blur(5px);
      }
      .ptp-recovery-card{
        width:min(520px,94vw); padding:26px; border-radius:20px;
        color:#f9f4da; background:rgba(25,107,82,.98);
        border:1px solid rgba(255,255,255,.28);
        box-shadow:0 22px 70px rgba(0,0,0,.34);
        font-family:var(--body-font, Nunito, system-ui, sans-serif);
      }
      .ptp-recovery-kicker{font-weight:900;letter-spacing:.12em;color:#ffd04a;font-size:.76rem}
      .ptp-recovery-card h2{margin:.2rem 0 .45rem;font-family:var(--heading-font,Fredoka,sans-serif);font-size:2rem}
      .ptp-recovery-card p{line-height:1.45;color:rgba(249,244,218,.82)}
      .ptp-recovery-card label{display:grid;gap:.35rem;margin:.8rem 0;font-weight:800}
      .ptp-recovery-card input{
        width:100%;box-sizing:border-box;padding:.82rem .9rem;border-radius:12px;
        border:1px solid rgba(255,255,255,.36);background:#fff;color:#173d32;font:inherit
      }
      .ptp-recovery-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-top:1rem}
      .ptp-recovery-actions .btn{flex:1;min-width:150px}
      .ptp-recovery-status{min-height:1.4em;margin:.7rem 0 0;font-weight:800}
      .ptp-recovery-note{font-size:.82rem}
      .ptp-recovery-success{color:#b8ffd7}
      .ptp-recovery-error{color:#ffd0c9}
    `;
    document.head.appendChild(style);
  }

  function removeOverlay() {
    $('ptpPasswordRecoveryOverlay')?.remove();
  }

  function cleanRecoveryUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('reset_token');
    url.searchParams.delete('password_reset');
    history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
  }

  function setLoginMessage(message) {
    const el = $('loginMessage');
    if (el) el.textContent = message;
  }

  function cardBase(title, intro) {
    removeOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'ptpPasswordRecoveryOverlay';
    overlay.className = 'ptp-recovery-overlay';
    overlay.innerHTML = `
      <section class="ptp-recovery-card" role="dialog" aria-modal="true" aria-labelledby="ptpRecoveryTitle">
        <div class="ptp-recovery-kicker">PAWN TO PROFESSOR</div>
        <h2 id="ptpRecoveryTitle"></h2>
        <p id="ptpRecoveryIntro"></p>
        <div id="ptpRecoveryBody"></div>
      </section>`;
    document.body.appendChild(overlay);
    $('ptpRecoveryTitle').textContent = title;
    $('ptpRecoveryIntro').textContent = intro;
    return $('ptpRecoveryBody');
  }

  function showForgotPassword() {
    const body = cardBase(
      'Forgot your password?',
      'Enter your Pawn to Professor username or your registered contact email.'
    );
    body.innerHTML = `
      <form id="ptpForgotForm">
        <label>
          Username or email
          <input id="ptpForgotIdentifier" autocomplete="username" placeholder="teacher01 or teacher@example.com" required />
        </label>
        <p class="ptp-recovery-note">If the account is eligible, we will send a secure reset link to its registered contact email.</p>
        <div class="ptp-recovery-actions">
          <button id="ptpForgotBack" class="btn btn-ghost" type="button">← Back</button>
          <button class="btn btn-primary" type="submit">Send Reset Email</button>
        </div>
        <p id="ptpForgotStatus" class="ptp-recovery-status" role="status"></p>
      </form>`;

    $('ptpForgotBack').addEventListener('click', removeOverlay);
    $('ptpForgotForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = $('ptpForgotStatus');
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      status.className = 'ptp-recovery-status';
      status.textContent = 'Sending…';
      submit.disabled = true;
      try {
        const res = await fetch('/api/security/request-password-reset', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          cache: 'no-store',
          body: JSON.stringify({ identifier: $('ptpForgotIdentifier').value.trim() })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Password recovery is temporarily unavailable.');
        status.classList.add('ptp-recovery-success');
        status.textContent = data.message || 'If the account matches, a reset email has been sent.';
      } catch (error) {
        status.classList.add('ptp-recovery-error');
        status.textContent = error.message || 'Password recovery is temporarily unavailable.';
      } finally {
        submit.disabled = false;
      }
    });
  }

  function showResetPassword({ token = null, legacy = false } = {}) {
    resetToken = token;
    const body = cardBase(
      'Create a new password',
      'Choose a new password for your Pawn to Professor account.'
    );
    body.innerHTML = `
      <form id="ptpResetForm">
        <label>
          New password
          <input id="ptpResetPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Minimum 8 characters" required />
        </label>
        <label>
          Confirm new password
          <input id="ptpResetPassword2" type="password" minlength="8" maxlength="128" autocomplete="new-password" placeholder="Repeat new password" required />
        </label>
        <p class="ptp-recovery-note">After changing the password, sign in again. If trusted-device security is enabled, the next login may also ask for your 6-digit device code.</p>
        <div class="ptp-recovery-actions">
          <button id="ptpResetCancel" class="btn btn-ghost" type="button">Cancel</button>
          <button class="btn btn-primary" type="submit">Save New Password</button>
        </div>
        <p id="ptpResetStatus" class="ptp-recovery-status" role="status"></p>
      </form>`;

    $('ptpResetCancel').addEventListener('click', () => {
      cleanRecoveryUrl();
      removeOverlay();
    });

    $('ptpResetForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = $('ptpResetPassword').value;
      const confirm = $('ptpResetPassword2').value;
      const status = $('ptpResetStatus');
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      status.className = 'ptp-recovery-status';

      if (password.length < 8) {
        status.classList.add('ptp-recovery-error');
        status.textContent = 'Use at least 8 characters.';
        return;
      }
      if (password !== confirm) {
        status.classList.add('ptp-recovery-error');
        status.textContent = 'The two passwords do not match.';
        return;
      }

      status.textContent = 'Saving your new password…';
      submit.disabled = true;
      try {
        if (legacy) {
          if (!legacyRecoveryClient) throw new Error('Recovery session is not ready. Request a new reset email.');
          const { error } = await legacyRecoveryClient.auth.updateUser({ password });
          if (error) throw error;
          await legacyRecoveryClient.auth.signOut({ scope:'local' }).catch(() => {});
        } else {
          const res = await fetch('/api/security/reset-password', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            cache: 'no-store',
            body: JSON.stringify({ token: resetToken, password })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'This reset link is invalid or expired.');
        }

        cleanRecoveryUrl();
        removeOverlay();
        setLoginMessage('Password changed successfully. Sign in with your new password.');
        const passwordInput = $('loginPassword');
        if (passwordInput) passwordInput.value = '';
      } catch (error) {
        status.classList.add('ptp-recovery-error');
        status.textContent = error.message || 'The password could not be changed.';
      } finally {
        submit.disabled = false;
      }
    });
  }

  async function maybeHandleLegacySupabaseRecovery() {
    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const looksLikeRecovery = /type=recovery/i.test(hash) || /[?&]type=recovery(?:&|$)/i.test(search);
    if (!looksLikeRecovery || !window.supabase) return false;

    try {
      const cfgRes = await fetch('/api/config', {cache:'no-store'});
      if (!cfgRes.ok) return false;
      const cfg = await cfgRes.json();
      legacyRecoveryClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
      });

      const { data } = await legacyRecoveryClient.auth.getSession();
      if (data?.session) {
        showResetPassword({ legacy:true });
        return true;
      }

      legacyRecoveryClient.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') showResetPassword({ legacy:true });
      });
    } catch {
      return false;
    }
    return false;
  }

  function installForgotButton() {
    const loginForm = $('loginForm');
    if (!loginForm || $('ptpForgotPasswordBtn')) return;
    const button = document.createElement('button');
    button.id = 'ptpForgotPasswordBtn';
    button.type = 'button';
    button.className = 'btn btn-ghost ptp-recovery-link';
    button.textContent = 'Forgot password?';
    const message = $('loginMessage');
    loginForm.insertBefore(button, message || null);
    button.addEventListener('click', showForgotPassword);
  }

  async function start() {
    injectStyles();
    installForgotButton();

    const params = new URLSearchParams(window.location.search);
    const customToken = params.get('reset_token');
    if (customToken) {
      showResetPassword({ token: customToken, legacy:false });
      return;
    }

    if (params.get('password_reset') === 'success') {
      cleanRecoveryUrl();
      setLoginMessage('Password changed successfully. Sign in with your new password.');
    }

    await maybeHandleLegacySupabaseRecovery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
