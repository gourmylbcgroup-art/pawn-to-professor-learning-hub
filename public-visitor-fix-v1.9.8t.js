/* Pawn to Professor v1.9.8t — Public Visitor Tracking Fix
   Fixes anonymous/public login-page visits staying at 0.

   This patch loads AFTER analytics-retention-v1.9.8s.js and safely replaces
   the public visitor tracker without changing member analytics.
*/
(() => {
  const VERSION = '1.9.8t';
  const PUBLIC_VISITOR_KEY = 'ptp_public_visitor_id_v1';
  let loggedThisPage = false;
  let logging = false;

  function getClient() {
    try {
      if (typeof state !== 'undefined' && state?.client) return state.client;
    } catch {}
    try {
      if (globalThis.state?.client) return globalThis.state.client;
    } catch {}
    return null;
  }

  function hasSession() {
    try {
      return Boolean(typeof state !== 'undefined' && state?.session);
    } catch {
      return false;
    }
  }

  function browserVisitorId() {
    try {
      let id = localStorage.getItem(PUBLIC_VISITOR_KEY);
      if (!id) {
        id = globalThis.crypto?.randomUUID?.()
          || `pv-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(PUBLIC_VISITOR_KEY, id);
      }
      return id;
    } catch {
      return `pv-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function loginVisible() {
    const loginView = document.getElementById('loginView');
    return Boolean(loginView && !loginView.classList.contains('hidden'));
  }

  async function waitForReady(maxMs = 12000) {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      const client = getClient();
      if (client && loginVisible()) return client;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }

  async function logPublicVisit() {
    if (loggedThisPage || logging) return;
    if (hasSession()) return;
    if (!loginVisible()) return;

    logging = true;
    try {
      const client = await waitForReady();
      if (!client) {
        console.warn('[PTP public analytics] Supabase client/login view not ready.');
        return;
      }
      if (hasSession() || !loginVisible()) return;

      const { error } = await client.rpc('log_public_home_visit', {
        p_visitor_key: browserVisitorId()
      });

      if (error) {
        console.error('[PTP public analytics] log_public_home_visit failed:', error);
        return;
      }

      loggedThisPage = true;
      console.info('[PTP public analytics] anonymous visit recorded.');
    } catch (err) {
      console.error('[PTP public analytics] unexpected error:', err);
    } finally {
      logging = false;
    }
  }

  function scheduleLog(delay = 60) {
    setTimeout(() => { void logPublicVisit(); }, delay);
  }

  // Initial page load.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleLog(120), { once:true });
  } else {
    scheduleLog(120);
  }

  // The login view becomes visible after app boot; watch for that transition.
  const attachObserver = () => {
    const loginView = document.getElementById('loginView');
    if (!loginView) {
      setTimeout(attachObserver, 100);
      return;
    }
    const observer = new MutationObserver(() => {
      if (loginVisible() && !hasSession()) scheduleLog(40);
    });
    observer.observe(loginView, { attributes:true, attributeFilter:['class'] });

    if (loginVisible() && !hasSession()) scheduleLog(40);
  };
  attachObserver();

  globalThis.PTP_PUBLIC_VISITOR_FIX = {
    version: VERSION,
    retry: () => logPublicVisit(),
    status: () => ({
      loggedThisPage,
      logging,
      loginVisible: loginVisible(),
      hasSession: hasSession(),
      clientReady: Boolean(getClient())
    })
  };
})();
