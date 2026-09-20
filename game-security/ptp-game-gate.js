/*
  Pawn to Professor Secure Game Gate v1.3
  Put this file in EACH protected game's repository and load it as the FIRST script in <head>.

  IMPORTANT: Set TRUSTED_HUB to your real Learning Hub origin.
  Example: https://pawn-to-professor-learning-hub.vercel.app
  Later, if you use a custom domain, change it to https://learn.pawntoprofessor.com
*/
(() => {
  'use strict';

  const TRUSTED_HUB = 'https://pawn-to-professor-learning-hub.vercel.app';
  const params = new URLSearchParams(location.search);
  const token = params.get('ptp_token');
  const activityId = params.get('ptp_activity');

  const style = document.createElement('style');
  style.id = 'ptp-security-style';
  style.textContent = `
    html.ptp-checking body > * { visibility:hidden !important; }
    #ptp-security-screen { position:fixed; inset:0; z-index:2147483647; display:grid; place-items:center;
      background:#0b4b39; color:white; font-family:system-ui,-apple-system,Segoe UI,sans-serif; text-align:center; padding:24px; }
    #ptp-security-screen .ptp-box { max-width:560px; }
    #ptp-security-screen strong { display:block; font-size:clamp(22px,4vw,38px); margin:.35em 0; }
    #ptp-security-screen p { opacity:.86; line-height:1.5; }
    #ptp-security-screen a { display:inline-block; margin-top:12px; padding:12px 18px; border-radius:999px;
      background:#ffd04a; color:#173c31; text-decoration:none; font-weight:900; }
  `;
  document.documentElement.classList.add('ptp-checking');
  document.head.appendChild(style);

  function screen(title, message, allowLink = true) {
    document.getElementById('ptp-security-screen')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'ptp-security-screen';
    wrap.innerHTML = `<div class="ptp-box"><div style="font-size:48px">🔒</div><strong>${title}</strong><p>${message}</p>${allowLink ? `<a href="${TRUSTED_HUB}">Open Learning Hub</a>` : ''}</div>`;
    document.documentElement.appendChild(wrap);
  }

  screen('Checking access…', 'This protected activity must be launched from Pawn to Professor Learning Hub.', false);

  if (!token || !activityId) {
    screen('Protected activity', 'Please launch this game from your authorized Learning Hub account.');
    return;
  }

  fetch(`${TRUSTED_HUB}/api/game/validate-launch`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ token, activityId }),
    cache:'no-store'
  })
    .then(async res => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || 'Access denied');

      // Remove the short-lived token from the game iframe's own URL after validation.
      const clean = new URL(location.href);
      clean.searchParams.delete('ptp_token');
      clean.searchParams.delete('ptp_activity');
      history.replaceState(null, '', clean.pathname + clean.search + clean.hash);

      document.getElementById('ptp-security-screen')?.remove();
      document.documentElement.classList.remove('ptp-checking');
      style.remove();
      window.dispatchEvent(new CustomEvent('ptp:access-granted', { detail: { expiresAt: body.expiresAt } }));
    })
    .catch(() => {
      screen('Access expired or denied', 'Return to Pawn to Professor Learning Hub and press PLAY again.');
    });
})();
