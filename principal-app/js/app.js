/* ============================================================
   app.js — hash router, Firebase auth state, sidebar navigation.
   ============================================================ */

import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, isConfigured, BOOTSTRAP_ADMIN_EMAILS } from './firebase-config.js';
import { getUserProfile, saveUserProfile, touchLastActive } from './api.js';
import { esc, toast, skeletonPage, fmtDate, todayYMD, dayNameOf, bindForm } from './ui.js';

import * as loginPage from './pages/login.js';
import * as studentPage from './pages/studentDashboard.js';
import * as teacherPage from './pages/teacherDashboard.js';
import * as adminPage from './pages/adminDashboard.js';
import * as quizPage from './pages/quiz.js';

/* Imports are hoisted, so reaching this line means the whole module graph —
   including the Firebase SDK — loaded. The fallback in index.html watches it. */
window.__PRINCIPAL_BOOTED__ = true;

const view = document.getElementById('view');
const navEl = document.getElementById('nav');
const footEl = document.getElementById('sidebar-foot');
const titleEl = document.getElementById('page-title');
const subEl = document.getElementById('page-sub');
const rightEl = document.getElementById('topbar-right');
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('backdrop');

/** Single source of truth for who is signed in. */
export const state = {
  user: null,        // Firebase Auth user
  profile: null,     // users/{uid} document
  ready: false,      // first auth callback has fired
};

const ROUTES = [
  { pattern: /^\/login$/, page: loginPage, roles: null, title: 'Sign in', chrome: false },
  { pattern: /^\/dashboard$/, page: studentPage, roles: ['student', 'admin'], title: 'My Learning' },
  { pattern: /^\/teacher$/, page: teacherPage, roles: ['teacher', 'admin'], title: 'Teacher Dashboard' },
  { pattern: /^\/admin$/, page: adminPage, roles: ['admin'], title: 'Admin Dashboard' },
  { pattern: /^\/quiz\/([^/]+)$/, page: quizPage, roles: ['student', 'teacher', 'admin'], title: 'Quiz', chrome: true },
];

const NAV = {
  student: [
    { icon: '🏠', label: 'Dashboard', href: '#/dashboard' },
    { icon: '📅', label: 'Today’s Classes', href: '#/dashboard', scroll: 'sec-today' },
    { icon: '🗓️', label: 'Upcoming', href: '#/dashboard', scroll: 'sec-upcoming' },
    { icon: '📈', label: 'Progress', href: '#/dashboard', scroll: 'sec-progress' },
    { icon: '📝', label: 'Quizzes', href: '#/dashboard', scroll: 'sec-quizzes' },
    { icon: '🔔', label: 'Recent Activity', href: '#/dashboard', scroll: 'sec-activity' },
  ],
  teacher: [
    { icon: '🏠', label: 'Dashboard', href: '#/teacher' },
    { icon: '📅', label: 'Today’s Class', href: '#/teacher', scroll: 'sec-today' },
    { icon: '📚', label: 'My Course', href: '#/teacher', scroll: 'sec-course' },
    { icon: '📈', label: 'Student Progress', href: '#/teacher', scroll: 'sec-progress' },
    { icon: '🩺', label: 'File Gap Report', href: '#/teacher', scroll: 'sec-gap' },
    { icon: '📝', label: 'Quizzes', href: '#/teacher', scroll: 'sec-quiz' },
    { icon: '🕘', label: 'Session History', href: '#/teacher', scroll: 'sec-history' },
    { icon: '🤖', label: 'Agent access', href: '#/teacher', scroll: 'sec-api' },
  ],
  admin: [
    { icon: '🏠', label: 'Overview', href: '#/admin' },
    { icon: '📚', label: 'All Courses', href: '#/admin', scroll: 'sec-courses' },
    { icon: '👩‍🏫', label: 'All Teachers', href: '#/admin', scroll: 'sec-teachers' },
    { icon: '🩺', label: 'Gap Reports', href: '#/admin', scroll: 'sec-gaps' },
    { icon: '📝', label: 'Quiz Results', href: '#/admin', scroll: 'sec-quizzes' },
    { icon: '💚', label: 'System Health', href: '#/admin', scroll: 'sec-system' },
    { icon: '➕', label: 'Add Course', href: '#/admin', scroll: 'sec-add-course' },
    { icon: '➕', label: 'Add Account', href: '#/admin', scroll: 'sec-add-teacher' },
    { icon: '🎓', label: 'My Classes', href: '#/dashboard' },
    { icon: '👩‍🏫', label: 'Teacher View', href: '#/teacher' },
  ],
};

export function homeFor(role) {
  if (role === 'teacher') return '#/teacher';
  if (role === 'admin') return '#/admin';
  return '#/dashboard';
}

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/* ---------------------------------------------------------- chrome ---- */

function currentPath() {
  const raw = location.hash.replace(/^#/, '');
  return raw.startsWith('/') ? raw : '/login';
}

function renderNav(activePath) {
  const role = state.profile?.role;
  if (!role || !state.user) { navEl.innerHTML = ''; footEl.innerHTML = ''; return; }

  const items = NAV[role] || NAV.student;
  navEl.innerHTML = `<div class="nav-label">${esc(role)}</div>` + items.map((item) => {
    const active = item.href === `#${activePath}` && !item.scroll;
    return `<a class="nav-item ${active ? 'active' : ''}" href="${item.href}" ${item.scroll ? `data-scroll="${item.scroll}"` : ''}>
      <span class="ico">${item.icon}</span><span>${esc(item.label)}</span></a>`;
  }).join('');

  const initials = (state.profile.name || state.user.email || '?').trim().charAt(0).toUpperCase();
  footEl.innerHTML = `
    <div class="who">
      <span class="avatar">${esc(initials)}</span>
      <span>
        <span class="who-name">${esc(state.profile.name || state.user.email)}</span><br>
        <span class="who-role">${esc(state.profile.role)}${state.profile.teacherSlot ? ` · slot ${esc(state.profile.teacherSlot)}` : ''}</span>
      </span>
    </div>
    <button class="btn btn-sm btn-block" id="signout-btn">↩︎ Sign out</button>`;

  footEl.querySelector('#signout-btn')?.addEventListener('click', async () => {
    await signOut(auth);
    toast('Signed out');
    navigate('#/login');
  });
}

function setHeader(title, sub = '') {
  titleEl.textContent = title;
  subEl.textContent = sub;
  document.title = `${title} · Principal`;
}

function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.hidden = true;
}

document.getElementById('menu-btn').addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  backdrop.hidden = !open;
});
backdrop.addEventListener('click', closeSidebar);

navEl.addEventListener('click', (event) => {
  const link = event.target.closest('.nav-item');
  if (!link) return;
  closeSidebar();
  const target = link.dataset.scroll;
  if (!target) return;
  const go = () => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (link.getAttribute('href') === `#${currentPath()}`) { event.preventDefault(); go(); }
  else setTimeout(go, 450); // let the destination page mount first
});

/* ------------------------------------------------------- page mounting */

let cleanup = null;

function screen(html, { chrome = false, title = 'Principal', sub = '' } = {}) {
  document.body.classList.toggle('auth-mode', !chrome);
  setHeader(title, sub);
  rightEl.innerHTML = '';
  view.className = 'view fade';
  view.innerHTML = html;
}

function setupScreen() {
  screen(`<div class="auth-wrap"><div class="auth-card">
      <div class="auth-brand"><div class="mark">🎓</div><h1>Principal</h1>
        <p>One step left before the dashboard opens.</p></div>
      <div class="note">Add your Firebase project details to <code>js/firebase-config.js</code>, then reload this page.</div>
      <ol class="small muted" style="line-height:1.9;padding-left:20px;margin-top:14px">
        <li>Create a project at <a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a></li>
        <li>Add a <strong>Web app</strong> and copy its config into <code>firebaseConfig</code></li>
        <li>Enable <strong>Authentication → Email/Password</strong> (and Google, optionally)</li>
        <li>Create a <strong>Cloud Firestore</strong> database</li>
        <li>Publish the rules from <code>firestore.rules</code></li>
        <li>Sign in as your admin account and press <strong>Seed demo data</strong></li>
      </ol>
      <p class="auth-hint">Full walkthrough lives in <code>README.md</code>.</p>
    </div></div>`, { chrome: false, title: 'Setup' });
}

function noProfileScreen() {
  const uid = state.user?.uid || '';
  const email = state.user?.email || '';
  const suggestedName = state.user?.displayName || email.split('@')[0] || 'Your Name';
  /* The rules enforce this list too — the check here only decides what to show. */
  const canBootstrap = BOOTSTRAP_ADMIN_EMAILS
    .some((allowed) => allowed.toLowerCase() === email.toLowerCase());
  screen(`<div class="auth-wrap"><div class="auth-card">
      <div class="auth-brand"><div class="mark">🔒</div><h1>Almost there</h1>
        <p>This account has no profile in Firestore yet.</p></div>

      <p class="small muted">Signed in as <strong>${esc(email)}</strong>.</p>

      ${canBootstrap ? `
        <div class="note" style="margin-top:12px">Your address is on the bootstrap allowlist,
          so you can create your own admin profile right here.</div>
        <form id="np-form" style="margin-top:14px">
          <div data-error></div>
          <div class="field">
            <label for="np-name">Your name</label>
            <input id="np-name" name="name" type="text" required
              value="${esc(suggestedName)}" autocomplete="name">
          </div>
          <button class="btn btn-primary btn-block" type="submit">Create my admin profile</button>
        </form>
      ` : `
        <p class="small muted" style="margin-top:10px">An admin has to provision this account, or
          your address has to be added to <code>BOOTSTRAP_ADMIN_EMAILS</code> in
          <code>js/firebase-config.js</code> <em>and</em> to <code>isBootstrapAdmin()</code> in
          <code>firestore.rules</code> (then redeploy the rules).</p>
        <p class="small muted" style="margin-top:10px">To do it by hand, add a document at
          <code>users/${esc(uid)}</code> in the Firestore console with these fields
          — the console has no JSON paste, so enter them one at a time:</p>
        <div class="table-wrap" style="margin-top:8px"><table class="table">
          <thead><tr><th>Field</th><th>Type</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td class="mono">name</td><td>string</td><td>${esc(suggestedName)}</td></tr>
            <tr><td class="mono">email</td><td>string</td><td>${esc(email)}</td></tr>
            <tr><td class="mono">role</td><td>string</td><td>admin, teacher or student</td></tr>
            <tr><td class="mono">teacherSlot</td><td>null</td><td>— (1–6 for teachers)</td></tr>
            <tr><td class="mono">apiKey</td><td>string</td><td>leave empty</td></tr>
          </tbody>
        </table></div>
        <button class="btn btn-block" style="margin-top:14px" onclick="location.reload()">I created it — reload</button>
      `}

      <button class="btn btn-block" id="np-signout" style="margin-top:10px">Sign out</button>
      <p class="auth-hint">Or run <code>npm run seed</code> in <code>scripts/</code> to create every demo account at once.</p>
    </div></div>`, { chrome: false, title: 'Profile needed' });

  document.getElementById('np-signout').addEventListener('click', async () => {
    await signOut(auth);
    navigate('#/login');
  });

  const form = document.getElementById('np-form');
  if (form) {
    bindForm(form, async (data) => {
      await saveUserProfile(state.user.uid, {
        name: String(data.get('name') || '').trim() || suggestedName,
        email,
        role: 'admin',
        teacherSlot: null,
        apiKey: '',
        createdAt: new Date(),
      });
      state.profile = await getUserProfile(state.user.uid);
      toast('Admin profile created — welcome.', 'ok');
      navigate(homeFor(state.profile?.role));
    });
  }
}

function deniedScreen(role) {
  screen(`<div class="section"><div class="card">
      <h2>🚫 Not available for your role</h2>
      <p class="muted small" style="margin-top:8px">You are signed in as <strong>${esc(role)}</strong>.
      <a href="${homeFor(role)}">Go to your dashboard</a>.</p>
    </div></div>`, { chrome: true, title: 'Access' });
}

async function render() {
  if (cleanup) { try { cleanup(); } catch (err) { console.error(err); } cleanup = null; }
  if (!isConfigured) return setupScreen();
  if (!state.ready) return screen(skeletonPage(), { chrome: true, title: 'Loading…' });

  const path = currentPath();
  const match = ROUTES.map((r) => ({ r, m: r.pattern.exec(path) })).find((x) => x.m);

  if (!match) {
    if (!state.user) return navigate('#/login');
    return navigate(homeFor(state.profile?.role));
  }

  const { r: route, m } = match;
  const params = m.slice(1).map(decodeURIComponent);

  if (!state.user) {
    if (route.page !== loginPage) return navigate('#/login');
  } else if (route.page === loginPage) {
    return navigate(homeFor(state.profile?.role));
  } else if (!state.profile) {
    return noProfileScreen();
  } else if (route.roles && !route.roles.includes(state.profile.role)) {
    return deniedScreen(state.profile.role);
  }

  const chrome = route.chrome !== undefined ? route.chrome : true;
  const today = todayYMD();
  const sub = chrome ? `${dayNameOf(today)} · ${fmtDate(today, { relative: false })}` : '';
  screen('', { chrome, title: route.title, sub });
  renderNav(path);

  try {
    cleanup = await route.page.render(view, {
      params,
      user: state.user,
      profile: state.profile,
      navigate,
      setHeader,
      topbar: rightEl,
    }) || null;
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><h3>😕 Could not load this page</h3>
      <p class="small muted" style="margin-top:8px">${esc(err.message || String(err))}</p>
      <button class="btn btn-sm" style="margin-top:12px" onclick="location.reload()">Reload</button></div>`;
  }
}

window.addEventListener('hashchange', render);

if (!isConfigured) {
  setupScreen();
} else {
  onAuthStateChanged(auth, async (user) => {
    state.user = user || null;
    state.profile = null;
    if (user) {
      try {
        state.profile = await getUserProfile(user.uid);
        if (state.profile) touchLastActive(user.uid);
      } catch (err) {
        console.error('Could not load profile', err);
      }
    }
    state.ready = true;
    if (!location.hash) location.hash = user ? homeFor(state.profile?.role) : '#/login';
    else render();
  });
  render();
}
