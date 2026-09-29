/* Pawn to Professor v1.9.8f
   GLOBAL SPEED PATCH
   Applies to Owner / Admin / Teacher / Learner.

   Goals:
   - Do not re-query accessible_unit_ids every time a member opens a Grade.
   - Keep access permissions in memory after login.
   - Refresh access quietly in the background.
   - Never weaken secure resource/game checks.
   - Preserve existing curriculum, payments, messages, trials and device security.
*/
(() => {
  if (typeof state === 'undefined') return;

  const SPEED_VERSION = '1.9.8f';
  const ACCESS_REFRESH_MS = 60 * 1000; // 1 minute
  let accessLoadedAt = 0;
  let accessRequest = null;
  let backgroundTimer = null;

  // -----------------------------------------------------------------------
  // 1) Cache/deduplicate the existing access query.
  // -----------------------------------------------------------------------
  if (typeof loadOwnAccess === 'function') {
    const nativeLoadOwnAccess = loadOwnAccess;

    loadOwnAccess = async function ({ force = false } = {}) {
      // Staff access is local and already effectively instant.
      if (typeof isStaff === 'function' && isStaff()) {
        state.ownAccess = new Set((state.units || []).map(u => u.id));
        accessLoadedAt = Date.now();
        return;
      }

      const fresh =
        !force &&
        accessLoadedAt > 0 &&
        (Date.now() - accessLoadedAt) < ACCESS_REFRESH_MS &&
        state.ownAccess instanceof Set;

      if (fresh) return;

      // If another part of the UI already started the same request,
      // share that promise instead of making a duplicate Supabase call.
      if (accessRequest) return accessRequest;

      accessRequest = (async () => {
        try {
          await nativeLoadOwnAccess();
          accessLoadedAt = Date.now();
        } finally {
          accessRequest = null;
        }
      })();

      return accessRequest;
    };
  }

  // -----------------------------------------------------------------------
  // 2) Grade navigation must NEVER wait for a new permission query.
  //    Permissions were already loaded during login.
  // -----------------------------------------------------------------------
  if (typeof renderGrades === 'function') {
    renderGrades = function () {
      setHeader('Choose a Grade', [state.year.name]);

      const grid = document.createElement('div');
      grid.className = 'tile-grid';

      const grades = state.grades.filter(
        g => g.school_year_id === state.year.id
      );

      for (const grade of grades) {
        const units = state.units.filter(
          u => u.grade_id === grade.id
        );

        const unlockedCount = units.filter(
          u => state.ownAccess.has(u.id)
        ).length;

        grid.appendChild(
          makeTile({
            icon: '🎒',
            title: grade.name,
            subtitle:
              isStaff()
                ? `${units.length} units`
                : `${unlockedCount}/${units.length} units open`,

            // IMPORTANT:
            // No await loadOwnAccess() here.
            // Opening a Grade is now immediate for every user.
            onClick: () => {
              state.grade = grade;
              state.view = 'units';
              render();
            }
          })
        );
      }

      els.content.appendChild(grid);
    };
  }

  // -----------------------------------------------------------------------
  // 3) Quiet background access refresh.
  //    If Admin changes a member's access while they remain logged in,
  //    the site updates without making navigation wait.
  // -----------------------------------------------------------------------
  function startQuietAccessRefresh() {
    if (backgroundTimer) clearInterval(backgroundTimer);

    // Staff permissions are derived locally from published units.
    if (typeof isStaff === 'function' && isStaff()) return;

    backgroundTimer = setInterval(async () => {
      if (!state.profile || !state.session) return;

      const before = new Set(state.ownAccess || []);

      try {
        await loadOwnAccess({ force: true });

        // Re-render only if the permission set actually changed.
        const after = state.ownAccess || new Set();
        const changed =
          before.size !== after.size ||
          [...before].some(id => !after.has(id));

        if (
          changed &&
          ['years', 'grades', 'units'].includes(state.view)
        ) {
          render();
        }
      } catch {
        // A temporary work/school network problem should never block the UI.
      }
    }, ACCESS_REFRESH_MS);
  }

  // -----------------------------------------------------------------------
  // 4) Hook portal startup without changing its security flow.
  // -----------------------------------------------------------------------
  if (typeof enterPortal === 'function') {
    const nativeEnterPortalSpeed = enterPortal;

    enterPortal = async function (...args) {
      const result = await nativeEnterPortalSpeed(...args);

      // Native login already loaded permissions once.
      // Record that as fresh and begin quiet refreshes.
      accessLoadedAt = Date.now();
      startQuietAccessRefresh();

      return result;
    };
  }

  // -----------------------------------------------------------------------
  // 5) Logout cleanup.
  // -----------------------------------------------------------------------
  const logoutButton = document.getElementById('logoutBtn');
  if (logoutButton) {
    logoutButton.addEventListener(
      'click',
      () => {
        if (backgroundTimer) clearInterval(backgroundTimer);
        backgroundTimer = null;
        accessLoadedAt = 0;
        accessRequest = null;
      },
      true
    );
  }

  // -----------------------------------------------------------------------
  // 6) Network warm-up.
  //    Once Supabase exists, establish a harmless early connection so the
  //    first real member action is less likely to pay DNS/TLS setup cost.
  // -----------------------------------------------------------------------
  setTimeout(() => {
    try {
      const url = state?.client?.supabaseUrl;
      if (!url) return;

      const origin = new URL(url).origin;
      if (
        document.head &&
        !document.querySelector(`link[data-ptp-preconnect="${origin}"]`)
      ) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = origin;
        link.crossOrigin = 'anonymous';
        link.dataset.ptpPreconnect = origin;
        document.head.appendChild(link);
      }
    } catch {}
  }, 0);

  globalThis.PTP_GLOBAL_SPEED_VERSION = SPEED_VERSION;
})();
