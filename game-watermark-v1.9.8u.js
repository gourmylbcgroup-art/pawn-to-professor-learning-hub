/* Pawn to Professor v1.9.8u — subtle secure-player watermark
   Only affects play.html / secure game player.
   No homepage watermark. No portal-wide copy blocking.
*/
(() => {
  'use strict';

  const VERSION = '1.9.8u';

  function showNotice(text) {
    let el = document.getElementById('ptp-game-protection-note');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ptp-game-protection-note';
      Object.assign(el.style, {
        position:'fixed',
        left:'50%',
        bottom:'18px',
        transform:'translateX(-50%)',
        zIndex:'2147483646',
        padding:'8px 13px',
        borderRadius:'999px',
        background:'rgba(8,47,37,.92)',
        color:'#fff',
        font:'700 12px system-ui,sans-serif',
        opacity:'0',
        transition:'opacity .15s ease',
        pointerEvents:'none'
      });
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity='0'; }, 1400);
  }

  async function getMemberLabel() {
    try {
      if (!globalThis.supabase?.createClient) return 'Authorized member';

      const cfgRes = await fetch('/api/config', {cache:'no-store'});
      if (!cfgRes.ok) return 'Authorized member';

      const cfg = await cfgRes.json();
      const client = globalThis.supabase.createClient(
        cfg.supabaseUrl,
        cfg.supabaseAnonKey,
        {auth:{persistSession:true,autoRefreshToken:true}}
      );

      const {data:{session}} = await client.auth.getSession();
      if (!session?.user?.id) return 'Authorized member';

      const {data:profile} = await client
        .from('profiles')
        .select('username,display_name,role')
        .eq('id',session.user.id)
        .maybeSingle();

      if (profile && ['admin','owner'].includes(profile.role)) return null;
      return profile?.username || profile?.display_name || 'Authorized member';
    } catch {
      return 'Authorized member';
    }
  }

  function addWatermarks(label) {
    const stage = document.getElementById('gameStage');
    if (!stage || label === null) return;

    if (!document.getElementById('ptp-subtle-watermark-site')) {
      const site = document.createElement('div');
      site.id = 'ptp-subtle-watermark-site';
      site.textContent = 'pawntoprofessor.com';
      stage.appendChild(site);
    }

    if (!document.getElementById('ptp-subtle-watermark-user')) {
      const user = document.createElement('div');
      user.id = 'ptp-subtle-watermark-user';
      user.textContent = `Licensed to: ${label}`;
      stage.appendChild(user);
    }
  }

  function installLocalProtection() {
    const stage = document.getElementById('gameStage');
    if (!stage) return;

    // Only inside the secure game area.
    stage.addEventListener('contextmenu', e => {
      e.preventDefault();
      showNotice('Right-click saving is disabled in the secure activity.');
    }, true);

    stage.addEventListener('dragstart', e => {
      if (e.target?.closest?.('img,iframe,a,video,audio')) {
        e.preventDefault();
      }
    }, true);

    // Block Save / Print only while focus is in the secure player page.
    document.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey;
      const key = String(e.key || '').toLowerCase();

      if (mod && (key === 's' || key === 'p')) {
        e.preventDefault();
        showNotice('Saving/printing this secure activity is disabled.');
      }
    }, true);
  }

  async function start() {
    const stage = document.getElementById('gameStage');
    if (!stage) return;

    const label = await getMemberLabel();
    addWatermarks(label);
    installLocalProtection();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }

  globalThis.PTP_SUBTLE_GAME_WATERMARK = {version:VERSION};
})();
