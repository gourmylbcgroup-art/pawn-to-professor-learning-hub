/* Pawn to Professor v1.6.7
   Switch to the large-board classroom only after the Learning Hub portal opens.
   Login / registration / device verification keep the original background. */
(() => {
  const scene = document.querySelector('.scene');
  const portalView = document.getElementById('portalView');

  if (!scene || !portalView) return;

  function syncPortalMode() {
    const portalIsVisible = !portalView.classList.contains('hidden');
    scene.classList.toggle('portal-mode', portalIsVisible);
    document.documentElement.classList.toggle('portal-mode', portalIsVisible);
  }

  // React whenever app.js shows or hides the logged-in portal.
  const observer = new MutationObserver(syncPortalMode);
  observer.observe(portalView, {
    attributes: true,
    attributeFilter: ['class']
  });

  // Also sync on initial page load / restored Supabase session.
  syncPortalMode();

  // Defensive cleanup on logout: app.js will hide portalView, but this ensures
  // the original login classroom is restored immediately.
  const logoutButton = document.getElementById('logoutBtn');
  logoutButton?.addEventListener('click', () => {
    scene.classList.remove('portal-mode');
    document.documentElement.classList.remove('portal-mode');
  }, true);
})();
