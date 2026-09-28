/* global supabase */
const statusEl = document.getElementById('status');
const statusTitle = document.getElementById('statusTitle');
const statusMessage = document.getElementById('statusMessage');
const frame = document.getElementById('gameFrame');
const titleEl = document.getElementById('playerTitle');
const retryBtn = document.getElementById('retryBtn');
const shell = document.getElementById('playerShell');
const guideBtn = document.getElementById('guideBtn');
const showBarBtn = document.getElementById('showBarBtn');
const hideBarBtn = document.getElementById('hideBarBtn');

let loadTimers = [];
let loadAttempt = 0;
let barTimer = null;
let activeGuideResourceId = null;
let activeClient = null;

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

function clearBarTimer() {
  if (barTimer) clearTimeout(barTimer);
  barTimer = null;
}

function setBarHidden(hidden) {
  shell.classList.toggle('bar-hidden', hidden);
  showBarBtn.classList.toggle('hidden', !hidden);
  if (!hidden) scheduleBarAutoHide();
  else clearBarTimer();
}

function scheduleBarAutoHide() {
  clearBarTimer();
  if (!statusEl.classList.contains('hidden')) return;
  barTimer = setTimeout(() => setBarHidden(true), 3800);
}

function setStatus(title, message, { error = false, showRetry = false } = {}) {
  statusEl.classList.remove('hidden');
  statusEl.classList.toggle('error', error);
  statusTitle.textContent = title;
  statusMessage.textContent = message;
  retryBtn.classList.toggle('hidden', !showRetry);
  setBarHidden(false);
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
    setStatus('Loading your activity…', 'The secure check is complete. Your activity is loading now.');
  }, 700));

  loadTimers.push(setTimeout(() => {
    if (attempt !== loadAttempt || statusEl.classList.contains('hidden')) return;
    setStatus('Almost ready…', 'Large images, audio or activity files can take a few extra seconds.');
  }, 5000));

  loadTimers.push(setTimeout(() => {
    if (attempt !== loadAttempt || statusEl.classList.contains('hidden')) return;
    setStatus('This activity is taking longer than usual…', 'It is still loading. You can wait or press Try again.', { showRetry: true });
  }, 15000));

  loadTimers.push(setTimeout(() => {
    if (attempt !== loadAttempt || statusEl.classList.contains('hidden')) return;
    setStatus('Still loading…', 'The activity host is responding slowly. You can keep waiting or try again.', { showRetry: true });
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
  } catch {}
}

document.getElementById('backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '/';
});

document.getElementById('homeBtn').addEventListener('click', () => {
  location.href = '/';
});

hideBarBtn.addEventListener('click', () => setBarHidden(true));
showBarBtn.addEventListener('click', () => setBarHidden(false));

document.addEventListener('pointermove', event => {
  if (shell.classList.contains('bar-hidden') && event.pointerType !== 'touch' && event.clientY <= 12) {
    setBarHidden(false);
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !shell.classList.contains('bar-hidden')) setBarHidden(true);
});

guideBtn.addEventListener('click', async () => {
  if (!activeGuideResourceId || !activeClient) return;

  const popup = window.open('about:blank','_blank');
  if (popup) popup.document.write('<p style="font-family:system-ui;padding:2rem">Checking guide access…</p>');

  try {
    const { data } = await activeClient.auth.getSession();
    const token = data.session?.access_token || '';
    const headers = {
      'Content-Type':'application/json',
      'Authorization':`Bearer ${token}`
    };

    const res = await fetch('/api/resource/resolve', {
      method:'POST',
      headers,
      cache:'no-store',
      body:JSON.stringify({
        resourceId:activeGuideResourceId,
        mode:'download',
        deviceId:getDeviceId()
      })
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Guide access was denied.');

    if (popup) popup.location.replace(body.url);
    else window.location.assign(body.url);
  } catch (err) {
    if (popup) popup.close();
    alert(err.message || 'Could not open the guide.');
  }
});

retryBtn.addEventListener('click', () => start());

async function start() {
  loadAttempt += 1;
  const attempt = loadAttempt;
  clearLoadTimers();
  clearBarTimer();
  activeGuideResourceId = null;
  guideBtn.classList.add('hidden');
  retryBtn.classList.add('hidden');
  frame.classList.add('frame-muted');
  frame.removeAttribute('src');
  setBarHidden(false);
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
    activeClient = client;

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

    if (body.guideResourceId) {
      activeGuideResourceId = body.guideResourceId;
      guideBtn.textContent = body.guideLabel || '📘 How to Use';
      guideBtn.classList.remove('hidden');
    }

    void client.rpc('log_usage_event', {
      p_event_type: 'game_play',
      p_activity_id: activityId
    }).then(() => {}).catch(() => {});

    addPreconnect(body.embedUrl);
    frame.classList.remove('frame-muted');
    scheduleLoadingMessages(attempt);

    frame.onload = () => {
      if (attempt !== loadAttempt) return;
      clearLoadTimers();
      statusEl.classList.add('hidden');
      retryBtn.classList.add('hidden');
      scheduleBarAutoHide();
    };

    frame.onerror = () => {
      if (attempt !== loadAttempt) return;
      showError('The activity could not be loaded. Please try again.');
    };

    frame.src = body.embedUrl;
  } catch (err) {
    if (attempt !== loadAttempt) return;
    showError(err.message || 'Could not open this activity.');
  }
}

start();
