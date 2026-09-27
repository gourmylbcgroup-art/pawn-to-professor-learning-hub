/* Pawn to Professor v1.9.1 — Automatic Desktop / Tablet / Mobile layout
   No application logic is changed. This file only labels the current display
   so responsive-display.css can apply the correct visual layout.
*/
(() => {
  const root = document.documentElement;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';

  const isPhone =
    /iPhone|iPod|Windows Phone/i.test(ua) ||
    (/Android/i.test(ua) && /Mobile/i.test(ua));

  const isIPad =
    /iPad/i.test(ua) ||
    (platform === 'MacIntel' && Number(navigator.maxTouchPoints || 0) > 1);

  const isAndroidTablet =
    /Android/i.test(ua) && !/Mobile/i.test(ua);

  function chooseLayout() {
    const width = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);

    let layout = 'desktop';

    // Phones remain in the phone layout even when rotated to landscape.
    if (isPhone || width < 700) {
      layout = 'mobile';
    } else if (isIPad || isAndroidTablet || width < 1100) {
      // iPads remain in the tablet layout, including larger iPad Pro landscape.
      layout = 'tablet';
    }

    root.dataset.deviceLayout = layout;
    root.dataset.deviceOrientation =
      window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
  }

  let resizeTimer = null;
  function scheduleLayout() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(chooseLayout, 60);
  }

  chooseLayout();
  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('orientationchange', scheduleLayout, { passive: true });

  // Useful for support/debugging from the browser console.
  globalThis.PTPResponsive = {
    refresh: chooseLayout,
    current: () => ({
      layout: root.dataset.deviceLayout,
      orientation: root.dataset.deviceOrientation,
      width: window.innerWidth,
      height: window.innerHeight,
      isIPad,
      isPhone,
      isAndroidTablet
    })
  };
})();
