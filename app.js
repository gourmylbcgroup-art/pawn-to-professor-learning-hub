/* global supabase */

const els = {
  loading: document.getElementById('loadingView'),
  loginView: document.getElementById('loginView'),
  registerView: document.getElementById('registerView'),
  portalView: document.getElementById('portalView'),
  loginForm: document.getElementById('loginForm'),
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  loginMessage: document.getElementById('loginMessage'),
  openRegisterBtn: document.getElementById('openRegisterBtn'),
  registerForm: document.getElementById('registerForm'),
  registerUsername: document.getElementById('registerUsername'),
  registerName: document.getElementById('registerName'),
  registerEmail: document.getElementById('registerEmail'),
  registerPassword: document.getElementById('registerPassword'),
  registerPassword2: document.getElementById('registerPassword2'),
  registerMessage: document.getElementById('registerMessage'),
  backToLoginBtn: document.getElementById('backToLoginBtn'),
  loginBrandKicker: document.getElementById('loginBrandKicker'),
  loginPortalTitle: document.getElementById('loginPortalTitle'),
  loginPortalSubtitle: document.getElementById('loginPortalSubtitle'),
  headerBrandKicker: document.getElementById('headerBrandKicker'),
  pageTitle: document.getElementById('pageTitle'),
  breadcrumb: document.getElementById('breadcrumb'),
  content: document.getElementById('contentArea'),
  backBtn: document.getElementById('backBtn'),
  adminBtn: document.getElementById('adminBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  tileTemplate: document.getElementById('tileTemplate')
};

const DEFAULT_SETTINGS = {
  registration_enabled: false,
  community_enabled: false,
  portal_title: 'Learning Hub',
  portal_subtitle: 'Choose your grade. Open your unit. Start learning.',
  brand_kicker: 'PAWN TO PROFESSOR',
  body_font: 'Nunito',
  heading_font: 'Fredoka',
  theme: 'classroom',
  button_style: 'rounded3d',
  menu_style: 'cards',
  board_opacity: 1,
  background_url: null,
  accent_color: '#75e0b3',
  primary_color: '#ffd04a'
};

const state = {
  client: null,
  session: null,
  profile: null,
  settings: { ...DEFAULT_SETTINGS },
  years: [],
  grades: [],
  units: [],
  tools: [],
  ownAccess: new Set(),
  view: 'years',
  year: null,
  grade: null,
  unit: null,
  adminTab: 'dashboard',
  adminUsers: [],
  selectedAdminUser: null,
  packages: [],
  accessGroups: [],
  selectedAccessGroup: null,
  communityCategory: null,
  communityTopic: null
};

const aliasDomain = 'portal.local';
const FONT_OPTIONS = ['Nunito','Fredoka','Poppins','Quicksand','Baloo 2','Inter','Comic Neue','Atkinson Hyperlegible'];
const THEME_OPTIONS = [
  ['classroom','Sunny Classroom'],
  ['classic','Classic Chalkboard'],
  ['blue','Modern Blue'],
  ['dark','Dark Classroom'],
  ['colorful','Colorful Primary']
];

function loginIdentifierToEmail(value) {
  const clean = value.trim().toLowerCase();
  if (clean.includes('@')) return clean;
  return `${clean.replace(/[^a-z0-9._-]/g, '')}@${aliasDomain}`;
}
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.getElementById('boardApp').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function shortDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString(); } catch { return '—'; }
}
function isStaff() { return ['admin','owner'].includes(state.profile?.role); }
function isOwner() { return state.profile?.role === 'owner'; }
function roleBadge(role) { return `<span class="role-badge ${escapeHtml(role)}">${escapeHtml(role)}</span>`; }
function option(value, label, selected) { return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`; }
function unitPath(unitId) {
  const unit = state.units.find(u => u.id === unitId);
  const grade = state.grades.find(g => g.id === unit?.grade_id);
  const year = state.years.find(y => y.id === grade?.school_year_id);
  return [year?.name, grade?.name, unit?.name].filter(Boolean).join(' / ');
}

async function boot() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Missing Vercel/Supabase configuration.');
    const cfg = await res.json();
    state.client = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    await loadPublicSettings();
    const { data } = await state.client.auth.getSession();
    state.session = data.session;
    state.client.auth.onAuthStateChange((_event, session) => { state.session = session; });

    if (state.session) await enterPortal();
    else showLogin();
  } catch (err) {
    hide(els.loading);
    show(els.loginView);
    els.loginMessage.textContent = err.message;
  }
}

async function loadPublicSettings() {
  const { data, error } = await state.client.from('portal_settings').select('*').eq('id', 1).maybeSingle();
  state.settings = { ...DEFAULT_SETTINGS, ...(!error && data ? data : {}) };
  applyDesign(state.settings);
}

function applyDesign(settings) {
  const root = document.documentElement;
  root.style.setProperty('--body-font', `'${settings.body_font || DEFAULT_SETTINGS.body_font}', system-ui, sans-serif`);
  root.style.setProperty('--heading-font', `'${settings.heading_font || DEFAULT_SETTINGS.heading_font}', system-ui, sans-serif`);
  root.style.setProperty('--accent', settings.accent_color || DEFAULT_SETTINGS.accent_color);
  root.style.setProperty('--primary', settings.primary_color || DEFAULT_SETTINGS.primary_color);
  root.style.setProperty('--board-opacity', String(Math.min(1, Math.max(.65, Number(settings.board_opacity || 1)))));
  root.dataset.theme = settings.theme || 'classroom';
  root.dataset.buttonStyle = settings.button_style || 'rounded3d';
  root.dataset.menuStyle = settings.menu_style || 'cards';

  const scene = document.querySelector('.scene');
  scene.style.backgroundImage = settings.background_url
    ? `url("${String(settings.background_url).replace(/"/g, '%22')}")`
    : "url('./assets/classroom-bg.png')";

  els.loginBrandKicker.textContent = settings.brand_kicker || DEFAULT_SETTINGS.brand_kicker;
  els.headerBrandKicker.textContent = settings.brand_kicker || DEFAULT_SETTINGS.brand_kicker;
  els.loginPortalTitle.textContent = settings.portal_title || DEFAULT_SETTINGS.portal_title;
  els.loginPortalSubtitle.textContent = settings.portal_subtitle || DEFAULT_SETTINGS.portal_subtitle;
  document.title = `${settings.brand_kicker || 'Pawn to Professor'} — ${settings.portal_title || 'Learning Hub'}`;
}

function showLogin(message = '') {
  hide(els.loading); hide(els.portalView); hide(els.registerView); show(els.loginView);
  els.loginMessage.textContent = message;
  state.settings.registration_enabled ? show(els.openRegisterBtn) : hide(els.openRegisterBtn);
  els.loginUsername.focus();
}
function showRegister() {
  hide(els.loginView); hide(els.portalView); show(els.registerView);
  els.registerMessage.textContent = '';
  els.registerUsername.focus();
}

els.openRegisterBtn.addEventListener('click', showRegister);
els.backToLoginBtn.addEventListener('click', () => showLogin());

els.registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = els.registerPassword.value;
  if (password !== els.registerPassword2.value) {
    els.registerMessage.textContent = 'The two passwords do not match.';
    return;
  }
  els.registerMessage.textContent = 'Sending request…';
  const res = await fetch('/api/register-request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: els.registerUsername.value,
      displayName: els.registerName.value,
      email: els.registerEmail.value,
      password
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    els.registerMessage.textContent = body.error || 'Registration could not be completed.';
    return;
  }
  els.registerForm.reset();
  showLogin('Registration received. Your account is waiting for administrator approval.');
});

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginMessage.textContent = 'Signing in…';
  const email = loginIdentifierToEmail(els.loginUsername.value);
  const password = els.loginPassword.value;
  const { data, error } = await state.client.auth.signInWithPassword({ email, password });
  if (error) {
    els.loginMessage.textContent = 'Username or password is not correct.';
    return;
  }
  state.session = data.session;
  els.loginMessage.textContent = '';
  await enterPortal();
});

els.logoutBtn.addEventListener('click', async () => {
  await state.client.auth.signOut();
  Object.assign(state, {
    session:null, profile:null, view:'years', year:null, grade:null, unit:null,
    selectedAdminUser:null, adminUsers:[], packages:[], accessGroups:[], selectedAccessGroup:null,
    communityCategory:null, communityTopic:null, tools:[]
  });
  await loadPublicSettings();
  showLogin();
});

els.backBtn.addEventListener('click', () => {
  if (state.view === 'admin' || state.view === 'tools' || state.view === 'community') { state.view = 'years'; render(); return; }
  if (state.view === 'communityCategory') { state.view = 'community'; state.communityCategory = null; render(); return; }
  if (state.view === 'communityTopic') { state.view = 'communityCategory'; state.communityTopic = null; render(); return; }
  if (state.view === 'activities') { state.view = 'units'; state.unit = null; }
  else if (state.view === 'units') { state.view = 'grades'; state.grade = null; }
  else if (state.view === 'grades') { state.view = 'years'; state.year = null; }
  render();
});

els.adminBtn.addEventListener('click', async () => {
  state.view = 'admin';
  state.adminTab = 'dashboard';
  await Promise.all([loadAdminUsers(), loadPackages(), loadAccessGroups()]);
  render();
});

async function enterPortal() {
  hide(els.loading); hide(els.loginView); hide(els.registerView);
  const uid = state.session.user.id;
  const { data: profile, error } = await state.client.from('profiles').select('*').eq('id', uid).single();
  if (error || !profile) {
    await state.client.auth.signOut();
    showLogin('Your profile is not ready. Ask the administrator.');
    return;
  }
  const expired = profile.expires_at && new Date(profile.expires_at) <= new Date();
  if (profile.status !== 'active' || expired) {
    await state.client.auth.signOut();
    const msg = expired ? 'This account has expired.'
      : profile.status === 'pending' ? 'Your registration is waiting for administrator approval.'
      : profile.status === 'rejected' ? 'This registration request was not approved.'
      : 'This account is inactive.';
    showLogin(msg);
    return;
  }

  state.profile = profile;
  // v1.4 reliability fix: structure must be loaded before staff access is calculated.
  await loadStructure();
  await Promise.all([loadOwnAccess(), loadExternalTools(), loadPublicSettings()]);
  state.view = 'years';
  show(els.portalView);
  render();
}

async function loadStructure() {
  const [years, grades, units] = await Promise.all([
    state.client.from('school_years').select('*').eq('archived', false).order('sort_order'),
    state.client.from('grades').select('*').eq('archived', false).order('sort_order'),
    state.client.from('units').select('*').eq('is_published', true).order('sort_order')
  ]);
  if (years.error || grades.error || units.error) throw years.error || grades.error || units.error;
  state.years = years.data || [];
  state.grades = grades.data || [];
  state.units = units.data || [];
}

async function loadOwnAccess() {
  // Admin and Owner always receive every currently published Unit.
  if (isStaff()) {
    state.ownAccess = new Set(state.units.map(u => u.id));
    return;
  }
  // Users receive direct permissions PLUS dynamic Access Group rules.
  const { data, error } = await state.client.rpc('accessible_unit_ids');
  if (error) throw error;
  state.ownAccess = new Set((data || []).map(r => r.unit_id));
}

async function loadExternalTools() {
  const { data, error } = await state.client.from('external_tools').select('*').order('sort_order').order('name');
  if (error) { state.tools = []; return; }
  state.tools = (data || []).filter(tool => tool.enabled && (
    tool.audience === 'all_members' ||
    (tool.audience === 'staff_only' && isStaff()) ||
    (tool.audience === 'owner_only' && isOwner())
  ));
}

function setHeader(title, crumbs = []) {
  els.pageTitle.textContent = title;
  els.breadcrumb.textContent = crumbs.join('  ›  ');
  isStaff() ? show(els.adminBtn) : hide(els.adminBtn);
  state.view === 'years' ? hide(els.backBtn) : show(els.backBtn);
}

function makeTile({ icon, title, subtitle, locked = false, onClick }) {
  const node = els.tileTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector('.tile-icon').textContent = icon;
  node.querySelector('.tile-title').textContent = title;
  node.querySelector('.tile-subtitle').textContent = subtitle || '';
  if (locked) { node.classList.add('locked'); node.querySelector('.lock-badge').classList.remove('hidden'); }
  node.addEventListener('click', onClick);
  return node;
}

function render() {
  els.content.innerHTML = '';
  if (state.view === 'years') renderYears();
  else if (state.view === 'grades') renderGrades();
  else if (state.view === 'units') renderUnits();
  else if (state.view === 'activities') renderActivities();
  else if (state.view === 'tools') renderTools();
  else if (state.view === 'community') renderCommunity();
  else if (state.view === 'communityCategory') renderCommunityCategory();
  else if (state.view === 'communityTopic') renderCommunityTopic();
  else if (state.view === 'admin') renderAdmin();
}

function renderYears() {
  setHeader(`Welcome, ${state.profile.display_name || state.profile.username || 'Teacher'}`, []);
  const grid = document.createElement('div'); grid.className = 'tile-grid';
  for (const year of state.years) {
    const grades = state.grades.filter(g => g.school_year_id === year.id);
    grid.appendChild(makeTile({
      icon:'📚', title:year.name, subtitle:`${grades.length} grades`,
      onClick:()=>{ state.year=year; state.view='grades'; render(); }
    }));
  }
  if (state.settings.community_enabled) {
    grid.appendChild(makeTile({
      icon:'💬', title:'Community', subtitle:'Announcements, help and teaching ideas',
      onClick:()=>{ state.view='community'; state.communityCategory=null; state.communityTopic=null; render(); }
    }));
  }
  if (state.tools.length) {
    grid.appendChild(makeTile({
      icon:'🧰', title:'Teacher Tools', subtitle:`${state.tools.length} tool${state.tools.length === 1 ? '' : 's'}`,
      onClick:()=>{ state.view='tools'; render(); }
    }));
  }
  if (!grid.children.length) els.content.innerHTML = '<div class="empty-state"><div><strong>No content yet.</strong><br>Ask the administrator to add a year or tool.</div></div>';
  else els.content.appendChild(grid);
}

function renderGrades() {
  setHeader('Choose a Grade', [state.year.name]);
  const grid = document.createElement('div'); grid.className = 'tile-grid';
  const grades = state.grades.filter(g => g.school_year_id === state.year.id);
  for (const grade of grades) {
    const units = state.units.filter(u => u.grade_id === grade.id);
    const unlockedCount = units.filter(u => state.ownAccess.has(u.id)).length;
    grid.appendChild(makeTile({
      icon:'🎒', title:grade.name,
      subtitle:isStaff()?`${units.length} units`:`${unlockedCount}/${units.length} units open`,
      onClick:async()=>{ state.grade=grade; await loadOwnAccess(); state.view='units'; render(); }
    }));
  }
  els.content.appendChild(grid);
}

function renderUnits() {
  setHeader('Choose a Unit', [state.year.name, state.grade.name]);
  const grid = document.createElement('div'); grid.className='tile-grid';
  const units = state.units.filter(u => u.grade_id === state.grade.id);
  for (const unit of units) {
    const locked = !isStaff() && !state.ownAccess.has(unit.id);
    grid.appendChild(makeTile({
      icon:locked?'🔒':'⭐', title:unit.name, subtitle:locked?'No access':(unit.title||'Open unit'), locked,
      onClick:()=>{ if (locked) return toast('This unit is locked for this account.'); state.unit=unit; state.view='activities'; render(); }
    }));
  }
  if (!units.length) els.content.innerHTML = '<div class="empty-state"><div><strong>No units yet.</strong><br>The administrator can add units from Admin.</div></div>';
  else els.content.appendChild(grid);
}

async function renderActivities() {
  setHeader(state.unit.name, [state.year.name, state.grade.name, state.unit.name]);
  els.content.innerHTML = '<div class="empty-state">Loading activities…</div>';
  // Deliberately do NOT request launch_url. v1.3 keeps the real destination server-side.
  const { data, error } = await state.client.from('activities')
    .select('id,unit_id,title,type,thumbnail_url,sort_order,published')
    .eq('unit_id', state.unit.id).eq('published', true).order('sort_order');
  if (state.view !== 'activities') return;
  els.content.innerHTML = '';
  if (error) { els.content.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`; return; }
  if (!data?.length) { els.content.innerHTML = '<div class="empty-state"><div><strong>This unit is ready.</strong><br>No games have been added yet.</div></div>'; return; }
  const list = document.createElement('div'); list.className = 'activity-list';
  data.forEach(a => {
    const card = document.createElement('article'); card.className='activity-card';
    card.innerHTML = `<h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(a.type || 'Activity')} · Secure launch</p>`;
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent='PLAY 🔐';
    btn.addEventListener('click',()=>window.open(`/play.html?activity=${encodeURIComponent(a.id)}`,'_blank','noopener,noreferrer'));
    card.appendChild(btn);
    if (state.settings.community_enabled) {
      const discuss=document.createElement('button'); discuss.className='btn btn-ghost btn-small'; discuss.textContent='Discuss 💬';
      discuss.addEventListener('click',()=>{state.view='community';state.communityCategory=null;state.communityTopic=null;render();});
      card.appendChild(discuss);
    }
    list.appendChild(card);
  });
  els.content.appendChild(list);
}

function renderTools() {
  setHeader('Teacher Tools', ['Tools']);
  if (!state.tools.length) {
    els.content.innerHTML = '<div class="empty-state">No external tools are available for this account.</div>';
    return;
  }
  const list = document.createElement('div'); list.className='tool-list';
  state.tools.forEach(tool => {
    const card = document.createElement('article'); card.className='tool-card';
    card.innerHTML = `<h3>${escapeHtml(tool.icon || '🧰')} ${escapeHtml(tool.name)}</h3><p>${escapeHtml(tool.description || 'Open external tool')}</p>`;
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Open in new tab ↗';
    btn.addEventListener('click',()=>window.open(tool.url,'_blank','noopener,noreferrer'));
    card.appendChild(btn); list.appendChild(card);
  });
  els.content.appendChild(list);
}

async function loadAdminUsers() {
  if (!isStaff()) return;
  const { data, error } = await state.client.from('profiles').select('*').order('username');
  if (!error) state.adminUsers = data || [];
}

async function loadPackages() {
  if (!isStaff()) return;
  const { data, error } = await state.client.from('access_packages').select('*').order('name');
  state.packages = error ? [] : (data || []);
}

async function loadAccessGroups() {
  if (!isStaff()) return;
  const { data, error } = await state.client.from('access_groups').select('*').order('name');
  state.accessGroups = error ? [] : (data || []);
  if (state.selectedAccessGroup) {
    state.selectedAccessGroup = state.accessGroups.find(g => g.id === state.selectedAccessGroup.id) || null;
  }
}

async function logAudit(action, entityType = null, entityId = null, details = {}) {
  if (!isStaff()) return;
  try {
    await state.client.from('audit_log').insert({
      actor_id: state.session.user.id,
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      details
    });
  } catch { /* audit logging must never block the main action */ }
}

function renderAdmin() {
  setHeader(isOwner() ? 'Owner Administration' : 'Administrator', ['Admin']);
  const pendingCount = state.adminUsers.filter(u => u.status === 'pending').length;
  const tabs = [
    ['dashboard','📊 Dashboard'],
    ['requests',`👥 Requests${pendingCount?` (${pendingCount})`:''}`],
    ['users','👤 Users & Access'],
    ['groups','👥 Access Groups'],
    ['packages','🎟 Access Packages'],
    ['content','🎮 Activities'],
    ['structure','📚 Content Structure'],
    ['tools','🧰 Teacher Tools'],
    ['communityAdmin','💬 Community'],
    ['design','🎨 Design Studio'],
    ['settings','⚙️ Settings'],
    ['audit','🧾 Audit Log']
  ];
  const wrap = document.createElement('div'); wrap.className='admin-wrap';
  wrap.innerHTML = `
    <aside class="admin-sidebar"><div class="admin-tabs">
      ${tabs.map(([id,label])=>`<button class="btn btn-ghost ${state.adminTab===id?'active':''}" data-tab="${id}">${label}</button>`).join('')}
    </div></aside>
    <section class="admin-panel" id="adminPanel"></section>`;
  els.content.appendChild(wrap);
  wrap.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', async () => {
    state.adminTab = btn.dataset.tab;
    await Promise.all([loadAdminUsers(), loadPackages(), loadAccessGroups()]);
    render();
  }));
  const panel = wrap.querySelector('#adminPanel');
  if (state.adminTab === 'dashboard') renderAdminDashboard(panel);
  if (state.adminTab === 'requests') renderAdminRequests(panel);
  if (state.adminTab === 'users') renderAdminUsers(panel);
  if (state.adminTab === 'groups') renderAdminGroups(panel);
  if (state.adminTab === 'packages') renderAdminPackages(panel);
  if (state.adminTab === 'content') renderAdminContent(panel);
  if (state.adminTab === 'structure') renderAdminStructure(panel);
  if (state.adminTab === 'tools') renderAdminTools(panel);
  if (state.adminTab === 'communityAdmin') renderAdminCommunity(panel);
  if (state.adminTab === 'design') renderAdminDesign(panel);
  if (state.adminTab === 'settings') renderAdminSettings(panel);
  if (state.adminTab === 'audit') renderAdminAudit(panel);
}

async function renderAdminDashboard(panel) {
  panel.innerHTML = '<h2>Dashboard</h2><div id="dashArea">Loading…</div>';
  const [activityCount, toolCount] = await Promise.all([
    state.client.from('activities').select('*', { count:'exact', head:true }),
    state.client.from('external_tools').select('*', { count:'exact', head:true })
  ]);
  if (state.adminTab !== 'dashboard') return;
  const pending = state.adminUsers.filter(u=>u.status==='pending').length;
  const active = state.adminUsers.filter(u=>u.status==='active').length;
  const area = panel.querySelector('#dashArea');
  area.innerHTML = `
    <div class="dashboard-grid">
      <div class="dashboard-card"><strong>${state.adminUsers.length}</strong><span>Total accounts</span></div>
      <div class="dashboard-card"><strong>${active}</strong><span>Active accounts</span></div>
      <div class="dashboard-card"><strong>${pending}</strong><span>Pending requests</span></div>
      <div class="dashboard-card"><strong>${state.years.length}</strong><span>School years</span></div>
      <div class="dashboard-card"><strong>${state.units.length}</strong><span>Published units</span></div>
      <div class="dashboard-card"><strong>${activityCount.count ?? 0}</strong><span>Activities</span></div>
    </div>
    <hr class="soft">
    <div class="button-row">
      <button id="exportBackup" class="btn btn-accent">Download JSON Backup</button>
      <button id="refreshDashboard" class="btn btn-ghost">Refresh</button>
    </div>
    <p class="admin-note">Teacher tools: ${toolCount.count ?? 0}. Dynamic Access Groups: ${state.accessGroups.length}. Registration: ${state.settings.registration_enabled ? 'ON' : 'OFF'}. Community: ${state.settings.community_enabled ? 'ON' : 'OFF'}.</p>`;
  area.querySelector('#exportBackup').addEventListener('click', exportAdminBackup);
  area.querySelector('#refreshDashboard').addEventListener('click', ()=>renderAdminDashboard(panel));
}

async function exportAdminBackup() {
  const tables = ['profiles','school_years','grades','units','activities','user_unit_access','access_packages','access_package_units','access_groups','access_group_members','access_group_rules','external_tools','portal_settings','forum_categories','forum_topics','forum_posts'];
  const backup = { exported_at:new Date().toISOString(), version:'1.4', data:{} };
  for (const table of tables) {
    const { data, error } = await state.client.from(table).select('*');
    backup.data[table] = error ? { error:error.message } : data;
  }
  const blob = new Blob([JSON.stringify(backup,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`learning-hub-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(a.href);
  await logAudit('backup_exported','system',null,{});
}

function renderAdminRequests(panel) {
  const pending = state.adminUsers.filter(u => u.status === 'pending');
  panel.innerHTML = `<h2>Registration Requests</h2><p class="admin-note">Public registrations never receive content until you approve them.</p><div id="requestList"></div>`;
  const list = panel.querySelector('#requestList');
  if (!pending.length) { list.innerHTML = '<div class="empty-state" style="height:120px">No pending registrations.</div>'; return; }
  pending.forEach(user => {
    const card = document.createElement('div'); card.className='request-card';
    card.innerHTML = `<header><div><strong>${escapeHtml(user.display_name || user.username)}</strong><br><small>${escapeHtml(user.username)} · ${escapeHtml(user.contact_email || 'No contact email')}</small></div><span class="status-pill pending">Pending</span></header><div class="request-actions" style="margin-top:.55em"><button class="btn btn-accent btn-small" data-approve>Approve</button><button class="btn btn-danger btn-small" data-reject>Reject</button></div>`;
    card.querySelector('[data-approve]').addEventListener('click', async () => {
      const { error } = await state.client.from('profiles').update({status:'active'}).eq('id', user.id);
      if (error) return toast(error.message);
      await logAudit('registration_approved','profile',user.id,{username:user.username});
      toast(`${user.username} approved. Now choose unit access in Users & Access.`); await loadAdminUsers(); render();
    });
    card.querySelector('[data-reject]').addEventListener('click', async () => {
      if (!confirm(`Reject ${user.username}?`)) return;
      const { error } = await state.client.from('profiles').update({status:'rejected'}).eq('id', user.id);
      if (error) return toast(error.message);
      await logAudit('registration_rejected','profile',user.id,{username:user.username});
      toast('Registration rejected.'); await loadAdminUsers(); render();
    });
    list.appendChild(card);
  });
}

function renderAdminUsers(panel) {
  panel.innerHTML = `
    <h2>Users & Unit Access</h2>
    <div class="admin-form-grid">
      <label>Username<input id="newUsername" placeholder="teacher01"></label>
      <label>Display name<input id="newDisplayName" placeholder="Teacher Name"></label>
      <label>Contact email<input id="newContactEmail" type="email" placeholder="teacher@example.com"></label>
      <label>Password<input id="newPassword" type="password" placeholder="Minimum 8 characters"></label>
      <div class="wide"><button id="createUserBtn" class="btn btn-accent" type="button">+ Create Active User</button></div>
    </div>
    <hr class="soft">
    <div class="admin-form-grid" style="grid-template-columns:.75fr 1.25fr">
      <div><h3>Accounts</h3><div class="user-list" id="userList"></div></div>
      <div id="permissionEditor"><p class="admin-note">Select a user to control role, status, notes and exact unit access.</p></div>
    </div>`;
  panel.querySelector('#createUserBtn').addEventListener('click', createUserFromAdmin);
  const userList = panel.querySelector('#userList');
  state.adminUsers.filter(u => u.status !== 'pending').forEach(user => {
    const row = document.createElement('button'); row.className=`user-row ${state.selectedAdminUser?.id===user.id?'active':''}`;
    row.innerHTML = `<span><strong>${escapeHtml(user.username || 'user')}</strong><br><small>${escapeHtml(user.display_name || '')}</small></span><span>${roleBadge(user.role)}<br><small>${escapeHtml(user.status)}</small></span>`;
    row.addEventListener('click', async () => {
      state.selectedAdminUser=user; renderAdminUserPermissions(panel.querySelector('#permissionEditor'),user);
      userList.querySelectorAll('.user-row').forEach(x=>x.classList.remove('active')); row.classList.add('active');
    });
    userList.appendChild(row);
  });
  if (state.selectedAdminUser) renderAdminUserPermissions(panel.querySelector('#permissionEditor'), state.selectedAdminUser);
}

async function createUserFromAdmin() {
  const username = document.getElementById('newUsername').value.trim();
  const displayName = document.getElementById('newDisplayName').value.trim();
  const contactEmail = document.getElementById('newContactEmail').value.trim();
  const password = document.getElementById('newPassword').value;
  if (!username || password.length < 8) return toast('Add a username and a password of at least 8 characters.');
  const { data: { session } } = await state.client.auth.getSession();
  const res = await fetch('/api/admin/create-user', {
    method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
    body:JSON.stringify({username,displayName,contactEmail,password})
  });
  const body = await res.json().catch(()=>({}));
  if (!res.ok) return toast(body.error || 'Could not create user.');
  await logAudit('user_created','profile',body.id,{username});
  toast(`User ${username} created.`); state.selectedAdminUser=null; await loadAdminUsers(); render();
}

async function renderAdminUserPermissions(container, user) {
  container.innerHTML='<p class="admin-note">Loading access…</p>';
  const [{ data: access, error }, { data: packageUnits }, { data: memberships }] = await Promise.all([
    state.client.from('user_unit_access').select('*').eq('user_id', user.id),
    state.client.from('access_package_units').select('*'),
    state.client.from('access_group_members').select('group_id').eq('user_id', user.id)
  ]);
  if (error) { container.textContent=error.message; return; }
  const checked = new Set((access||[]).map(a=>a.unit_id));
  const groupIds = new Set((memberships||[]).map(m=>m.group_id));
  const memberGroups = state.accessGroups.filter(g=>groupIds.has(g.id));
  const roleOptions = ['user','admin','owner'].map(r=>option(r,r[0].toUpperCase()+r.slice(1),user.role)).join('');
  const isTargetStaff = ['admin','owner'].includes(user.role);

  container.innerHTML = `
    <h3>${escapeHtml(user.username || '')} ${roleBadge(user.role)}</h3>
    <p class="admin-note">${escapeHtml(user.contact_email || 'No contact email')}</p>
    <div class="admin-form-grid">
      <label>Status<select id="userStatus">${['active','inactive','rejected'].map(s=>option(s,s[0].toUpperCase()+s.slice(1),user.status)).join('')}</select></label>
      <label>Expiry date<input id="userExpiry" type="date"></label>
      <label>Account tag<input id="userTag" placeholder="School / Trial / VIP" value="${escapeHtml(user.account_tag || '')}"></label>
      <label>Role<select id="userRole" ${isOwner() ? '' : 'disabled'}>${roleOptions}</select></label>
      <label class="wide">Private admin notes<textarea id="userNotes" rows="2" placeholder="Internal notes only">${escapeHtml(user.admin_notes || '')}</textarea></label>
    </div>
    ${!isOwner()?'<p class="admin-note">Only the Owner can promote or demote administrators.</p>':''}
    ${isTargetStaff ? `
      <div class="full-access-card"><strong>✅ FULL PORTAL ACCESS</strong><p>Admin and Owner accounts automatically have access to every current and future Year, Grade, Unit and Game. No Unit checkboxes are required.</p></div>
      <button id="savePermissions" class="btn btn-accent" type="button">Save Profile</button>
    ` : `
      <div class="group-summary"><strong>Dynamic Access Groups</strong><p class="admin-note">${memberGroups.length ? memberGroups.map(g=>escapeHtml(g.name)).join(' · ') : 'No Access Group assigned.'}</p></div>
      <div class="admin-form-grid" style="margin-top:.55em">
        <label>Apply access package<select id="packageSelect"><option value="">Choose package…</option>${state.packages.filter(p=>p.active).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select></label>
        <div style="display:flex;align-items:end"><button id="applyPackage" class="btn btn-small btn-ghost">Apply Package</button></div>
      </div>
      <div style="display:flex;gap:.45em;margin:.6em 0;flex-wrap:wrap"><button id="allAccess" class="btn btn-small btn-ghost">All Current Units</button><button id="unit1All" class="btn btn-small btn-ghost">Unit 1 · All Grades</button><button id="clearAccess" class="btn btn-small btn-ghost">Clear Direct Access</button><button id="previewEffective" class="btn btn-small btn-accent">Preview Effective Access</button></div>
      <div id="permissionMatrix"></div><button id="savePermissions" class="btn btn-accent" type="button">Save User</button>
    `}`;
  if (user.expires_at) container.querySelector('#userExpiry').value = new Date(user.expires_at).toISOString().slice(0,10);

  if (!isTargetStaff) {
    const matrix=container.querySelector('#permissionMatrix');
    state.years.forEach(year=>{
      const y=document.createElement('div'); y.className='permission-group'; y.innerHTML=`<strong>${escapeHtml(year.name)}</strong>`;
      state.grades.filter(g=>g.school_year_id===year.id).forEach(grade=>{
        const units=state.units.filter(u=>u.grade_id===grade.id); const row=document.createElement('div');
        row.innerHTML=`<div class="permission-grade"><span>${escapeHtml(grade.name)}</span><button class="btn btn-small btn-ghost" data-grade-all="${grade.id}">All</button></div>`;
        const unitWrap=document.createElement('div'); unitWrap.className='permission-units';
        units.forEach(unit=>{ const label=document.createElement('label'); label.innerHTML=`<input type="checkbox" data-unit-id="${unit.id}" ${checked.has(unit.id)?'checked':''}> ${escapeHtml(unit.name)}`; unitWrap.appendChild(label); });
        row.appendChild(unitWrap); y.appendChild(row);
      }); matrix.appendChild(y);
    });
    container.querySelectorAll('[data-grade-all]').forEach(btn=>btn.addEventListener('click',()=>{
      const ids=state.units.filter(u=>u.grade_id===btn.dataset.gradeAll).map(u=>u.id);
      container.querySelectorAll('[data-unit-id]').forEach(cb=>{ if(ids.includes(cb.dataset.unitId)) cb.checked=true; });
    }));
    container.querySelector('#allAccess').addEventListener('click',()=>container.querySelectorAll('[data-unit-id]').forEach(cb=>cb.checked=true));
    container.querySelector('#clearAccess').addEventListener('click',()=>container.querySelectorAll('[data-unit-id]').forEach(cb=>cb.checked=false));
    container.querySelector('#unit1All').addEventListener('click',()=>container.querySelectorAll('[data-unit-id]').forEach(cb=>{ const unit=state.units.find(u=>u.id===cb.dataset.unitId); if(unit?.name.trim().toLowerCase()==='unit 1') cb.checked=true; }));
    container.querySelector('#applyPackage').addEventListener('click',()=>{
      const id=container.querySelector('#packageSelect').value; if(!id)return toast('Choose a package first.');
      const ids=(packageUnits||[]).filter(x=>x.package_id===id).map(x=>x.unit_id);
      container.querySelectorAll('[data-unit-id]').forEach(cb=>{ if(ids.includes(cb.dataset.unitId)) cb.checked=true; });
      toast('Package added to the current selection. Press Save User to confirm.');
    });
    container.querySelector('#previewEffective').addEventListener('click',async()=>{
      const {data,error:e}=await state.client.rpc('effective_unit_ids_for_user',{target_user:user.id});
      if(e)return toast(e.message);
      const ids=new Set((data||[]).map(x=>x.unit_id));
      const paths=state.units.filter(u=>ids.has(u.id)).map(u=>unitPath(u.id));
      alert(paths.length ? `Effective access for ${user.username}:\n\n${paths.join('\n')}` : `${user.username} currently has no effective Unit access.`);
    });
  }
  container.querySelector('#savePermissions').addEventListener('click',()=>saveUserAndPermissions(container,user));
}

async function saveUserAndPermissions(container,user) {
  const status=container.querySelector('#userStatus').value;
  const role=container.querySelector('#userRole').value;
  const expiryRaw=container.querySelector('#userExpiry').value;
  const expiresAt=expiryRaw?new Date(`${expiryRaw}T23:59:59`).toISOString():null;
  const profilePatch = {
    status, expires_at:expiresAt,
    account_tag:container.querySelector('#userTag').value.trim() || null,
    admin_notes:container.querySelector('#userNotes').value.trim() || null
  };
  if (isOwner()) profilePatch.role = role;
  const {error:profileError}=await state.client.from('profiles').update(profilePatch).eq('id',user.id);
  if(profileError) return toast(profileError.message);

  // Staff never need direct Unit rows. Their role grants complete access automatically.
  if (!['admin','owner'].includes(role)) {
    const selected=[...container.querySelectorAll('[data-unit-id]:checked')].map(cb=>cb.dataset.unitId);
    const {error:deleteError}=await state.client.from('user_unit_access').delete().eq('user_id',user.id);
    if(deleteError) return toast(deleteError.message);
    if(selected.length){
      const rows=selected.map(unitId=>({user_id:user.id,unit_id:unitId,granted_by:state.session.user.id}));
      const {error:insertError}=await state.client.from('user_unit_access').insert(rows);
      if(insertError) return toast(insertError.message);
    }
    await logAudit('user_updated','profile',user.id,{username:user.username,role:profilePatch.role||user.role,status,direct_units:selected.length});
  } else {
    await logAudit('staff_profile_updated','profile',user.id,{username:user.username,role,status,full_access:true});
  }
  Object.assign(user, profilePatch);
  toast(`User ${user.username} saved.`);
  await loadAdminUsers(); render();
}

function packageMatrixHtml(checked = new Set()) {
  return state.years.map(year=>{
    const grades = state.grades.filter(g=>g.school_year_id===year.id);
    return `<div class="permission-group"><strong>${escapeHtml(year.name)}</strong>${grades.map(grade=>{
      const units=state.units.filter(u=>u.grade_id===grade.id);
      return `<div class="permission-grade"><span>${escapeHtml(grade.name)}</span></div><div class="permission-units">${units.map(u=>`<label><input type="checkbox" data-package-unit="${u.id}" ${checked.has(u.id)?'checked':''}> ${escapeHtml(u.name)}</label>`).join('')}</div>`;
    }).join('')}</div>`;
  }).join('');
}

async function renderAdminPackages(panel) {
  panel.innerHTML=`
    <h2>Access Packages</h2><p class="admin-note">Create reusable access presets such as “All Grades — Unit 1”, “Grade 5 Full” or “School Full Access”.</p>
    <div class="admin-form-grid"><label>Name<input id="packageName" placeholder="All Grades — Unit 1"></label><label>Description<input id="packageDescription" placeholder="Optional note"></label></div>
    <div id="packageMatrix">${packageMatrixHtml()}</div>
    <button id="savePackage" class="btn btn-accent">+ Create Package</button>
    <hr class="soft"><div id="packageList" class="package-list"></div>`;
  panel.querySelector('#savePackage').addEventListener('click',async()=>{
    const name=panel.querySelector('#packageName').value.trim(); const description=panel.querySelector('#packageDescription').value.trim();
    const unitIds=[...panel.querySelectorAll('[data-package-unit]:checked')].map(x=>x.dataset.packageUnit);
    if(!name || !unitIds.length)return toast('Add a package name and select at least one unit.');
    const {data,error}=await state.client.from('access_packages').insert({name,description:description||null,active:true,created_by:state.session.user.id}).select().single();
    if(error)return toast(error.message);
    const rows=unitIds.map(unit_id=>({package_id:data.id,unit_id}));
    const {error:e2}=await state.client.from('access_package_units').insert(rows); if(e2)return toast(e2.message);
    await logAudit('package_created','access_package',data.id,{name,units:unitIds.length});
    await loadPackages(); toast('Access package created.'); render();
  });
  const list=panel.querySelector('#packageList');
  if(!state.packages.length){list.innerHTML='<p class="admin-note">No packages yet.</p>';return;}
  const {data:allUnits}=await state.client.from('access_package_units').select('*');
  state.packages.forEach(pkg=>{
    const ids=(allUnits||[]).filter(x=>x.package_id===pkg.id).map(x=>x.unit_id);
    const card=document.createElement('div'); card.className='package-card';
    card.innerHTML=`<div class="package-head"><div><strong>${escapeHtml(pkg.name)}</strong><div class="meta">${escapeHtml(pkg.description||'')}</div></div><div class="actions"><button class="btn btn-small btn-ghost" data-toggle>${pkg.active?'Disable':'Enable'}</button><button class="btn btn-small btn-danger" data-delete>Delete</button></div></div><div class="package-units">${ids.map(unitPath).filter(Boolean).join(' · ') || 'No units'}</div>`;
    card.querySelector('[data-toggle]').addEventListener('click',async()=>{const {error}=await state.client.from('access_packages').update({active:!pkg.active}).eq('id',pkg.id);if(error)toast(error.message);else{await logAudit('package_toggled','access_package',pkg.id,{active:!pkg.active});await loadPackages();render();}});
    card.querySelector('[data-delete]').addEventListener('click',async()=>{if(!confirm(`Delete package ${pkg.name}?`))return;const {error}=await state.client.from('access_packages').delete().eq('id',pkg.id);if(error)toast(error.message);else{await logAudit('package_deleted','access_package',pkg.id,{name:pkg.name});await loadPackages();render();}});
    list.appendChild(card);
  });
}

function buildHierarchyOptions() {
  return { yearOptions: state.years.map(y=>`<option value="${y.id}">${escapeHtml(y.name)}</option>`).join('') };
}

function allUnitOptions(selectedId='') {
  return state.units.map(u=>`<option value="${u.id}" ${u.id===selectedId?'selected':''}>${escapeHtml(unitPath(u.id))}</option>`).join('');
}

function renderAdminContent(panel) {
  const {yearOptions}=buildHierarchyOptions();
  panel.innerHTML=`
    <h2>Games & Activities</h2>
    <p class="admin-note">v1.3 Secure Launcher keeps the real game URL in a protected table. Members only receive a secure PLAY link.</p>
    <div class="admin-form-grid">
      <label>Year<select id="activityYear">${yearOptions}</select></label><label>Grade<select id="activityGrade"></select></label>
      <label>Unit<select id="activityUnit"></select></label><label>Type<select id="activityType"><option>Game</option><option>Interactive Lesson</option><option>Worksheet</option><option>Quiz</option><option>External Link</option></select></label>
      <label>Security<select id="activitySecurity"><option value="unit" selected>Unit Protected</option><option value="members">Any Active Member</option><option value="public">Public</option></select></label>
      <label>Launch token life<select id="activityTtl"><option value="120">2 minutes</option><option value="180" selected>3 minutes</option><option value="300">5 minutes</option><option value="600">10 minutes</option></select></label>
      <label class="wide">Title<input id="activityTitle" placeholder="Numbers Challenge"></label>
      <label class="wide">Real Game URL <span class="field-help">(Admin only)</span><input id="activityUrl" type="url" placeholder="https://your-game.vercel.app"></label>
      <label>Direct Game Gate<select id="activityGate"><option value="false">Not installed / unsure</option><option value="true">Installed</option></select></label>
      <label>Security note<input id="activitySecurityNote" placeholder="Private GitHub repo, gate checked..."></label>
      <div class="wide"><button id="addActivity" class="btn btn-accent">+ Publish Secure Activity</button></div>
    </div><hr class="soft"><h3>Existing activities</h3><div id="activityManageList" class="manage-list"></div>`;
  const yearSel=panel.querySelector('#activityYear'), gradeSel=panel.querySelector('#activityGrade'), unitSel=panel.querySelector('#activityUnit');
  const refreshUnits=()=>{ const us=state.units.filter(u=>u.grade_id===gradeSel.value); unitSel.innerHTML=us.map(u=>`<option value="${u.id}">${escapeHtml(u.name)}</option>`).join(''); loadManagedActivities(panel); };
  const refreshGrades=()=>{ const gs=state.grades.filter(g=>g.school_year_id===yearSel.value); gradeSel.innerHTML=gs.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join(''); refreshUnits(); };
  yearSel.addEventListener('change',refreshGrades); gradeSel.addEventListener('change',refreshUnits); unitSel.addEventListener('change',()=>loadManagedActivities(panel)); refreshGrades();
  panel.querySelector('#addActivity').addEventListener('click',async()=>{
    const title=panel.querySelector('#activityTitle').value.trim();
    const targetUrl=panel.querySelector('#activityUrl').value.trim();
    const row={unit_id:unitSel.value,title,type:panel.querySelector('#activityType').value,launch_url:null,published:true,sort_order:10};
    if(!row.unit_id||!row.title||!targetUrl)return toast('Choose a unit and add a title and real game URL.');
    try { new URL(targetUrl); } catch { return toast('The game URL is not valid.'); }
    const {data,error}=await state.client.from('activities').insert(row).select().single();
    if(error)return toast(error.message);
    const target={activity_id:data.id,target_url:targetUrl,security_mode:panel.querySelector('#activitySecurity').value,launch_ttl_seconds:Number(panel.querySelector('#activityTtl').value),gate_installed:panel.querySelector('#activityGate').value==='true',security_notes:panel.querySelector('#activitySecurityNote').value.trim()||null,enabled:true};
    const {error:targetError}=await state.client.from('activity_targets').insert(target);
    if(targetError){ await state.client.from('activities').delete().eq('id',data.id); return toast(targetError.message); }
    await logAudit('secure_activity_created','activity',data.id,{title:row.title,unit_id:row.unit_id,security_mode:target.security_mode});
    toast('Secure activity published.'); panel.querySelector('#activityTitle').value=''; panel.querySelector('#activityUrl').value=''; loadManagedActivities(panel);
  });
}

async function loadManagedActivities(panel) {
  const unitId=panel.querySelector('#activityUnit')?.value; const list=panel.querySelector('#activityManageList'); if(!unitId||!list)return;
  list.innerHTML='Loading…';
  const {data,error}=await state.client.from('activities').select('id,unit_id,title,type,thumbnail_url,sort_order,published').eq('unit_id',unitId).order('sort_order');
  if(error){list.textContent=error.message;return;} list.innerHTML='';
  if(!data?.length){list.innerHTML='<p class="admin-note">No activities in this unit yet.</p>';return;}
  const ids=data.map(a=>a.id);
  const {data:targets}=await state.client.from('activity_targets').select('*').in('activity_id',ids);
  const targetMap=new Map((targets||[]).map(t=>[t.activity_id,t]));
  data.forEach(a=>{
    const target=targetMap.get(a.id);
    const mode=target?.security_mode||'not configured';
    const card=document.createElement('div'); card.className='manage-card';
    const gateStatus=target?.gate_installed?'🟢 Game Gate':'🟡 Gate not confirmed';
    card.innerHTML=`<div><strong>${escapeHtml(a.title)}</strong><div class="meta">${escapeHtml(a.type)} · ${a.published?'Published':'Hidden'} · 🔐 ${escapeHtml(mode)} · ${gateStatus}</div></div><div class="actions"><button class="btn btn-small btn-ghost" data-edit>Edit</button><button class="btn btn-small btn-ghost" data-gate>${target?.gate_installed?'Mark Gate Missing':'Mark Gate Installed'}</button><button class="btn btn-small btn-ghost" data-copy>Duplicate</button><select data-move style="width:auto;margin:0;padding:.35em .5em"><option value="">Move…</option>${allUnitOptions(a.unit_id)}</select><button class="btn btn-small btn-ghost" data-toggle>${a.published?'Hide':'Show'}</button></div>`;
    card.querySelector('[data-edit]').addEventListener('click',async()=>{
      const title=prompt('Activity title',a.title); if(title===null||!title.trim())return;
      const url=prompt('Real game URL (Admin only)',target?.target_url||''); if(url===null||!url.trim())return;
      try { new URL(url.trim()); } catch { return toast('The game URL is not valid.'); }
      const modeInput=(prompt('Security mode: unit, members, or public',target?.security_mode||'unit')||'').trim().toLowerCase();
      if(!['unit','members','public'].includes(modeInput))return toast('Security mode must be unit, members, or public.');
      const {error:e}=await state.client.from('activities').update({title:title.trim()}).eq('id',a.id); if(e)return toast(e.message);
      const {error:tErr}=await state.client.from('activity_targets').upsert({activity_id:a.id,target_url:url.trim(),security_mode:modeInput,launch_ttl_seconds:target?.launch_ttl_seconds||180,gate_installed:target?.gate_installed||false,security_notes:target?.security_notes||null,enabled:true},{onConflict:'activity_id'});
      if(tErr)return toast(tErr.message);
      await logAudit('secure_activity_updated','activity',a.id,{title:title.trim(),security_mode:modeInput});toast('Activity updated.');loadManagedActivities(panel);
    });
    card.querySelector('[data-gate]').addEventListener('click',async()=>{
      if(!target)return toast('Secure target is not configured.');
      const next=!target.gate_installed;
      const {error:e}=await state.client.from('activity_targets').update({gate_installed:next}).eq('activity_id',a.id);
      if(e)toast(e.message);else{await logAudit('game_gate_status_changed','activity',a.id,{gate_installed:next});toast(`Game Gate marked ${next?'installed':'missing'}.`);loadManagedActivities(panel);}
    });
    card.querySelector('[data-copy]').addEventListener('click',async()=>{
      const title=prompt('Title for the copy',`${a.title} Copy`); if(title===null||!title.trim())return;
      if(!target?.target_url)return toast('This activity has no protected target to copy.');
      const {data:copy,error:e}=await state.client.from('activities').insert({unit_id:a.unit_id,title:title.trim(),type:a.type,launch_url:null,thumbnail_url:a.thumbnail_url,sort_order:(a.sort_order||0)+1,published:a.published}).select().single();
      if(e)return toast(e.message);
      const {error:tErr}=await state.client.from('activity_targets').insert({activity_id:copy.id,target_url:target.target_url,security_mode:target.security_mode,launch_ttl_seconds:target.launch_ttl_seconds,gate_installed:target.gate_installed||false,security_notes:target.security_notes||null,enabled:target.enabled});
      if(tErr){await state.client.from('activities').delete().eq('id',copy.id);return toast(tErr.message);}
      await logAudit('secure_activity_duplicated','activity',copy.id,{source:a.id});toast('Activity duplicated.');loadManagedActivities(panel);
    });
    card.querySelector('[data-move]').addEventListener('change',async(e)=>{
      const moveTo=e.target.value; if(!moveTo||moveTo===a.unit_id)return;
      const {error:moveError}=await state.client.from('activities').update({unit_id:moveTo}).eq('id',a.id); if(moveError)toast(moveError.message);else{await logAudit('activity_moved','activity',a.id,{to:moveTo});toast('Activity moved.');loadManagedActivities(panel);}
    });
    card.querySelector('[data-toggle]').addEventListener('click',async()=>{ const {error:e}=await state.client.from('activities').update({published:!a.published}).eq('id',a.id); if(e)toast(e.message);else{await logAudit('activity_visibility_changed','activity',a.id,{published:!a.published});toast(a.published?'Activity hidden.':'Activity published.');loadManagedActivities(panel);} });
    list.appendChild(card);
  });
}

function renderAdminStructure(panel) {
  const {yearOptions}=buildHierarchyOptions();
  panel.innerHTML=`
    <h2>Content Structure</h2><p class="admin-note">Add, rename, duplicate or archive years and grades. Add, duplicate, edit or hide units. Archived content stays in the database.</p>
    <div class="admin-form-grid"><label>New year<input id="newYear" placeholder="2027"></label><div style="display:flex;align-items:end"><button id="addYear" class="btn btn-accent">+ Year</button></div></div>
    <hr class="soft">
    <div class="admin-form-grid"><label>Year<select id="structureYear">${yearOptions}</select></label><label>New grade<input id="newGrade" placeholder="Grade 3"></label><div class="wide"><button id="addGrade" class="btn btn-accent">+ Grade</button></div></div>
    <hr class="soft">
    <div class="admin-form-grid"><label>Year<select id="unitYear">${yearOptions}</select></label><label>Grade<select id="unitGrade"></select></label><label>Unit name<input id="newUnitName" placeholder="Unit 3"></label><label>Unit title<input id="newUnitTitle" placeholder="At School"></label><div class="wide"><button id="addUnit" class="btn btn-accent">+ Unit</button></div></div>
    <div class="admin-form-grid" style="margin-top:.55em"><label>Create units from<input id="bulkFrom" type="number" min="1" value="1"></label><label>to<input id="bulkTo" type="number" min="1" value="10"></label><div class="wide"><button id="bulkUnits" class="btn btn-ghost">Bulk Create Units</button></div></div>
    <hr class="soft"><h3>Current structure</h3><div id="structureTree" class="structure-tree"></div>
    <hr class="soft"><h3>Archived / Hidden</h3><div id="archivedTree" class="manage-list">Loading…</div>`;
  const unitYear=panel.querySelector('#unitYear'), unitGrade=panel.querySelector('#unitGrade');
  const fillUnitGrades=()=>{unitGrade.innerHTML=state.grades.filter(g=>g.school_year_id===unitYear.value).map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');};
  unitYear.addEventListener('change',fillUnitGrades); fillUnitGrades();
  panel.querySelector('#addYear').addEventListener('click',async()=>{ const name=panel.querySelector('#newYear').value.trim(); if(!name)return; const {data,error}=await state.client.from('school_years').insert({name,sort_order:Number(name)||9999,archived:false}).select().single(); if(error)toast(error.message);else{await logAudit('year_created','year',data.id,{name});await adminStructureRefresh('Year added.');} });
  panel.querySelector('#addGrade').addEventListener('click',async()=>{ const name=panel.querySelector('#newGrade').value.trim(),school_year_id=panel.querySelector('#structureYear').value; if(!name||!school_year_id)return; const order=Number((name.match(/\d+/)||['99'])[0]); const {data,error}=await state.client.from('grades').insert({school_year_id,name,sort_order:order,archived:false}).select().single(); if(error)toast(error.message);else{await logAudit('grade_created','grade',data.id,{name});await adminStructureRefresh('Grade added.');} });
  panel.querySelector('#addUnit').addEventListener('click',async()=>{ const grade_id=unitGrade.value,name=panel.querySelector('#newUnitName').value.trim(),title=panel.querySelector('#newUnitTitle').value.trim(); if(!grade_id||!name)return; const order=Number((name.match(/\d+/)||['99'])[0]); const {data,error}=await state.client.from('units').insert({grade_id,name,title:title||null,sort_order:order,is_published:true}).select().single(); if(error)toast(error.message);else{await logAudit('unit_created','unit',data.id,{name,grade_id});await adminStructureRefresh('Unit added.');} });
  panel.querySelector('#bulkUnits').addEventListener('click',async()=>{
    const grade_id=unitGrade.value, from=Number(panel.querySelector('#bulkFrom').value), to=Number(panel.querySelector('#bulkTo').value);
    if(!grade_id||!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<from||to-from>50)return toast('Choose a grade and a valid range of up to 50 units.');
    const rows=[]; for(let n=from;n<=to;n++)rows.push({grade_id,name:`Unit ${n}`,sort_order:n,is_published:true});
    const {error}=await state.client.from('units').upsert(rows,{onConflict:'grade_id,name',ignoreDuplicates:true}); if(error)toast(error.message);else{await logAudit('units_bulk_created','grade',grade_id,{from,to});await adminStructureRefresh('Units created.');}
  });
  renderStructureTree(panel.querySelector('#structureTree'));
  renderArchivedStructure(panel.querySelector('#archivedTree'));
}

function renderStructureTree(tree) {
  tree.innerHTML='';
  state.years.forEach(year=>{
    const y=document.createElement('div'); y.className='structure-year';
    y.innerHTML=`<div class="structure-row"><strong>📚 ${escapeHtml(year.name)}</strong><div class="structure-actions"><button class="btn btn-small btn-ghost" data-rename-year>Rename</button><button class="btn btn-small btn-ghost" data-copy-year>Duplicate</button><button class="btn btn-small btn-danger" data-archive-year>Archive</button></div></div><div data-grades></div>`;
    y.querySelector('[data-rename-year]').addEventListener('click',()=>renameItem('school_years',year,'Year'));
    y.querySelector('[data-copy-year]').addEventListener('click',()=>duplicateYear(year));
    y.querySelector('[data-archive-year]').addEventListener('click',()=>archiveItem('school_years',year,'Year'));
    const gradesWrap=y.querySelector('[data-grades]');
    state.grades.filter(g=>g.school_year_id===year.id).forEach(grade=>{
      const g=document.createElement('div'); g.className='structure-grade';
      g.innerHTML=`<div class="structure-row"><strong>🎒 ${escapeHtml(grade.name)}</strong><div class="structure-actions"><button class="btn btn-small btn-ghost" data-rename-grade>Rename</button><button class="btn btn-small btn-ghost" data-copy-grade>Duplicate</button><button class="btn btn-small btn-danger" data-archive-grade>Archive</button></div></div><div data-units></div>`;
      g.querySelector('[data-rename-grade]').addEventListener('click',()=>renameItem('grades',grade,'Grade'));
      g.querySelector('[data-copy-grade]').addEventListener('click',()=>duplicateGrade(grade));
      g.querySelector('[data-archive-grade]').addEventListener('click',()=>archiveItem('grades',grade,'Grade'));
      const unitsWrap=g.querySelector('[data-units]');
      state.units.filter(u=>u.grade_id===grade.id).forEach(unit=>{
        const u=document.createElement('div'); u.className='structure-unit';
        u.innerHTML=`<span>⭐ <strong>${escapeHtml(unit.name)}</strong>${unit.title?` — ${escapeHtml(unit.title)}`:''}</span><div class="structure-actions"><button class="btn btn-small btn-ghost" data-edit-unit>Edit</button><button class="btn btn-small btn-ghost" data-copy-unit>Duplicate</button><button class="btn btn-small btn-danger" data-hide-unit>Hide</button></div>`;
        u.querySelector('[data-edit-unit]').addEventListener('click',()=>editUnit(unit));
        u.querySelector('[data-copy-unit]').addEventListener('click',()=>duplicateUnit(unit));
        u.querySelector('[data-hide-unit]').addEventListener('click',()=>hideUnit(unit));
        unitsWrap.appendChild(u);
      });
      gradesWrap.appendChild(g);
    }); tree.appendChild(y);
  });
}

async function renderArchivedStructure(container) {
  const [years,grades,units]=await Promise.all([
    state.client.from('school_years').select('*').eq('archived',true).order('sort_order'),
    state.client.from('grades').select('*').eq('archived',true).order('sort_order'),
    state.client.from('units').select('*').eq('is_published',false).order('sort_order')
  ]);
  if(state.adminTab!=='structure')return;
  const items=[];
  (years.data||[]).forEach(x=>items.push({label:`Year ${x.name}`,table:'school_years',id:x.id,patch:{archived:false}}));
  (grades.data||[]).forEach(x=>items.push({label:`Grade ${x.name}`,table:'grades',id:x.id,patch:{archived:false}}));
  (units.data||[]).forEach(x=>items.push({label:`Unit ${x.name}`,table:'units',id:x.id,patch:{is_published:true}}));
  container.innerHTML='';
  if(!items.length){container.innerHTML='<p class="admin-note">Nothing archived or hidden.</p>';return;}
  items.forEach(item=>{
    const card=document.createElement('div');card.className='manage-card';card.innerHTML=`<strong>${escapeHtml(item.label)}</strong><button class="btn btn-small btn-accent">Restore</button>`;
    card.querySelector('button').addEventListener('click',async()=>{const {error}=await state.client.from(item.table).update(item.patch).eq('id',item.id);if(error)toast(error.message);else{await logAudit('content_restored',item.table,item.id,{});await adminStructureRefresh('Item restored.');}});
    container.appendChild(card);
  });
}

async function renameItem(table,item,label) {
  const name=prompt(`${label} name`,item.name); if(name===null||!name.trim())return;
  const order=label==='Year'?(Number(name)||item.sort_order):Number((name.match(/\d+/)||[item.sort_order||99])[0]);
  const {error}=await state.client.from(table).update({name:name.trim(),sort_order:order}).eq('id',item.id); if(error)toast(error.message);else{await logAudit(`${label.toLowerCase()}_renamed`,label.toLowerCase(),item.id,{name:name.trim()});await adminStructureRefresh(`${label} renamed.`);}
}
async function archiveItem(table,item,label) {
  if(!confirm(`Archive ${item.name}? It will disappear from the normal portal but data will be kept.`))return;
  const {error}=await state.client.from(table).update({archived:true}).eq('id',item.id); if(error)toast(error.message);else{await logAudit(`${label.toLowerCase()}_archived`,label.toLowerCase(),item.id,{name:item.name});await adminStructureRefresh(`${label} archived.`);}
}
async function editUnit(unit) {
  const name=prompt('Unit name',unit.name); if(name===null||!name.trim())return;
  const title=prompt('Unit title (optional)',unit.title||''); if(title===null)return;
  const order=Number((name.match(/\d+/)||[unit.sort_order||99])[0]);
  const {error}=await state.client.from('units').update({name:name.trim(),title:title.trim()||null,sort_order:order}).eq('id',unit.id); if(error)toast(error.message);else{await logAudit('unit_updated','unit',unit.id,{name:name.trim()});await adminStructureRefresh('Unit updated.');}
}
async function hideUnit(unit) {
  if(!confirm(`Hide ${unit.name}?`))return;
  const {error}=await state.client.from('units').update({is_published:false}).eq('id',unit.id); if(error)toast(error.message);else{await logAudit('unit_hidden','unit',unit.id,{name:unit.name});await adminStructureRefresh('Unit hidden.');}
}

async function duplicateYear(year) {
  const newName=prompt('New year name',String(Number(year.name)||year.name)); if(newName===null||!newName.trim())return;
  const {data:newYear,error}=await state.client.from('school_years').insert({name:newName.trim(),sort_order:Number(newName)||9999,archived:false}).select().single(); if(error)return toast(error.message);
  const sourceGrades=state.grades.filter(g=>g.school_year_id===year.id);
  for(const grade of sourceGrades){
    const {data:newGrade,error:gErr}=await state.client.from('grades').insert({school_year_id:newYear.id,name:grade.name,sort_order:grade.sort_order,archived:false}).select().single(); if(gErr)continue;
    const sourceUnits=state.units.filter(u=>u.grade_id===grade.id);
    if(sourceUnits.length)await state.client.from('units').insert(sourceUnits.map(u=>({grade_id:newGrade.id,name:u.name,title:u.title,sort_order:u.sort_order,is_published:true})));
  }
  await logAudit('year_duplicated','year',newYear.id,{source:year.id}); await adminStructureRefresh('Year structure duplicated.');
}
async function duplicateGrade(grade) {
  const name=prompt('Name for duplicated grade',`${grade.name} Copy`); if(name===null||!name.trim())return;
  const {data:newGrade,error}=await state.client.from('grades').insert({school_year_id:grade.school_year_id,name:name.trim(),sort_order:(grade.sort_order||0)+1,archived:false}).select().single(); if(error)return toast(error.message);
  const sourceUnits=state.units.filter(u=>u.grade_id===grade.id);
  if(sourceUnits.length)await state.client.from('units').insert(sourceUnits.map(u=>({grade_id:newGrade.id,name:u.name,title:u.title,sort_order:u.sort_order,is_published:true})));
  await logAudit('grade_duplicated','grade',newGrade.id,{source:grade.id}); await adminStructureRefresh('Grade duplicated.');
}
async function duplicateUnit(unit) {
  const name=prompt('Name for duplicated unit',`${unit.name} Copy`); if(name===null||!name.trim())return;
  const {data:newUnit,error}=await state.client.from('units').insert({grade_id:unit.grade_id,name:name.trim(),title:unit.title,sort_order:(unit.sort_order||0)+1,is_published:true}).select().single(); if(error)return toast(error.message);
  if(confirm('Copy the activities from the original unit too?')){
    const {data:activities}=await state.client.from('activities').select('id,title,type,thumbnail_url,sort_order,published').eq('unit_id',unit.id);
    for(const a of (activities||[])){
      const {data:copy,error:copyError}=await state.client.from('activities').insert({unit_id:newUnit.id,title:a.title,type:a.type,launch_url:null,thumbnail_url:a.thumbnail_url,sort_order:a.sort_order,published:a.published}).select().single();
      if(copyError)continue;
      const {data:target}=await state.client.from('activity_targets').select('*').eq('activity_id',a.id).maybeSingle();
      if(target)await state.client.from('activity_targets').insert({activity_id:copy.id,target_url:target.target_url,security_mode:target.security_mode,launch_ttl_seconds:target.launch_ttl_seconds,gate_installed:target.gate_installed||false,security_notes:target.security_notes||null,enabled:target.enabled});
    }
  }
  await logAudit('unit_duplicated','unit',newUnit.id,{source:unit.id}); await adminStructureRefresh('Unit duplicated.');
}
async function adminStructureRefresh(message) { await loadStructure(); await loadOwnAccess(); toast(message); render(); }

function renderAdminTools(panel) {
  panel.innerHTML=`
    <h2>Teacher / External Tools</h2><p class="admin-note">Add your separate EFL Lesson Planner or any other website. The tool opens in a new browser tab and remains technically separate from this portal.</p>
    <div class="admin-form-grid">
      <label>Name<input id="toolName" placeholder="EFL Lesson Planner"></label>
      <label>Icon<input id="toolIcon" value="📝" maxlength="8"></label>
      <label class="wide">Description<input id="toolDescription" placeholder="Create EFL lesson plans"></label>
      <label class="wide">URL<input id="toolUrl" type="url" placeholder="https://planner.example.com"></label>
      <label>Audience<select id="toolAudience"><option value="all_members">All members</option><option value="staff_only">Admin + Owner only</option><option value="owner_only">Owner only</option></select></label>
      <label>Order<input id="toolOrder" type="number" value="10"></label>
      <div class="wide"><button id="addTool" class="btn btn-accent">+ Add Tool</button></div>
    </div><hr class="soft"><div id="toolManageList" class="manage-list"></div>`;
  panel.querySelector('#addTool').addEventListener('click',async()=>{
    const row={name:panel.querySelector('#toolName').value.trim(),icon:panel.querySelector('#toolIcon').value.trim()||'🧰',description:panel.querySelector('#toolDescription').value.trim()||null,url:panel.querySelector('#toolUrl').value.trim(),audience:panel.querySelector('#toolAudience').value,sort_order:Number(panel.querySelector('#toolOrder').value)||10,enabled:true};
    if(!row.name||!row.url)return toast('Add a tool name and URL.');
    const {data,error}=await state.client.from('external_tools').insert(row).select().single(); if(error)return toast(error.message);
    await logAudit('external_tool_created','external_tool',data.id,{name:row.name}); await loadExternalTools(); toast('Tool added.'); render();
  });
  loadManagedTools(panel);
}

async function loadManagedTools(panel) {
  const list=panel.querySelector('#toolManageList');
  const {data,error}=await state.client.from('external_tools').select('*').order('sort_order').order('name');
  if(error){list.textContent=error.message;return;} list.innerHTML='';
  if(!data?.length){list.innerHTML='<p class="admin-note">No external tools yet.</p>';return;}
  data.forEach(tool=>{
    const card=document.createElement('div');card.className='manage-card';
    card.innerHTML=`<div><strong>${escapeHtml(tool.icon)} ${escapeHtml(tool.name)}</strong><div class="meta">${escapeHtml(tool.audience)} · ${tool.enabled?'Enabled':'Disabled'}</div></div><div class="actions"><button class="btn btn-small btn-ghost" data-edit>Edit</button><button class="btn btn-small btn-ghost" data-toggle>${tool.enabled?'Disable':'Enable'}</button><button class="btn btn-small btn-danger" data-delete>Delete</button></div>`;
    card.querySelector('[data-edit]').addEventListener('click',async()=>{
      const name=prompt('Tool name',tool.name);if(name===null||!name.trim())return;const url=prompt('Tool URL',tool.url);if(url===null||!url.trim())return;
      const {error:e}=await state.client.from('external_tools').update({name:name.trim(),url:url.trim()}).eq('id',tool.id);if(e)toast(e.message);else{await logAudit('external_tool_updated','external_tool',tool.id,{name:name.trim()});await loadExternalTools();loadManagedTools(panel);}
    });
    card.querySelector('[data-toggle]').addEventListener('click',async()=>{const {error:e}=await state.client.from('external_tools').update({enabled:!tool.enabled}).eq('id',tool.id);if(e)toast(e.message);else{await logAudit('external_tool_toggled','external_tool',tool.id,{enabled:!tool.enabled});await loadExternalTools();loadManagedTools(panel);}});
    card.querySelector('[data-delete]').addEventListener('click',async()=>{if(!confirm(`Delete tool ${tool.name}?`))return;const {error:e}=await state.client.from('external_tools').delete().eq('id',tool.id);if(e)toast(e.message);else{await logAudit('external_tool_deleted','external_tool',tool.id,{name:tool.name});await loadExternalTools();loadManagedTools(panel);}});
    list.appendChild(card);
  });
}

function fontOptions(selected) { return FONT_OPTIONS.map(f=>option(f,f,selected)).join(''); }
function themeOptions(selected) { return THEME_OPTIONS.map(([v,l])=>option(v,l,selected)).join(''); }

function readDesignForm(panel) {
  return {
    ...state.settings,
    portal_title:panel.querySelector('#designTitle').value.trim()||DEFAULT_SETTINGS.portal_title,
    portal_subtitle:panel.querySelector('#designSubtitle').value.trim()||DEFAULT_SETTINGS.portal_subtitle,
    brand_kicker:panel.querySelector('#designKicker').value.trim()||DEFAULT_SETTINGS.brand_kicker,
    body_font:panel.querySelector('#designBodyFont').value,
    heading_font:panel.querySelector('#designHeadingFont').value,
    theme:panel.querySelector('#designTheme').value,
    button_style:panel.querySelector('#designButtons').value,
    menu_style:panel.querySelector('#designMenu').value,
    board_opacity:Number(panel.querySelector('#designOpacity').value),
    background_url:panel.querySelector('#designBackground').value.trim()||null,
    accent_color:panel.querySelector('#designAccent').value,
    primary_color:panel.querySelector('#designPrimary').value
  };
}

function renderAdminDesign(panel) {
  const s=state.settings;
  panel.innerHTML=`
    <h2>Design Studio</h2><p class="admin-note">Change the chalkboard interface without editing GitHub. Use Preview first; Save makes the design live for everyone.</p>
    <div class="admin-form-grid">
      <label>Portal title<input id="designTitle" value="${escapeHtml(s.portal_title||'')}"></label>
      <label>Brand line<input id="designKicker" value="${escapeHtml(s.brand_kicker||'')}"></label>
      <label class="wide">Subtitle<input id="designSubtitle" value="${escapeHtml(s.portal_subtitle||'')}"></label>
      <label>Body font<select id="designBodyFont">${fontOptions(s.body_font)}</select></label>
      <label>Heading font<select id="designHeadingFont">${fontOptions(s.heading_font)}</select></label>
      <label>Theme<select id="designTheme">${themeOptions(s.theme)}</select></label>
      <label>Button style<select id="designButtons">${option('rounded3d','Rounded 3D',s.button_style)}${option('pill','Soft Pill',s.button_style)}${option('flat','Flat',s.button_style)}${option('chalk','Chalk',s.button_style)}</select></label>
      <label>Menu layout<select id="designMenu">${option('cards','Cards',s.menu_style)}${option('large','Large Tiles',s.menu_style)}${option('compact','Compact',s.menu_style)}</select></label>
      <label>Board opacity<div class="range-line"><input id="designOpacity" type="range" min="0.70" max="1" step="0.01" value="${Number(s.board_opacity||1)}"><span id="opacityValue">${Math.round(Number(s.board_opacity||1)*100)}%</span></div></label>
      <label>Primary color<input id="designPrimary" type="color" value="${escapeHtml(s.primary_color||DEFAULT_SETTINGS.primary_color)}"></label>
      <label>Accent color<input id="designAccent" type="color" value="${escapeHtml(s.accent_color||DEFAULT_SETTINGS.accent_color)}"></label>
      <label class="wide">Custom classroom background URL<input id="designBackground" type="url" placeholder="Leave blank for the current classroom" value="${escapeHtml(s.background_url||'')}"></label>
    </div>
    <div class="design-preview"><div class="brand-kicker">LIVE PREVIEW</div><div class="preview-title">${escapeHtml(s.portal_title||'Learning Hub')}</div><p class="admin-note">Changes below can be previewed on the real board before saving.</p></div>
    <div class="button-row"><button id="previewDesign" class="btn btn-ghost">Preview</button><button id="saveDesign" class="btn btn-accent">Save Design</button><button id="resetDesign" class="btn btn-danger">Reset Default</button></div>`;
  panel.querySelector('#designOpacity').addEventListener('input',e=>panel.querySelector('#opacityValue').textContent=`${Math.round(Number(e.target.value)*100)}%`);
  panel.querySelector('#previewDesign').addEventListener('click',()=>{const draft=readDesignForm(panel);applyDesign(draft);panel.querySelector('.preview-title').textContent=draft.portal_title;toast('Preview applied. Nothing is saved yet.');});
  panel.querySelector('#saveDesign').addEventListener('click',async()=>{
    const draft=readDesignForm(panel);
    const patch={portal_title:draft.portal_title,portal_subtitle:draft.portal_subtitle,brand_kicker:draft.brand_kicker,body_font:draft.body_font,heading_font:draft.heading_font,theme:draft.theme,button_style:draft.button_style,menu_style:draft.menu_style,board_opacity:draft.board_opacity,background_url:draft.background_url,accent_color:draft.accent_color,primary_color:draft.primary_color,updated_at:new Date().toISOString(),updated_by:state.session.user.id};
    const {error}=await state.client.from('portal_settings').update(patch).eq('id',1);if(error)return toast(error.message);
    Object.assign(state.settings,patch);applyDesign(state.settings);await logAudit('design_updated','portal_settings','1',{});toast('Design saved.');
  });
  panel.querySelector('#resetDesign').addEventListener('click',async()=>{
    if(!confirm('Reset the visual settings to the default classroom design?'))return;
    const patch={...DEFAULT_SETTINGS,registration_enabled:state.settings.registration_enabled,updated_at:new Date().toISOString(),updated_by:state.session.user.id};
    delete patch.community_enabled;
    const {error}=await state.client.from('portal_settings').update(patch).eq('id',1);if(error)return toast(error.message);
    state.settings={...state.settings,...patch};applyDesign(state.settings);await logAudit('design_reset','portal_settings','1',{});toast('Default design restored.');render();
  });
}

function renderAdminSettings(panel) {
  panel.innerHTML=`
    <h2>Settings</h2>
    <div class="settings-card"><div class="toggle-line"><div><strong>Public Registration</strong><p class="admin-note">OFF: only Admin/Owner can create users.<br>ON: visitors can request an account, but every new account remains Pending until approved.</p></div><label class="switch"><input id="registrationToggle" type="checkbox" ${state.settings.registration_enabled?'checked':''}><span class="slider"></span></label></div></div>
    <div class="settings-card" style="margin-top:.65em"><div class="toggle-line"><div><strong>Community Forum</strong><p class="admin-note">Enable announcements, help, teaching ideas, game feedback and Grade/Unit discussions.</p></div><label class="switch"><input id="communityToggle" type="checkbox" ${state.settings.community_enabled?'checked':''}><span class="slider"></span></label></div></div>
    <p class="admin-note" style="margin-top:.7em">Approved users receive no direct Unit access automatically unless you assign them to an Access Group or grant individual Units.</p>`;
  panel.querySelector('#registrationToggle').addEventListener('change',async(e)=>{
    const value=e.target.checked;
    const {error}=await state.client.from('portal_settings').update({registration_enabled:value,updated_at:new Date().toISOString(),updated_by:state.session.user.id}).eq('id',1);
    if(error){e.target.checked=!value;return toast(error.message);} state.settings.registration_enabled=value;await logAudit('registration_toggled','portal_settings','1',{enabled:value});toast(`Public registration ${value?'enabled':'disabled'}.`);
  });
  panel.querySelector('#communityToggle').addEventListener('change',async(e)=>{
    const value=e.target.checked;
    const {error}=await state.client.from('portal_settings').update({community_enabled:value,updated_at:new Date().toISOString(),updated_by:state.session.user.id}).eq('id',1);
    if(error){e.target.checked=!value;return toast(error.message);} state.settings.community_enabled=value;await logAudit('community_toggled','portal_settings','1',{enabled:value});toast(`Community ${value?'enabled':'disabled'}.`);
  });
}

async function renderAdminAudit(panel) {
  panel.innerHTML='<h2>Audit Log</h2><p class="admin-note">Recent administrative changes. This is useful when more than one administrator manages the portal.</p><div id="auditList" class="audit-list">Loading…</div>';
  const {data,error}=await state.client.from('audit_log').select('*').order('created_at',{ascending:false}).limit(100);
  if(state.adminTab!=='audit')return;
  const list=panel.querySelector('#auditList');if(error){list.textContent=error.message;return;}list.innerHTML='';
  if(!data?.length){list.innerHTML='<p class="admin-note">No audit entries yet.</p>';return;}
  const users=new Map(state.adminUsers.map(u=>[u.id,u.username]));
  data.forEach(row=>{
    const card=document.createElement('div');card.className='audit-card';
    card.innerHTML=`<strong>${escapeHtml(row.action)}</strong><div class="meta">${escapeHtml(row.entity_type||'')} ${escapeHtml(row.entity_id||'')}</div><div class="audit-time">${escapeHtml(users.get(row.actor_id)||'system')} · ${new Date(row.created_at).toLocaleString()}</div>`;
    list.appendChild(card);
  });
}


// ---------------------------------------------------------------------------
// v1.4 Dynamic Access Groups
// ---------------------------------------------------------------------------
function accessRuleLabel(rule) {
  if (rule.scope_type === 'all') return 'Entire Learning Hub · current + future content';
  if (rule.scope_type === 'year') {
    const y=state.years.find(x=>x.id===rule.school_year_id);
    return `${y?.name || 'Year'} · all current + future Grades/Units`;
  }
  if (rule.scope_type === 'grade') {
    const g=state.grades.find(x=>x.id===rule.grade_id);
    const y=state.years.find(x=>x.id===g?.school_year_id);
    return `${y?.name || ''} / ${g?.name || 'Grade'} · all current + future Units`;
  }
  if (rule.scope_type === 'unit') return unitPath(rule.unit_id) || 'Specific Unit';
  return rule.scope_type;
}

function renderAdminGroups(panel) {
  panel.innerHTML=`
    <h2>Dynamic Access Groups</h2>
    <p class="admin-note">Use Groups for paid plans. A Grade or Year rule automatically includes new Units/Games created later, so you do not need to edit every member again.</p>
    <div class="admin-form-grid">
      <label>Group name<input id="groupName" placeholder="2026 Grade 3 Full Access"></label>
      <label>Description<input id="groupDescription" placeholder="Includes future Units"></label>
      <div class="wide"><button id="createGroup" class="btn btn-accent">+ Create Access Group</button></div>
    </div>
    <hr class="soft">
    <div class="admin-form-grid" style="grid-template-columns:.72fr 1.28fr">
      <div><h3>Groups</h3><div id="groupList" class="user-list"></div></div>
      <div id="groupEditor"><p class="admin-note">Select a group to manage its members and dynamic access rules.</p></div>
    </div>`;

  panel.querySelector('#createGroup').addEventListener('click',async()=>{
    const name=panel.querySelector('#groupName').value.trim();
    const description=panel.querySelector('#groupDescription').value.trim();
    if(!name)return toast('Add a group name.');
    const {data,error}=await state.client.from('access_groups').insert({name,description:description||null,active:true,created_by:state.session.user.id}).select().single();
    if(error)return toast(error.message);
    await logAudit('access_group_created','access_group',data.id,{name});
    await loadAccessGroups(); state.selectedAccessGroup=data; toast('Access Group created.'); render();
  });

  const list=panel.querySelector('#groupList');
  if(!state.accessGroups.length) list.innerHTML='<p class="admin-note">No groups yet.</p>';
  state.accessGroups.forEach(group=>{
    const row=document.createElement('button');
    row.className=`user-row ${state.selectedAccessGroup?.id===group.id?'active':''}`;
    row.innerHTML=`<span><strong>${escapeHtml(group.name)}</strong><br><small>${escapeHtml(group.description||'')}</small></span><small>${group.active?'Active':'Disabled'}</small>`;
    row.addEventListener('click',()=>{state.selectedAccessGroup=group;renderAccessGroupEditor(panel.querySelector('#groupEditor'),group);list.querySelectorAll('.user-row').forEach(x=>x.classList.remove('active'));row.classList.add('active');});
    list.appendChild(row);
  });
  if(state.selectedAccessGroup)renderAccessGroupEditor(panel.querySelector('#groupEditor'),state.selectedAccessGroup);
}

async function renderAccessGroupEditor(container,group) {
  container.innerHTML='<p class="admin-note">Loading group…</p>';
  const [{data:members,error:mErr},{data:rules,error:rErr}]=await Promise.all([
    state.client.from('access_group_members').select('*').eq('group_id',group.id),
    state.client.from('access_group_rules').select('*').eq('group_id',group.id).order('created_at')
  ]);
  if(mErr||rErr){container.textContent=(mErr||rErr).message;return;}
  const memberIds=new Set((members||[]).map(m=>m.user_id));
  const users=state.adminUsers.filter(u=>u.role==='user' && u.status!=='pending');
  container.innerHTML=`
    <div class="manage-card"><div><strong>${escapeHtml(group.name)}</strong><div class="meta">Dynamic plan: matching future content is included automatically.</div></div><div class="actions"><button id="toggleGroup" class="btn btn-small btn-ghost">${group.active?'Disable':'Enable'}</button><button id="deleteGroup" class="btn btn-small btn-danger">Delete</button></div></div>
    <h3 style="margin-top:.7em">Members</h3>
    <div class="group-member-grid">${users.map(u=>`<label><input type="checkbox" data-group-member="${u.id}" ${memberIds.has(u.id)?'checked':''}> ${escapeHtml(u.username)} <small>${escapeHtml(u.display_name||'')}</small></label>`).join('') || '<span class="admin-note">No normal users available.</span>'}</div>
    <button id="saveGroupMembers" class="btn btn-accent btn-small" style="margin-top:.5em">Save Members</button>
    <hr class="soft"><h3>Dynamic Access Rules</h3>
    <div class="admin-form-grid">
      <label>Scope<select id="groupRuleScope"><option value="all">Entire Learning Hub</option><option value="year">Year</option><option value="grade">Grade</option><option value="unit">Specific Unit</option></select></label>
      <label>Target<select id="groupRuleTarget"></select></label>
      <div class="wide"><button id="addGroupRule" class="btn btn-accent btn-small">+ Add Dynamic Rule</button></div>
    </div>
    <p class="admin-note">A Grade rule includes Units you create next month or next year inside that Grade. A Year rule includes future Grades and Units in that Year.</p>
    <div id="groupRuleList" class="manage-list"></div>`;

  const scope=container.querySelector('#groupRuleScope'),target=container.querySelector('#groupRuleTarget');
  const refreshTargets=()=>{
    if(scope.value==='all'){target.innerHTML='<option value="">All content</option>';target.disabled=true;return;}
    target.disabled=false;
    if(scope.value==='year')target.innerHTML=state.years.map(y=>`<option value="${y.id}">${escapeHtml(y.name)}</option>`).join('');
    if(scope.value==='grade')target.innerHTML=state.grades.map(g=>{const y=state.years.find(x=>x.id===g.school_year_id);return `<option value="${g.id}">${escapeHtml(y?.name||'')} / ${escapeHtml(g.name)}</option>`;}).join('');
    if(scope.value==='unit')target.innerHTML=state.units.map(u=>`<option value="${u.id}">${escapeHtml(unitPath(u.id))}</option>`).join('');
  };
  scope.addEventListener('change',refreshTargets);refreshTargets();

  container.querySelector('#saveGroupMembers').addEventListener('click',async()=>{
    const selected=[...container.querySelectorAll('[data-group-member]:checked')].map(x=>x.dataset.groupMember);
    const {error:dErr}=await state.client.from('access_group_members').delete().eq('group_id',group.id);if(dErr)return toast(dErr.message);
    if(selected.length){const rows=selected.map(user_id=>({group_id:group.id,user_id,added_by:state.session.user.id}));const {error:iErr}=await state.client.from('access_group_members').insert(rows);if(iErr)return toast(iErr.message);}
    await logAudit('access_group_members_saved','access_group',group.id,{members:selected.length});toast('Group members saved.');
  });

  container.querySelector('#addGroupRule').addEventListener('click',async()=>{
    const scopeType=scope.value;const value=target.value;
    const row={group_id:group.id,scope_type:scopeType,active:true,school_year_id:null,grade_id:null,unit_id:null};
    if(scopeType==='year')row.school_year_id=value;
    if(scopeType==='grade')row.grade_id=value;
    if(scopeType==='unit')row.unit_id=value;
    const {data,error}=await state.client.from('access_group_rules').insert(row).select().single();if(error)return toast(error.message);
    await logAudit('access_group_rule_created','access_group_rule',data.id,{group:group.name,scope:scopeType});toast('Dynamic rule added.');renderAccessGroupEditor(container,group);
  });

  container.querySelector('#toggleGroup').addEventListener('click',async()=>{const next=!group.active;const {error}=await state.client.from('access_groups').update({active:next}).eq('id',group.id);if(error)return toast(error.message);group.active=next;await loadAccessGroups();toast(`Group ${next?'enabled':'disabled'}.`);render();});
  container.querySelector('#deleteGroup').addEventListener('click',async()=>{if(!confirm(`Delete access group ${group.name}? Members will lose access supplied only by this group.`))return;const {error}=await state.client.from('access_groups').delete().eq('id',group.id);if(error)return toast(error.message);state.selectedAccessGroup=null;await loadAccessGroups();await logAudit('access_group_deleted','access_group',group.id,{name:group.name});toast('Group deleted.');render();});

  const ruleList=container.querySelector('#groupRuleList');
  if(!rules?.length)ruleList.innerHTML='<p class="admin-note">No dynamic rules yet.</p>';
  (rules||[]).forEach(rule=>{
    const card=document.createElement('div');card.className='manage-card';card.innerHTML=`<div><strong>${escapeHtml(accessRuleLabel(rule))}</strong><div class="meta">${rule.active?'Active':'Disabled'}</div></div><div class="actions"><button class="btn btn-small btn-danger">Remove</button></div>`;
    card.querySelector('button').addEventListener('click',async()=>{const {error}=await state.client.from('access_group_rules').delete().eq('id',rule.id);if(error)return toast(error.message);await logAudit('access_group_rule_deleted','access_group_rule',rule.id,{});renderAccessGroupEditor(container,group);});ruleList.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// v1.4 Community Forum
// ---------------------------------------------------------------------------
async function renderCommunity() {
  setHeader('Community', ['Community']);
  els.content.innerHTML='<div class="empty-state">Loading community…</div>';
  const {data,error}=await state.client.from('forum_categories').select('*').eq('enabled',true).order('sort_order');
  if(state.view!=='community')return;
  els.content.innerHTML='';
  if(error){els.content.innerHTML=`<div class="empty-state">${escapeHtml(error.message)}</div>`;return;}
  const grid=document.createElement('div');grid.className='community-grid';
  (data||[]).forEach(cat=>{
    const card=document.createElement('button');card.className='community-category';
    card.innerHTML=`<span class="community-icon">${escapeHtml(cat.icon||'💬')}</span><strong>${escapeHtml(cat.name)}</strong><span>${escapeHtml(cat.description||'')}</span>${cat.staff_only_post?'<small>Admin announcements</small>':''}`;
    card.addEventListener('click',()=>{state.communityCategory=cat;state.view='communityCategory';render();});grid.appendChild(card);
  });
  if(!data?.length)els.content.innerHTML='<div class="empty-state">Community is enabled, but no categories are available.</div>';else els.content.appendChild(grid);
}

async function renderCommunityCategory() {
  const cat=state.communityCategory;if(!cat){state.view='community';return render();}
  setHeader(cat.name,['Community',cat.name]);
  els.content.innerHTML='<div class="empty-state">Loading discussions…</div>';
  const {data:topics,error}=await state.client.from('forum_topics').select('*').eq('category_id',cat.id).is('deleted_at',null).order('pinned',{ascending:false}).order('created_at',{ascending:false});
  if(state.view!=='communityCategory')return;
  els.content.innerHTML='';if(error){els.content.innerHTML=`<div class="empty-state">${escapeHtml(error.message)}</div>`;return;}
  const canPost=!cat.staff_only_post||isStaff();
  if(canPost){
    const form=document.createElement('div');form.className='community-compose';
    form.innerHTML=`<h3>Start a discussion</h3><input id="topicTitle" placeholder="Topic title"><textarea id="topicBody" rows="3" placeholder="Write your message…"></textarea><select id="topicUnit"><option value="">No Grade/Unit attachment</option>${state.units.filter(u=>isStaff()||state.ownAccess.has(u.id)).map(u=>`<option value="${u.id}">${escapeHtml(unitPath(u.id))}</option>`).join('')}</select><button id="createTopic" class="btn btn-accent btn-small">Post Topic</button>`;
    form.querySelector('#createTopic').addEventListener('click',async()=>{
      const title=form.querySelector('#topicTitle').value.trim(),body=form.querySelector('#topicBody').value.trim(),unitId=form.querySelector('#topicUnit').value||null;if(!title||!body)return toast('Add a title and message.');
      const unit=state.units.find(u=>u.id===unitId);const authorLabel=state.profile.display_name||state.profile.username||'Member';
      const {error:e}=await state.client.from('forum_topics').insert({category_id:cat.id,author_id:state.session.user.id,author_label:authorLabel,title,body,unit_id:unitId,grade_id:unit?.grade_id||null});if(e)return toast(e.message);await logAudit('forum_topic_created','forum_category',cat.id,{title});toast('Discussion posted.');renderCommunityCategory();
    });
    els.content.appendChild(form);
  }
  const list=document.createElement('div');list.className='community-topic-list';
  if(!topics?.length)list.innerHTML='<p class="admin-note">No discussions yet.</p>';
  (topics||[]).forEach(topic=>{
    const card=document.createElement('div');card.className=`community-topic ${topic.pinned?'pinned':''}`;
    card.innerHTML=`<div class="topic-main"><strong>${topic.pinned?'📌 ':''}${escapeHtml(topic.title)} ${topic.locked?'🔒':''}</strong><div class="meta">${escapeHtml(topic.author_label)} · ${new Date(topic.created_at).toLocaleString()}${topic.unit_id?` · ${escapeHtml(unitPath(topic.unit_id))}`:''}</div><p>${escapeHtml(topic.body).slice(0,220)}</p></div><div class="actions"><button class="btn btn-small btn-ghost" data-open>Open</button>${isStaff()?'<button class="btn btn-small btn-ghost" data-pin>Pin</button><button class="btn btn-small btn-ghost" data-lock>Lock</button><button class="btn btn-small btn-danger" data-delete>Remove</button>':''}</div>`;
    card.querySelector('[data-open]').addEventListener('click',()=>{state.communityTopic=topic;state.view='communityTopic';render();});
    if(isStaff()){
      card.querySelector('[data-pin]').addEventListener('click',async()=>{const {error:e}=await state.client.from('forum_topics').update({pinned:!topic.pinned}).eq('id',topic.id);if(e)toast(e.message);else renderCommunityCategory();});
      card.querySelector('[data-lock]').addEventListener('click',async()=>{const {error:e}=await state.client.from('forum_topics').update({locked:!topic.locked}).eq('id',topic.id);if(e)toast(e.message);else renderCommunityCategory();});
      card.querySelector('[data-delete]').addEventListener('click',async()=>{if(!confirm('Remove this discussion?'))return;const {error:e}=await state.client.from('forum_topics').update({deleted_at:new Date().toISOString()}).eq('id',topic.id);if(e)toast(e.message);else renderCommunityCategory();});
    }
    list.appendChild(card);
  });
  els.content.appendChild(list);
}

async function renderCommunityTopic() {
  const topic=state.communityTopic,cat=state.communityCategory;if(!topic||!cat){state.view='community';return render();}
  setHeader(topic.title,['Community',cat.name,topic.title]);
  els.content.innerHTML='<div class="empty-state">Loading replies…</div>';
  const {data:posts,error}=await state.client.from('forum_posts').select('*').eq('topic_id',topic.id).is('deleted_at',null).order('created_at');
  if(state.view!=='communityTopic')return;
  els.content.innerHTML='';if(error){els.content.innerHTML=`<div class="empty-state">${escapeHtml(error.message)}</div>`;return;}
  const head=document.createElement('article');head.className='forum-topic-detail';head.innerHTML=`<h2>${topic.pinned?'📌 ':''}${escapeHtml(topic.title)} ${topic.locked?'🔒':''}</h2><div class="meta">${escapeHtml(topic.author_label)} · ${new Date(topic.created_at).toLocaleString()}${topic.unit_id?` · ${escapeHtml(unitPath(topic.unit_id))}`:''}</div><p>${escapeHtml(topic.body).replace(/\n/g,'<br>')}</p>`;els.content.appendChild(head);
  const list=document.createElement('div');list.className='forum-post-list';(posts||[]).forEach(post=>{const card=document.createElement('div');card.className='forum-post';card.innerHTML=`<div><strong>${escapeHtml(post.author_label)}</strong><span class="meta"> ${new Date(post.created_at).toLocaleString()}</span><p>${escapeHtml(post.body).replace(/\n/g,'<br>')}</p></div>${isStaff()?'<button class="btn btn-small btn-danger">Remove</button>':''}`;if(isStaff())card.querySelector('button').addEventListener('click',async()=>{const {error:e}=await state.client.from('forum_posts').update({deleted_at:new Date().toISOString()}).eq('id',post.id);if(e)toast(e.message);else renderCommunityTopic();});list.appendChild(card);});els.content.appendChild(list);
  if(!topic.locked||isStaff()){
    const reply=document.createElement('div');reply.className='community-compose';reply.innerHTML=`<textarea id="replyBody" rows="3" placeholder="Write a reply…"></textarea><button id="postReply" class="btn btn-accent btn-small">Reply</button>`;reply.querySelector('#postReply').addEventListener('click',async()=>{const body=reply.querySelector('#replyBody').value.trim();if(!body)return;const authorLabel=state.profile.display_name||state.profile.username||'Member';const {error:e}=await state.client.from('forum_posts').insert({topic_id:topic.id,author_id:state.session.user.id,author_label:authorLabel,body});if(e)return toast(e.message);toast('Reply posted.');renderCommunityTopic();});els.content.appendChild(reply);
  }
}

async function renderAdminCommunity(panel) {
  panel.innerHTML='<h2>Community Management</h2><p class="admin-note">Manage forum sections. Moderation of individual discussions is available directly inside Community.</p><div class="admin-form-grid"><label>Name<input id="newCommunityName" placeholder="Parent Questions"></label><label>Icon<input id="newCommunityIcon" value="💬"></label><label class="wide">Description<input id="newCommunityDescription" placeholder="Optional description"></label><label>Who can start topics?<select id="newCommunityStaff"><option value="false">All active members</option><option value="true">Admin/Owner only</option></select></label><div style="display:flex;align-items:end"><button id="addCommunityCategory" class="btn btn-accent">+ Category</button></div></div><hr class="soft"><div id="communityCategoryAdmin" class="manage-list">Loading…</div>';
  panel.querySelector('#addCommunityCategory').addEventListener('click',async()=>{const name=panel.querySelector('#newCommunityName').value.trim();if(!name)return toast('Add a category name.');const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');const row={name,slug:slug||`category-${Date.now()}`,icon:panel.querySelector('#newCommunityIcon').value.trim()||'💬',description:panel.querySelector('#newCommunityDescription').value.trim()||null,staff_only_post:panel.querySelector('#newCommunityStaff').value==='true',enabled:true,sort_order:100};const {error}=await state.client.from('forum_categories').insert(row);if(error)return toast(error.message);await logAudit('forum_category_created','forum_category',null,{name});renderAdminCommunity(panel);});
  const {data,error}=await state.client.from('forum_categories').select('*').order('sort_order');if(state.adminTab!=='communityAdmin')return;const list=panel.querySelector('#communityCategoryAdmin');if(error){list.textContent=error.message;return;}list.innerHTML='';(data||[]).forEach(cat=>{const card=document.createElement('div');card.className='manage-card';card.innerHTML=`<div><strong>${escapeHtml(cat.icon)} ${escapeHtml(cat.name)}</strong><div class="meta">${cat.enabled?'Enabled':'Disabled'} · ${cat.staff_only_post?'Admin posts only':'Members can post'}</div></div><div class="actions"><button class="btn btn-small btn-ghost" data-enabled>${cat.enabled?'Disable':'Enable'}</button><button class="btn btn-small btn-ghost" data-staff>${cat.staff_only_post?'Allow Members':'Admin Only'}</button></div>`;card.querySelector('[data-enabled]').addEventListener('click',async()=>{const {error:e}=await state.client.from('forum_categories').update({enabled:!cat.enabled}).eq('id',cat.id);if(e)toast(e.message);else renderAdminCommunity(panel);});card.querySelector('[data-staff]').addEventListener('click',async()=>{const {error:e}=await state.client.from('forum_categories').update({staff_only_post:!cat.staff_only_post}).eq('id',cat.id);if(e)toast(e.message);else renderAdminCommunity(panel);});list.appendChild(card);});
}

boot();
