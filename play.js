/* global supabase */
const statusEl = document.getElementById('status');
const frame = document.getElementById('gameFrame');
const titleEl = document.getElementById('playerTitle');
const retryBtn = document.getElementById('retryBtn');

document.getElementById('backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back(); else location.href = '/';
});
retryBtn.addEventListener('click', () => start());

function showError(message) {
  frame.classList.add('hidden');
  statusEl.classList.remove('hidden');
  statusEl.classList.add('error');
  statusEl.innerHTML = `<div style="font-size:2rem">🔒</div><strong>Access not available</strong><span>${escapeHtml(message)}</span>`;
  retryBtn.classList.remove('hidden');
}
function escapeHtml(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function start() {
  retryBtn.classList.add('hidden');
  statusEl.className = 'status-card';
  statusEl.innerHTML = '<div class="spinner" aria-hidden="true"></div><strong>Checking your access…</strong><span>This secure link only works for an authorized account.</span>';
  statusEl.classList.remove('hidden');
  frame.classList.add('hidden');

  const activityId = new URLSearchParams(location.search).get('activity');
  if (!activityId) return showError('This activity link is incomplete.');

  try {
    const cfgRes = await fetch('/api/config', { cache: 'no-store' });
    if (!cfgRes.ok) throw new Error('Portal configuration is unavailable.');
    const cfg = await cfgRes.json();
    const client = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token || '';

    const headers = { 'Content-Type':'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const launchRes = await fetch('/api/game/create-launch', {
      method:'POST', headers, cache:'no-store', body:JSON.stringify({ activityId })
    });
    const body = await launchRes.json().catch(() => ({}));
    if (!launchRes.ok) throw new Error(body.error || 'Access was denied.');

    titleEl.textContent = body.title || 'Learning Activity';
    frame.src = body.embedUrl;
    frame.onload = () => {
      statusEl.classList.add('hidden');
      frame.classList.remove('hidden');
    };
    // If the target blocks iframe embedding, the frame may stay blank. The setup guide explains the fallback.
    setTimeout(() => {
      if (frame.classList.contains('hidden')) {
        statusEl.innerHTML = '<strong>Opening secure activity…</strong><span>If this remains here, the game host may be blocking embedded pages.</span>';
      }
    }, 4500);
  } catch (err) {
    showError(err.message || 'Could not open this activity.');
  }
}

start();
