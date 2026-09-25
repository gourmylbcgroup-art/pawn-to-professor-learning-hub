/* global supabase */
const statusEl = document.getElementById('status');
const statusTitle = document.getElementById('statusTitle');
const statusMessage = document.getElementById('statusMessage');
const frame = document.getElementById('gameFrame');
const titleEl = document.getElementById('playerTitle');
const retryBtn = document.getElementById('retryBtn');

let loadTimers = [];
let loadAttempt = 0;

function getDeviceId() {
  let value = localStorage.getItem('ptp_device_id');
  if (!value) {
    value = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-${Math.random()}`);
    localStorage.setItem('ptp_device_id', value);
  }
  return value;
}

function clearLoadTimers() {
  loadTimers.forEach(clearTimeout);
  loadTimers = [];
}

function setStatus(title, message, { error = false, showRetry = false } = {}) {
  statusEl.classList.remove('hidden');
  statusEl.classList.toggle('error', error);
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  retryBtn.classList.toggle('hidden', !showRetry);
}

function showError(message) {
  clearLoadTimers();
  frame.removeAttribute('src');
  frame.classList.add('frame-muted');
  setStatus('Access not available', message, { error: true, showRetry: true });
}

function scheduleLoadingMessages(attempt) {
  clearLoadTimers();

  loadTimers.push(setTimeout(() => {
    if (attempt !== loadAttempt || statusEl.classList.contains('hidden')) return;
    setStatus('Loading your game…', 'The secure check is complete. Your activity is loading now.');
  }, 700));

  loadTimers.push(setTimeout(() => {
    if (attempt !== loadAttempt || statusEl.classList.contains('hidden')) return;
    setStatus('Almost ready…', 'Large images, audio or game files can take a few extra seconds.');
  }, 5000));

  loadTimers.push(setTimeout(() => {
    if (attempt !== loadAttempt || statusEl.classList.contains('hidden')) return;
    setStatus('This game is taking longer than usual…', 'It is still loading. You can wait or press Try again.', { showRetry: true });
  }, 15000));

  loadTimers.push(setTimeout(() => {
    if (attempt !== loadAttempt || statusEl.classList.contains('hidden')) return;
    setStatus('Still loading…', 'The game host is responding slowly. You can keep waiting or try again.', { showRetry: true });
  }, 30000));
}

function addPreconnect(url) {
  try {
    const origin = new URL(url).origin;
    if (document.querySelector(`link[data-ptp-preconnect="${CSS.escape(origin)}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    link.dataset.ptpPreconnect = origin;
    document.head.appendChild(link);
  } catch {
    // Invalid URLs are handled by the secure-launch API.
  }
}

document.getElementById('backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back(); else location.href = '/';
});

retryBtn.addEventListener('click', () => start());

async function start() {
  loadAttempt += 1;
  const attempt = loadAttempt;
  clearLoadTimers();
  retryBtn.classList.add('hidden');
  frame.classList.add('frame-muted');
  frame.removeAttribute('src');
  setStatus('Checking your access…', 'This secure link only works for an authorized account.');

  const activityId = new URLSearchParams(location.search).get('activity');
  if (!activityId) return showError('This activity link is incomplete.');

  try {
    const cfgRes = await fetch('/api/config', { cache: 'no-store' });
    if (!cfgRes.ok) throw new Error('Portal configuration is unavailable.');
    const cfg = await cfgRes.json();

    const client = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    const { data } = await client.auth.getSession();
    const token = data.session?.access_token || '';

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const launchRes = await fetch('/api/game/create-launch', {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify({ activityId, deviceId: getDeviceId() })
    });

    const body = await launchRes.json().catch(() => ({}));
    if (!launchRes.ok) throw new Error(body.error || 'Access was denied.');
    if (attempt !== loadAttempt) return;

    titleEl.textContent = body.title || 'Learning Activity';
    addPreconnect(body.embedUrl);

    // v1.4.1: make the iframe visible immediately so the browser can paint the
    // game progressively instead of showing a blank screen until iframe.onload.
    frame.classList.remove('frame-muted');
    scheduleLoadingMessages(attempt);

    frame.onload = () => {
      if (attempt !== loadAttempt) return;
      clearLoadTimers();
      statusEl.classList.add('hidden');
      retryBtn.classList.add('hidden');
    };

    frame.onerror = () => {
      if (attempt !== loadAttempt) return;
      showError('The game could not be loaded. Please try again.');
    };

    frame.src = body.embedUrl;
  } catch (err) {
    if (attempt !== loadAttempt) return;
    showError(err.message || 'Could not open this activity.');
  }
}

start();
