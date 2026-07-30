/* ============================================================
   ui.js — tiny rendering helpers shared by every page.
   Templates are plain strings; user data always goes through esc().
   ============================================================ */

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ---------- dates ---------- */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local-midnight Date for a YYYY-MM-DD string (avoids UTC parsing drift). */
export function parseYMD(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function todayYMD(base = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`;
}

export function addDaysYMD(ymd, days) {
  const d = parseYMD(ymd);
  d.setDate(d.getDate() + days);
  return todayYMD(d);
}

export function dayNameOf(ymd) { return DAY_NAMES[parseYMD(ymd).getDay()]; }

/** "Mon, Aug 3" — with "Today"/"Tomorrow"/"Yesterday" shortcuts. */
export function fmtDate(ymd, { relative = true } = {}) {
  if (!ymd) return '—';
  const d = parseYMD(ymd);
  if (Number.isNaN(d.getTime())) return String(ymd);
  if (relative) {
    const t = todayYMD();
    if (ymd === t) return 'Today';
    if (ymd === addDaysYMD(t, 1)) return 'Tomorrow';
    if (ymd === addDaysYMD(t, -1)) return 'Yesterday';
  }
  return `${DAY_NAMES[d.getDay()].slice(0, 3)}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** 24h "14:30" -> "2:30 PM" */
export function fmtTime(hm) {
  if (!hm) return '';
  const [h, m] = String(hm).split(':').map(Number);
  if (Number.isNaN(h)) return String(hm);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/** Firestore Timestamp | Date | ms | ISO -> Date | null */
export function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${fmtTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`)}`;
}

export function fmtAgo(value) {
  const d = toDate(value);
  if (!d) return 'never';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 31) return `${days}d ago`;
  return fmtDateTime(value).split(' · ')[0];
}

export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ---------- markup helpers ---------- */

export function card(bodyHtml, { title = '', actions = '', cls = '', sub = '' } = {}) {
  const head = title || actions
    ? `<div class="card-head">
         <div><h3>${title}</h3>${sub ? `<p class="tiny muted">${sub}</p>` : ''}</div>
         <span class="spacer"></span>${actions}
       </div>`
    : '';
  return `<section class="card ${cls}">${head}${bodyHtml}</section>`;
}

export function section(title, bodyHtml, { sub = '', actions = '', id = '' } = {}) {
  return `<section class="section" ${id ? `id="${id}"` : ''}>
    <div class="section-head"><h2>${title}</h2>${sub ? `<span class="section-sub">${sub}</span>` : ''}<span class="spacer"></span>${actions}</div>
    ${bodyHtml}
  </section>`;
}

export function badge(text, kind = 'gray') {
  return `<span class="badge badge-${kind}">${esc(text)}</span>`;
}

export function bar(pct, kind = '', label = null) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `<div class="bar-row">
    <div class="bar ${kind}"><i style="width:${p}%"></i></div>
    <span class="bar-val">${label === null ? `${p}%` : esc(label)}</span>
  </div>`;
}

export function healthDot(health) {
  return `<span class="dot dot-${health}" title="${esc(health)}"></span>`;
}

export function empty(message, emoji = '🌤️') {
  return `<div class="empty"><span class="emo">${emoji}</span>${esc(message)}</div>`;
}

export function skeletonCard(lines = 3) {
  const rows = ['<div class="skel title"></div>']
    .concat(Array.from({ length: lines }, (_, i) => `<div class="skel ${i % 3 === 2 ? 'half' : 'wide'}"></div>`));
  return `<section class="card">${rows.join('')}</section>`;
}

export function skeletonPage() {
  return `<div class="section"><div class="stats">${Array.from({ length: 4 }, () =>
    '<div class="stat"><div class="skel third"></div><div class="skel half"></div></div>').join('')}</div></div>
    <div class="section">${skeletonCard(4)}</div>
    <div class="section grid">${skeletonCard(3)}${skeletonCard(3)}</div>`;
}

/* Severity / status / result -> badge colour */
const KIND_MAP = {
  critical: 'red', major: 'yellow', minor: 'blue',
  upcoming: 'blue', completed: 'green', cancelled: 'gray',
  correct: 'green', partially_correct: 'yellow', needs_work: 'red',
  incorrect: 'red', hesitant: 'yellow',
  not_started: 'gray', in_progress: 'blue', achieved: 'green', behind: 'red',
};
export const kindFor = (value) => KIND_MAP[value] || 'gray';
export const humanize = (value) => String(value || '').replace(/_/g, ' ');

export const MATERIAL_ICON = { video: '▶️', reading: '📖', quiz: '📝', slides: '📽️' };

/**
 * A single material's link/button. `slides` materials are an in-app lecture:
 * courseId + lessonId are needed to build the viewer route, since the
 * material doc itself only knows its own id.
 */
export function materialLink(m, courseId, lessonId) {
  const ico = MATERIAL_ICON[m.type] || '🔗';

  if (m.type === 'slides') {
    const count = Array.isArray(m.slides) ? m.slides.length : 0;
    const href = courseId && lessonId
      ? `#/lecture/${encodeURIComponent(courseId)}/${encodeURIComponent(lessonId)}/${encodeURIComponent(m.id)}`
      : '#';
    return `<a class="mat" href="${href}">
      <span class="mat-ico">${ico}</span>
      <span class="mat-title">${esc(m.title || 'Untitled lecture')}</span>
      <span class="mat-meta">${count} slide${count === 1 ? '' : 's'}</span>
    </a>`;
  }

  const meta = m.type === 'video' && m.durationMin ? `${m.durationMin} min` : humanize(m.type || 'link');
  const href = m.url ? esc(m.url) : '#';
  return `<a class="mat" href="${href}" ${m.url ? 'target="_blank" rel="noopener noreferrer"' : ''}>
    <span class="mat-ico">${ico}</span>
    <span class="mat-title">${esc(m.title || 'Untitled material')}</span>
    <span class="mat-meta">${esc(meta)}</span>
  </a>`;
}

/** Inline SVG sparkline for a series of 0..1 values. */
export function sparkline(values, { kind = 'accent' } = {}) {
  const pts = (values || []).filter((v) => Number.isFinite(v));
  if (pts.length < 2) return `<p class="tiny muted">Not enough data for a trend yet.</p>`;
  const w = 100, h = 30;
  const stroke = kind === 'green' ? '#16a34a' : kind === 'red' ? '#e94560' : '#e94560';
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - Math.max(0, Math.min(1, v)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="trend">
    <polyline fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" points="${coords.join(' ')}"/>
    <circle r="2.4" fill="${stroke}" cx="${coords[coords.length - 1].split(',')[0]}" cy="${coords[coords.length - 1].split(',')[1]}"/>
  </svg>`;
}

/* ---------- feedback ---------- */

export function toast(message, kind = '') {
  const host = document.getElementById('toast-host');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

/** Opens a native <dialog>; resolves when it closes. */
export function sheet(title, bodyHtml) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `<div class="sheet-head"><h3>${title}</h3>
      <button class="btn btn-sm" data-close>Close</button></div>
    <div class="sheet-body">${bodyHtml}</div>`;
  document.body.appendChild(dlg);
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return dlg;
}

/** Wraps an async submit handler with button spinner + error surface. */
export function bindForm(form, handler, { errorBox = null } = {}) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    const box = errorBox || form.querySelector('[data-error]');
    const original = submit ? submit.textContent : '';
    if (box) { box.textContent = ''; box.className = ''; }
    if (submit) { submit.disabled = true; submit.textContent = 'Working…'; }
    try {
      await handler(new FormData(form), form);
    } catch (err) {
      console.error(err);
      const message = friendlyError(err);
      if (box) { box.className = 'form-error'; box.textContent = message; } else toast(message, 'err');
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = original; }
    }
  });
}

export function friendlyError(err) {
  const code = err && err.code ? String(err.code) : '';
  const map = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-email': 'That email address looks malformed.',
    'auth/user-not-found': 'No account with that email.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/too-many-requests': 'Too many attempts — wait a minute and try again.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/operation-not-allowed': 'That sign-in method is disabled in the Firebase console.',
    'auth/unauthorized-domain': 'Add this site’s domain to Firebase Auth → Settings → Authorized domains.',
    'permission-denied': 'Firestore rules blocked that operation for your role.',
    'unavailable': 'Could not reach Firestore. Check your connection.',
    'failed-precondition': 'Firestore needs an index for that query — check the console link in the browser log.',
  };
  if (map[code]) return map[code];
  return (err && err.message ? err.message : 'Something went wrong.').replace(/^Firebase:\s*/, '');
}

/** Number formatting for percentages that may be null. */
export function pct(value, digits = 0) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : '—';
}
