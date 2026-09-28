/* Pawn to Professor v1.9.8 — Admin menu ordering */
(() => {
  if (typeof renderAdmin !== 'function' || typeof els === 'undefined') return;

  const ORDER = [
    /^📊\s*Dashboard/i,
    /^📨\s*Messages/i,
    /^💰\s*Payments/i,
    /^👥\s*Requests/i,
    /^👤\s*Users\s*&\s*Access/i,
    /^🎮\s*Activities/i,
    /^📁\s*Resources/i,
    /^📚\s*Content Structure/i,
    /^💬\s*Community/i,
    /^👥\s*Access Groups/i,
    /^🎟\s*Access Packages/i,
    /^🧰\s*Teacher Tools/i,
    /^⚖️\s*Legal\s*&\s*Registration/i,
    /^🎨\s*Design Studio/i,
    /^⚙️\s*Settings/i,
    /^🩺\s*System Health/i,
    /^🧾\s*Audit Log/i,
    /^🗑\s*Cleanup/i
  ];

  function rank(button) {
    const text = (button.textContent || '').trim();
    const index = ORDER.findIndex(rx => rx.test(text));
    return index === -1 ? 999 : index;
  }

  function reorderAdminMenu() {
    const tabs = els.content?.querySelector('.admin-tabs');
    if (!tabs) return;

    const buttons = [...tabs.querySelectorAll(':scope > button')];
    buttons
      .sort((a,b) => rank(a) - rank(b))
      .forEach(button => tabs.appendChild(button));

    buttons.forEach(button => button.removeAttribute('data-v198-group'));

    const daily = buttons.filter(b => rank(b) <= 4);
    const content = buttons.filter(b => rank(b) >= 5 && rank(b) <= 11);
    const system = buttons.filter(b => rank(b) >= 12 && rank(b) < 999);

    if (daily[0]) daily[0].dataset.v198Group = 'daily';
    if (content[0]) content[0].dataset.v198Group = 'content';
    if (system[0]) system[0].dataset.v198Group = 'system';
  }

  const nativeRenderAdminV198 = renderAdmin;
  renderAdmin = function(...args) {
    const result = nativeRenderAdminV198(...args);
    reorderAdminMenu();
    return result;
  };

  globalThis.PTP_ADMIN_MENU_ORDER = '1.9.8';
})();
