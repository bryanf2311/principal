/* ============================================================
   #/admin — system-wide view.
   Courses & health · teachers & keys · every gap report
   (searchable) · aggregate quiz results · system health ·
   add course · add account · demo seeding
   ============================================================ */

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { createSecondaryApp, DEFAULT_NEW_ACCOUNT_PASSWORD, firebaseConfig } from '../firebase-config.js';
import {
  listUsers, listCourses, listLessons, listMilestones, listSessions, listGapReports,
  listQuizzes, listQuizAttempts, createCourse, updateCourse, deleteCourse, saveUserProfile, deleteUserProfile,
  getSetupKey, rotateSetupKey, milestoneProgress, courseHealth, warmupScore, quizAverage, HEALTH_LABEL,
} from '../api.js';
import {
  esc, section, card, badge, bar, empty, healthDot, skeletonPage, sheet,
  fmtDate, fmtAgo, fmtDateTime, todayYMD, kindFor, humanize, pct, toast, bindForm, toDate,
} from '../ui.js';

export async function render(mount, ctx) {
  mount.innerHTML = skeletonPage();

  const [users, courses, sessions, reports, quizzes, attempts, setupKey] = await Promise.all([
    listUsers(),
    listCourses(),
    listSessions(),
    listGapReports(),
    listQuizzes(),
    listQuizAttempts(),
    getSetupKey(),
  ]);

  const perCourse = await Promise.all(courses.map(async (course) => ({
    course,
    lessons: await listLessons(course.id),
    milestones: await listMilestones(course.id),
  })));

  const userById = new Map(users.map((u) => [u.id, u]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const lessonById = new Map(perCourse.flatMap(({ lessons }) => lessons.map((l) => [l.id, l])));
  const teachers = users.filter((u) => u.role === 'teacher');
  const students = users.filter((u) => u.role === 'student');

  const data = { users, teachers, students, courses, perCourse, sessions, reports, quizzes,
    attempts, setupKey, userById, courseById, sessionById, lessonById };

  ctx.setHeader('Admin Dashboard',
    `${courses.length} courses · ${teachers.length} teachers · ${reports.length} gap reports`);

  mount.innerHTML = `<div id="admin-root">${[
    renderOverview(data),
    renderCourses(data),
    renderTeachers(data),
    renderSetupKey(data),
    renderGapReports(data),
    renderQuizResults(data),
    renderSystem(data),
    renderAddCourse(data),
    renderAddAccount(data),
  ].join('')}</div>`;

  wire(mount.querySelector('#admin-root'), mount, ctx, data);
  return null;
}

/* ------------------------------------------------------------ sections */

function healthOf(courseId, { perCourse, reports, sessionById }) {
  const entry = perCourse.find((p) => p.course.id === courseId);
  const courseReports = reports.filter((r) => sessionById.get(r.sessionId)?.courseId === courseId);
  return {
    health: courseHealth({ milestones: entry?.milestones || [], reports: courseReports }),
    progress: milestoneProgress(entry?.milestones || []),
    reports: courseReports,
    lessons: entry?.lessons || [],
  };
}

function renderOverview(data) {
  const { courses, teachers, reports, attempts, sessions } = data;
  const today = todayYMD();
  const healths = courses.map((c) => healthOf(c.id, data).health);
  const avgQuiz = quizAverage(attempts);
  const tiles = [
    { label: 'Courses', value: courses.length, note: `${healths.filter((h) => h === 'green').length} on track` },
    { label: 'Teachers', value: teachers.length, note: `${teachers.filter((t) => t.kind === 'agent').length} agents` },
    { label: 'Sessions today', value: sessions.filter((s) => s.scheduledDate === today).length, note: `${sessions.length} total` },
    { label: 'Gap reports', value: reports.length, note: reports.length ? `latest ${fmtAgo(reports[0].filedAt)}` : 'none filed' },
    { label: 'Quiz average', value: pct(Number.isFinite(avgQuiz) ? avgQuiz / 100 : null), note: `${attempts.length} attempts` },
  ];
  const alerts = courses
    .map((c) => ({ course: c, ...healthOf(c.id, data) }))
    .filter((x) => x.health !== 'green');

  return section('🏠 Overview', `
    <div class="stats">${tiles.map((t) => `<div class="stat">
      <div class="stat-label">${esc(t.label)}</div>
      <div class="stat-value">${esc(t.value)}</div>
      <div class="stat-note">${esc(t.note)}</div></div>`).join('')}</div>
    ${alerts.length ? `<div style="margin-top:16px">${card(`<div class="stack divide">${alerts.map((a) => `
      <div class="row">${healthDot(a.health)}
        <span class="strong" style="flex:1">${esc(a.course.title)}</span>
        <span class="tiny muted">${esc(a.course.teacherName || '')}</span>
        ${badge(HEALTH_LABEL[a.health], a.health === 'red' ? 'red' : 'yellow')}
      </div>`).join('')}</div>`, { title: `⚠️ Needs attention (${alerts.length})` })}</div>` : ''}`,
  { id: 'sec-overview' });
}

function renderCourses(data) {
  const { courses, teachers } = data;
  const body = courses.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Health</th><th>Course</th><th>Slot</th><th>Teacher</th><th>Student</th>
        <th>Schedule</th><th>Milestones</th><th>Lessons</th><th>Last report</th><th></th></tr></thead>
      <tbody>${courses.map((c) => {
        const { health, progress, reports, lessons } = healthOf(c.id, data);
        return `<tr>
          <td>${healthDot(health)}</td>
          <td><span class="strong">${esc(c.title)}</span>
            ${c.goal ? `<br><span class="tiny muted">🎯 ${esc(c.goal)}</span>` : ''}</td>
          <td>${esc(c.slot ?? '—')}</td>
          <td style="min-width:190px">
            ${teachers.length ? `<select class="course-teacher" data-course="${esc(c.id)}">
              ${teachers.some((t) => t.id === c.teacherId) ? '' : `<option value="" selected>⚠️ ${esc(c.teacherName || 'unknown')}</option>`}
              ${teachers.map((t) => `<option value="${esc(t.id)}" ${t.id === c.teacherId ? 'selected' : ''}>
                ${t.kind === 'agent' ? '🤖 ' : ''}${esc(t.name || t.email)}</option>`).join('')}
            </select>` : esc(c.teacherName || '—')}
          </td>
          <td>${esc(c.studentName || '—')}<br><span class="tiny muted">${esc(c.skillLevel || '')}</span></td>
          <td class="nowrap">${esc(c.dayType || '—')}<br><span class="tiny muted">${esc(c.sessionLengthMin || '—')} min</span></td>
          <td style="min-width:130px">${bar(progress.pct, health === 'red' ? 'red' : health === 'yellow' ? 'yellow' : 'green',
            `${progress.achieved}/${progress.total}`)}</td>
          <td>${lessons.length}</td>
          <td class="nowrap tiny muted">${reports.length ? esc(fmtAgo(reports[0].filedAt)) : 'never'}</td>
          <td class="nowrap">
            <button class="btn btn-sm btn-danger" data-delete-course="${esc(c.id)}" title="Delete class">🗑️</button>
          </td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : empty('No courses yet — add the first one below.', '📚');
  return section('📚 All Courses', card(body), { id: 'sec-courses' });
}

function renderTeachers(data) {
  const { teachers, courses, reports } = data;
  const body = teachers.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Slot</th><th>Teacher</th><th>Course</th><th>Reports filed</th>
        <th>Last activity</th><th>Type</th><th></th></tr></thead>
      <tbody>${teachers.map((t) => {
        const theirCourses = courses.filter((c) => c.teacherId === t.id);
        const theirReports = reports.filter((r) => r.teacherId === t.id);
        const lastReport = theirReports[0];
        const lastActivity = [toDate(t.lastActiveAt), toDate(lastReport?.filedAt)]
          .filter(Boolean).sort((a, b) => b - a)[0];
        return `<tr>
          <td>${t.teacherSlot ? `<span class="pill">${esc(t.teacherSlot)}</span>` : '<span class="muted">—</span>'}</td>
          <td><span class="strong">${t.kind === 'agent' ? '🤖 ' : ''}${esc(t.name || '—')}</span>
            ${t.kind === 'agent' ? badge('agent', 'blue') : ''}
            <br><span class="tiny muted">${esc(t.email || '')}</span></td>
          <td>${theirCourses.length ? theirCourses.map((c) => esc(c.title)).join('<br>') : '<span class="tiny muted">unassigned</span>'}</td>
          <td>${theirReports.length}</td>
          <td class="nowrap tiny muted">${lastActivity ? esc(fmtAgo(lastActivity)) : 'never'}</td>
          <td>${t.kind === 'agent' ? badge('agent', 'blue') : badge('human', 'gray')}</td>
          <td class="nowrap">
            <button class="btn btn-sm" data-connect="${esc(t.id)}" title="Show connection details">🔌 Connect</button>
            <button class="btn btn-sm" data-remove-teacher="${esc(t.id)}" title="Remove profile">🗑️</button>
          </td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : empty('No teacher accounts yet — create one below.', '👩‍🏫');
  return section('👩‍🏫 All Teachers', card(body), { id: 'sec-teachers' });
}

function renderSetupKey({ setupKey }) {
  const masked = setupKey ? `${setupKey.slice(0, 6)}${'•'.repeat(Math.max(0, setupKey.length - 10))}${setupKey.slice(-4)}` : '';
  return section('🔑 Agent Setup Key', card(`
    <p class="small muted">An agent can provision itself as a new teacher — no dashboard clicks —
      by running <code>node principal.mjs setup</code> with this key in <code>PRINCIPAL_SETUP_KEY</code>.
      It can only ever create its own <code>role: "teacher"</code> profile this way, never an admin or
      student, and never another teacher's data. After it runs, it still needs a course: create one
      below with its account as the teacher, or tell the agent to run <code>course-create</code> itself.</p>
    <div class="row" style="margin-top:12px;align-items:center">
      ${setupKey
        ? `<code class="mono small" data-key-display data-full="${esc(setupKey)}" data-masked="${esc(masked)}">${esc(masked)}</code>
           <button class="btn btn-sm" data-reveal-key type="button">👁️ Reveal</button>
           <button class="btn btn-sm" data-copy-value="${esc(setupKey)}" type="button">📋 Copy</button>`
        : '<span class="tiny muted">No setup key yet — generate one before an agent can self-provision.</span>'}
      <button class="btn btn-sm" id="rotate-key-btn" type="button">${setupKey ? '🔄 Rotate' : '✨ Generate'}</button>
    </div>
    ${setupKey ? '<p class="hint" style="margin-top:8px">Rotating invalidates the old key immediately — any agent mid-setup with the old value will fail and must be given the new one.</p>' : ''}`,
    { title: 'Self-provisioning' }), { id: 'sec-setup-key' });
}

function renderGapReports(data) {
  const { courses, teachers } = data;
  return section('🩺 All Gap Reports', card(`
    <div class="field-row" style="margin-bottom:14px">
      <div class="field" style="margin:0">
        <label for="gap-search">Search</label>
        <input id="gap-search" type="text" placeholder="gap text, task, plan…">
      </div>
      <div class="field" style="margin:0">
        <label for="gap-course">Course</label>
        <select id="gap-course"><option value="">All courses</option>
          ${courses.map((c) => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin:0">
        <label for="gap-teacher">Teacher</label>
        <select id="gap-teacher"><option value="">All teachers</option>
          ${teachers.map((t) => `<option value="${esc(t.id)}">${esc(t.name || t.email)}</option>`).join('')}</select>
      </div>
      <div class="field" style="margin:0">
        <label for="gap-severity">Severity</label>
        <select id="gap-severity"><option value="">Any severity</option>
          <option value="critical">Critical</option><option value="major">Major</option>
          <option value="minor">Minor</option><option value="none">No gaps</option></select>
      </div>
    </div>
    <div id="gap-list"></div>`, { title: 'Every report filed', sub: 'newest first' }), { id: 'sec-gaps' });
}

function gapListHtml(reports, data) {
  const { sessionById, courseById, lessonById, userById } = data;
  if (!reports.length) return empty('No reports match those filters.', '🔍');
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Filed</th><th>Course</th><th>Lesson</th><th>Teacher</th>
      <th>Warm-up</th><th>Application</th><th>Gaps</th><th>Via</th><th></th></tr></thead>
    <tbody>${reports.map((r) => {
      const session = sessionById.get(r.sessionId);
      const course = courseById.get(session?.courseId);
      const lesson = lessonById.get(session?.lessonId);
      const gaps = Array.isArray(r.identifiedGaps) ? r.identifiedGaps : [];
      return `<tr>
        <td class="nowrap tiny muted">${esc(fmtAgo(r.filedAt))}<br>${esc(fmtDate(session?.scheduledDate, { relative: false }))}</td>
        <td>${esc(course?.title || '—')}</td>
        <td>${esc(lesson?.topic || '—')}</td>
        <td>${esc(userById.get(r.teacherId)?.name || '—')}</td>
        <td>${esc(pct(warmupScore(r)))}</td>
        <td>${badge(humanize(r.applicationResult || 'n/a'), kindFor(r.applicationResult))}</td>
        <td>${gaps.length ? gaps.map((g) => badge(humanize(g.severity), kindFor(g.severity))).join(' ') : badge('none', 'green')}</td>
        <td>${r.source === 'api' ? badge('agent', 'blue') : badge('dashboard', 'gray')}</td>
        <td><button class="btn-link tiny" data-report="${esc(r.id)}">View</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderQuizResults(data) {
  const { quizzes, attempts, courseById, courses } = data;
  const byCourse = courses.map((c) => {
    const courseQuizzes = quizzes.filter((q) => q.courseId === c.id);
    const ids = new Set(courseQuizzes.map((q) => q.id));
    const courseAttempts = attempts.filter((a) => ids.has(a.quizId));
    return { course: c, quizzes: courseQuizzes, attempts: courseAttempts, avg: quizAverage(courseAttempts) };
  });

  const perCourseCard = card(byCourse.length ? `<div class="stack divide">${byCourse.map((row) => `
      <div>
        <div class="row">
          <span class="strong" style="flex:1">${esc(row.course.title)}</span>
          <span class="tiny muted">${row.quizzes.length} quizzes · ${row.attempts.length} attempts</span>
        </div>
        <div style="margin-top:6px">${bar(Number.isFinite(row.avg) ? row.avg : 0,
          !Number.isFinite(row.avg) ? '' : row.avg >= 80 ? 'green' : row.avg >= 60 ? 'yellow' : 'red',
          Number.isFinite(row.avg) ? `${Math.round(row.avg)}%` : 'no data')}</div>
      </div>`).join('')}</div>` : empty('No courses yet.', '📊'), { title: 'Average score by course' });

  const quizTable = card(quizzes.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Quiz</th><th>Course</th><th>Questions</th><th>Limit</th><th>Attempts</th><th>Average</th><th></th></tr></thead>
      <tbody>${quizzes.map((q) => {
        const qAttempts = attempts.filter((a) => a.quizId === q.id);
        const avg = quizAverage(qAttempts);
        return `<tr>
          <td><span class="strong">${esc(q.title)}</span><br><span class="tiny muted">${esc(fmtAgo(q.createdAt))}</span></td>
          <td>${esc(courseById.get(q.courseId)?.title || '—')}</td>
          <td>${Array.isArray(q.questions) ? q.questions.length : 0}</td>
          <td>${q.timeLimitMinutes ? `${esc(q.timeLimitMinutes)} min` : '—'}</td>
          <td>${qAttempts.length}</td>
          <td>${Number.isFinite(avg) ? badge(`${Math.round(avg)}%`, avg >= 80 ? 'green' : avg >= 60 ? 'yellow' : 'red') : '<span class="muted">—</span>'}</td>
          <td class="nowrap"><a class="btn btn-sm" href="#/quiz/${encodeURIComponent(q.id)}">Preview</a></td>
        </tr>`;
      }).join('')}</tbody></table></div>` : empty('No quizzes created yet.', '📝'), { title: 'Every quiz' });

  /* The quiz table needs the full width — course averages sit above it. */
  return section('📝 All Quiz Results', `${perCourseCard}${quizTable}`, { id: 'sec-quizzes' });
}

function renderSystem(data) {
  const { teachers, courses, reports, attempts, sessions, users } = data;
  const unassigned = teachers.filter((t) => !courses.some((c) => c.teacherId === t.id));
  const orphanCourses = courses.filter((c) => !users.some((u) => u.id === c.teacherId));
  const lastWrite = [
    ...reports.map((r) => toDate(r.filedAt)),
    ...attempts.map((a) => toDate(a.completedAt)),
    ...sessions.map((s) => toDate(s.createdAt)),
  ].filter(Boolean).sort((a, b) => b - a)[0];

  const checks = [
    { ok: teachers.length > 0, label: `${teachers.length} teacher accounts`,
      detail: `${teachers.filter((t) => t.kind === 'agent').length} agents · ${teachers.filter((t) => t.kind !== 'agent').length} human` },
    { ok: teachers.every((t) => courses.some((c) => c.teacherId === t.id)) || !teachers.length,
      label: 'Every teacher owns a course',
      detail: 'an agent with no course cannot do anything' },
    { ok: !unassigned.length, label: 'Teachers assigned to courses', detail: unassigned.length ? `unassigned: ${unassigned.map((t) => t.name || t.email).join(', ')}` : 'all assigned' },
    { ok: !orphanCourses.length, label: 'Courses point at real teachers', detail: orphanCourses.length ? `${orphanCourses.length} course(s) reference a missing user` : 'all valid' },
    { ok: data.students.length > 0, label: 'Student account exists', detail: data.students.map((s) => s.name || s.email).join(', ') || 'none found' },
    { ok: Boolean(lastWrite), label: 'Data activity', detail: lastWrite ? `last write ${fmtDateTime(lastWrite)}` : 'no writes recorded yet' },
  ];

  return section('💚 System Health', `<div class="grid-2">
    ${card(`<div class="stack divide">${checks.map((c) => `
      <div class="row">
        <span>${c.ok ? '✅' : '⚠️'}</span>
        <span class="strong" style="flex:1">${esc(c.label)}</span>
        <span class="tiny muted right" style="max-width:55%">${esc(c.detail)}</span>
      </div>`).join('')}</div>`, { title: 'Checks' })}
    ${card(`
      <p class="small muted">Populates Firestore with the demo student, principal, four teachers, their
        courses, lesson plans, materials, milestones, sessions, gap reports and quizzes.
        Existing documents are left alone — seeding twice is safe.</p>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="seed-btn">🌱 Seed demo data</button>
        <span class="tiny muted">New accounts get the password
          <code>${esc(DEFAULT_NEW_ACCOUNT_PASSWORD)}</code></span>
      </div>
      <div id="seed-log" class="tiny mono muted" style="margin-top:12px;white-space:pre-wrap"></div>`,
      { title: 'Seed / demo data' })}
  </div>`, { id: 'sec-system' });
}

function renderAddCourse({ teachers }) {
  return section('➕ Add Course', card(`
    <form id="course-form">
      <div data-error></div>
      <div class="field-row">
        <div class="field"><label for="c-title">Course title</label>
          <input id="c-title" name="title" type="text" required placeholder="Algebra II Foundations"></div>
        <div class="field"><label for="c-teacher">Teacher</label>
          <select id="c-teacher" name="teacherId" required>
            ${teachers.length
              ? teachers.map((t) => `<option value="${esc(t.id)}" data-slot="${esc(t.teacherSlot ?? '')}">
                  ${esc(t.name || t.email)}${t.teacherSlot ? ` — slot ${esc(t.teacherSlot)}` : ''}</option>`).join('')
              : '<option value="">No teachers yet — create one first</option>'}
          </select></div>
        <div class="field"><label for="c-slot">Slot</label>
          <input id="c-slot" name="slot" type="number" min="1" max="6" required value="1"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="c-day">Day type</label>
          <select id="c-day" name="dayType" required>
            <option value="A-day">A-day (Mon/Wed/Fri)</option>
            <option value="B-day">B-day (Sun/Tue/Thu)</option>
          </select></div>
        <div class="field"><label for="c-len">Session length (min)</label>
          <input id="c-len" name="sessionLengthMin" type="number" min="10" max="240" required value="50"></div>
        <div class="field"><label for="c-student">Student name</label>
          <input id="c-student" name="studentName" type="text" required value="Bryan"></div>
        <div class="field"><label for="c-skill">Skill level</label>
          <input id="c-skill" name="skillLevel" type="text" required placeholder="Intermediate"></div>
      </div>
      <div class="field"><label for="c-goal">Goal</label>
        <textarea id="c-goal" name="goal" placeholder="Solve two-step equations independently by week 6."></textarea></div>
      <button class="btn btn-primary" type="submit" ${teachers.length ? '' : 'disabled'}>Create course</button>
      <p class="hint">Lessons, materials and milestones can be added by the teacher, by the seeder, or through the API.</p>
    </form>`, { title: 'New course' }), { id: 'sec-add-course' });
}

function renderAddAccount({ teachers }) {
  const usedSlots = new Set(teachers.map((t) => t.teacherSlot).filter(Boolean));
  const slotOptions = [1, 2, 3, 4, 5, 6]
    .map((n) => `<option value="${n}" ${usedSlots.has(n) ? 'disabled' : ''}>${n}${usedSlots.has(n) ? ' — taken' : ''}</option>`)
    .join('');

  return section('➕ Add Teacher or Student', card(`
    <form id="teacher-form">
      <div data-error></div>
      <div class="field-row">
        <div class="field"><label for="t-role">Role</label>
          <select id="t-role" name="role" required>
            <option value="teacher" selected>Teacher</option>
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select></div>
        <div class="field" id="t-kind-field"><label for="t-kind">Teacher type</label>
          <select id="t-kind" name="kind" required>
            <option value="agent" selected>🤖 AI agent</option>
            <option value="human">🧑 Human</option>
          </select></div>
        <div class="field" id="t-slot-field"><label for="t-slot">Teacher slot</label>
          <select id="t-slot" name="teacherSlot">${slotOptions}</select></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="t-name">Name</label>
          <input id="t-name" name="name" type="text" required placeholder="Algebra Agent"></div>
        <div class="field"><label for="t-email">Email</label>
          <input id="t-email" name="email" type="email" required placeholder="algebra-agent@agents.local"></div>
        <div class="field" id="t-pass-field"><label for="t-pass" id="t-pass-label">Password</label>
          <input id="t-pass" name="password" type="text" required minlength="6"
            value="${esc(DEFAULT_NEW_ACCOUNT_PASSWORD)}"></div>
      </div>

      <details class="lesson" style="margin:4px 0 14px">
        <summary>The account already exists (it signed itself up)</summary>
        <div class="lesson-body">
          <p class="small muted">If an agent already created its own login, it has no profile here — which
            is why every write is denied. Paste the UID it reports and this form will attach a profile to
            that existing account instead of creating a new one. The agent keeps the password it already has.</p>
          <div class="field" style="margin:10px 0 0">
            <label for="t-uid">Existing account UID</label>
            <input id="t-uid" name="existingUid" type="text" placeholder="0nWKZgGrYnOKXxaUNane8LngV5B2">
            <p class="hint">Firebase console → Authentication → Users, or ask the agent for its UID.</p>
          </div>
        </div>
      </details>

      <button class="btn btn-primary" type="submit">Create</button>
      <p class="hint" id="t-hint"></p>
    </form>`, {
    title: 'New account',
    sub: 'Agents get credentials for the API; people sign in to this dashboard',
  }), { id: 'sec-add-teacher' });
}

/** Strong random password for an agent account — it is a credential, not a
    thing anybody types. */
function generatePassword() {
  const bytes = new Uint8Array(11);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The environment an agent needs to reach Firestore directly. */
function agentEnvBlock({ email, password }) {
  return [
    `PRINCIPAL_PROJECT_ID=${firebaseConfig.projectId}`,
    `PRINCIPAL_WEB_API_KEY=${firebaseConfig.apiKey}`,
    `PRINCIPAL_AGENT_EMAIL=${email}`,
    `PRINCIPAL_AGENT_PASSWORD=${password || '<the password you set>'}`,
  ].join('\n');
}

function copyButtons(dialog) {
  dialog.querySelectorAll('[data-copy-value]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copyValue);
        toast('Copied.', 'ok');
      } catch {
        toast('Copy failed — select the text and copy manually.', 'err');
      }
    });
  });
}

/** Shown once, right after an agent teacher is created. */
function revealAgentCredentials({ name, email, password }) {
  const env = agentEnvBlock({ email, password });
  const dialog = sheet(`🤖 ${esc(name)} — agent credentials`, `
    <p class="small muted">Paste these four variables into the agent's environment
      (<code>openclaw.json</code> env block, or an <code>.env</code> it reads). It signs in as this
      teacher and the Firestore rules confine it to ${esc(name)}'s course.</p>
    <pre class="mono tiny" style="background:#f6f7fb;padding:12px;border-radius:9px;overflow:auto;margin:12px 0 0">${esc(env)}</pre>
    <p style="margin-top:10px"><button class="btn btn-sm" data-copy-value="${esc(env)}">📋 Copy all four</button></p>
    <div class="note" style="margin-top:14px">${password
      ? 'Copy the password now — Firebase stores it hashed, so it cannot be shown again. If it is lost, reset it in <strong>Firebase console → Authentication → Users</strong>.'
      : 'This account keeps the password it already had. If you do not know it, reset it in <strong>Firebase console → Authentication → Users</strong>.'}</div>
    <p class="tiny muted" style="margin-top:14px">Verify the connection from the agent's machine:</p>
    <pre class="mono tiny" style="background:#f6f7fb;padding:12px;border-radius:9px;overflow:auto;margin:4px 0 0">node principal.mjs whoami</pre>`);
  copyButtons(dialog);
}

/** Reopened later from All Teachers — everything except the password. */
function showAgentEnv(teacher) {
  const env = agentEnvBlock({ email: teacher.email, password: null });
  const dialog = sheet(`🔌 ${esc(teacher.name || teacher.email)} — connection`, `
    <p class="small muted">These are the values this teacher's agent needs.</p>
    <pre class="mono tiny" style="background:#f6f7fb;padding:12px;border-radius:9px;overflow:auto;margin:12px 0 0">${esc(env)}</pre>
    <p style="margin-top:10px"><button class="btn btn-sm" data-copy-value="${esc(env)}">📋 Copy</button></p>
    <div class="note" style="margin-top:14px">The password is not recoverable — Firebase only stores a
      hash. To issue a new one, use <strong>Firebase console → Authentication → Users → Reset
      password</strong>, then update the agent's environment.</div>
`);
  copyButtons(dialog);
}

/* --------------------------------------------------------------- wiring */

function wire(root, mount, ctx, data) {
  const reload = () => render(mount, ctx);

  /* ---- gap report filtering ---- */
  const listEl = root.querySelector('#gap-list');
  const search = root.querySelector('#gap-search');
  const courseSel = root.querySelector('#gap-course');
  const teacherSel = root.querySelector('#gap-teacher');
  const sevSel = root.querySelector('#gap-severity');

  const applyFilters = () => {
    const term = (search.value || '').trim().toLowerCase();
    const filtered = data.reports.filter((r) => {
      const session = data.sessionById.get(r.sessionId);
      if (courseSel.value && session?.courseId !== courseSel.value) return false;
      if (teacherSel.value && r.teacherId !== teacherSel.value) return false;
      const gaps = Array.isArray(r.identifiedGaps) ? r.identifiedGaps : [];
      if (sevSel.value === 'none' && gaps.length) return false;
      if (sevSel.value && sevSel.value !== 'none' && !gaps.some((g) => g.severity === sevSel.value)) return false;
      if (!term) return true;
      const haystack = [
        r.applicationTask, r.applicationNotes, r.remediationPlan,
        ...gaps.map((g) => g.description),
        ...(Array.isArray(r.warmupResults) ? r.warmupResults.map((w) => w.question) : []),
        data.courseById.get(session?.courseId)?.title,
        data.lessonById.get(session?.lessonId)?.topic,
        data.userById.get(r.teacherId)?.name,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(term);
    });
    listEl.innerHTML = gapListHtml(filtered, data);
  };

  [search, courseSel, teacherSel, sevSel].forEach((el) => {
    el.addEventListener('input', applyFilters);
    el.addEventListener('change', applyFilters);
  });
  applyFilters();

  /* ---- report viewer ---- */
  root.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-report]');
    if (!btn) return;
    const report = data.reports.find((r) => r.id === btn.dataset.report);
    if (report) showReport(report, data);
  });

  /* ---- reopen an agent's connection details ---- */
  root.addEventListener('click', (event) => {
    const connect = event.target.closest('[data-connect]');
    if (!connect) return;
    const teacher = data.userById.get(connect.dataset.connect);
    if (teacher) showAgentEnv(teacher);
  });

  /* ---- remove a teacher's profile ---- */
  root.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-remove-teacher]');
    if (!btn) return;
    const teacher = data.userById.get(btn.dataset.removeTeacher);
    if (!teacher) return;
    const owns = data.courses.filter((c) => c.teacherId === teacher.id);
    const warning = owns.length
      ? ` This teacher still owns ${owns.length} course(s) — those will be orphaned until reassigned.`
      : '';
    if (!confirm(`Remove ${teacher.name || teacher.email}'s profile?${warning}\n\nThis revokes dashboard/agent access immediately but does not delete the underlying Firebase Auth login — do that from the Firebase console if needed.`)) return;
    btn.disabled = true;
    try {
      await deleteUserProfile(teacher.id);
      toast(`${teacher.name || teacher.email} removed.`, 'ok');
      reload();
    } catch (err) {
      console.error(err);
      toast(`Could not remove: ${err.message}`, 'err');
      btn.disabled = false;
    }
  });

  /* ---- copy buttons that live on the page itself, not inside a sheet ---- */
  root.querySelectorAll('[data-copy-value]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copyValue);
        toast('Copied.', 'ok');
      } catch {
        toast('Copy failed — select the text and copy manually.', 'err');
      }
    });
  });

  /* ---- agent setup key: reveal / generate / rotate ---- */
  root.querySelector('[data-reveal-key]')?.addEventListener('click', (event) => {
    const btn = event.currentTarget;
    const display = root.querySelector('[data-key-display]');
    if (!display) return;
    const revealed = display.textContent === display.dataset.full;
    display.textContent = revealed ? display.dataset.masked : display.dataset.full;
    btn.textContent = revealed ? '👁️ Reveal' : '🙈 Hide';
  });
  root.querySelector('#rotate-key-btn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    if (data.setupKey && !confirm('Rotate the setup key? Any agent mid-setup with the old key will fail until given the new one.')) return;
    btn.disabled = true;
    try {
      await rotateSetupKey();
      toast('Setup key ready.', 'ok');
      reload();
    } catch (err) {
      console.error(err);
      toast(`Could not rotate the key: ${err.message}`, 'err');
      btn.disabled = false;
    }
  });

  /* ---- delete a course and everything filed under it ---- */
  root.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-delete-course]');
    if (!btn) return;
    const course = data.courseById.get(btn.dataset.deleteCourse);
    if (!course) return;
    const { lessons } = data.perCourse.find((p) => p.course.id === course.id) || { lessons: [] };
    const sessionCount = data.sessions.filter((s) => s.courseId === course.id).length;
    const reportCount = data.reports.filter((r) => data.sessionById.get(r.sessionId)?.courseId === course.id).length;
    if (!confirm(`Delete "${course.title}" permanently?\n\nThis removes the course along with its `
      + `${lessons.length} lesson(s), ${sessionCount} session(s) and ${reportCount} gap report(s), plus its `
      + 'milestones, quizzes, quiz attempts, homework and self-assessments. This cannot be undone.')) return;
    btn.disabled = true;
    try {
      await deleteCourse(course.id);
      toast(`${course.title} deleted.`, 'ok');
      reload();
    } catch (err) {
      console.error(err);
      toast(`Could not delete: ${err.message}`, 'err');
      btn.disabled = false;
    }
  });

  /* ---- reassign a course to another teacher ---- */
  root.querySelectorAll('.course-teacher').forEach((select) => {
    select.addEventListener('change', async () => {
      const teacher = data.userById.get(select.value);
      if (!teacher) return;
      select.disabled = true;
      try {
        await updateCourse(select.dataset.course, {
          teacherId: teacher.id,
          teacherName: teacher.name || teacher.email || '',
        });
        toast(`Course reassigned to ${teacher.name || teacher.email}.`, 'ok');
        reload();
      } catch (err) {
        console.error(err);
        toast(`Could not reassign: ${err.message}`, 'err');
        select.disabled = false;
      }
    });
  });

  /* ---- add course ---- */
  const courseForm = root.querySelector('#course-form');
  const teacherSelect = courseForm?.querySelector('#c-teacher');
  teacherSelect?.addEventListener('change', () => {
    const slot = teacherSelect.selectedOptions[0]?.dataset.slot;
    if (slot) courseForm.querySelector('#c-slot').value = slot;
  });
  if (teacherSelect) teacherSelect.dispatchEvent(new Event('change'));

  if (courseForm) {
    bindForm(courseForm, async (fd) => {
      const teacherId = String(fd.get('teacherId'));
      const teacher = data.userById.get(teacherId);
      if (!teacher) throw new Error('Pick a teacher for this course.');
      await createCourse({
        title: String(fd.get('title')).trim(),
        teacherId,
        teacherName: teacher.name || teacher.email || '',
        slot: Number(fd.get('slot')),
        dayType: String(fd.get('dayType')),
        sessionLengthMin: Number(fd.get('sessionLengthMin')),
        studentName: String(fd.get('studentName')).trim(),
        skillLevel: String(fd.get('skillLevel')).trim(),
        goal: String(fd.get('goal') || '').trim(),
      });
      toast('Course created.', 'ok');
      reload();
    });
  }

  /* ---- add teacher: agent (API key only) or human (Auth account) ---- */
  const teacherForm = root.querySelector('#teacher-form');
  if (teacherForm) {
    const kindSelect = teacherForm.querySelector('#t-kind');
    const roleSelect = teacherForm.querySelector('#t-role');
    const passInput = teacherForm.querySelector('#t-pass');
    const hint = teacherForm.querySelector('#t-hint');

    const passField = teacherForm.querySelector('#t-pass-field');
    const kindField = teacherForm.querySelector('#t-kind-field');
    const slotField = teacherForm.querySelector('#t-slot-field');
    const uidInput = teacherForm.querySelector('#t-uid');

    /* Remember the teacher type the admin actually chose, so bouncing through
       Student (which forces "human") does not silently change it back. */
    let preferredTeacherKind = kindSelect.value;
    kindSelect.addEventListener('change', () => {
      if (roleSelect.value === 'teacher') preferredTeacherKind = kindSelect.value;
    });

    /* Teacher slots and the agent/human choice only apply to teachers. */
    const syncForm = () => {
      const isTeacher = roleSelect.value === 'teacher';
      const attaching = Boolean(uidInput.value.trim());

      kindField.hidden = !isTeacher;
      slotField.hidden = !isTeacher;
      kindSelect.disabled = !isTeacher;
      kindSelect.value = isTeacher ? preferredTeacherKind : 'human';
      const isAgent = isTeacher && kindSelect.value === 'agent';

      passField.hidden = attaching;
      passInput.required = !attaching;
      teacherForm.querySelector('#t-pass-label').textContent = isAgent
        ? 'Generated password (the agent\u2019s credential)'
        : 'Initial password';
      if (isAgent && passInput.value === DEFAULT_NEW_ACCOUNT_PASSWORD) passInput.value = generatePassword();
      if (!isAgent && passInput.value.length === 22) passInput.value = DEFAULT_NEW_ACCOUNT_PASSWORD;

      teacherForm.querySelector('[type=submit]').textContent = attaching
        ? 'Attach profile to existing account'
        : (isAgent ? 'Create agent teacher' : `Create ${roleSelect.value}`);

      hint.innerHTML = attaching
        ? 'Writes only the <code>users/{uid}</code> profile for that existing account — no new login, no password change. This is the fix when an agent signed itself up and gets <code>PERMISSION_DENIED</code>.'
        : (isAgent
          ? 'Creates the account the agent signs in as plus its profile. The agent reaches Firestore directly and the rules confine it to its own course. Copy the password when it is shown — it cannot be shown again.'
          : 'Creates the Firebase Auth user and its profile. Your own session stays signed in.');
    };
    [kindSelect, roleSelect].forEach((el) => el.addEventListener('change', syncForm));
    uidInput.addEventListener('input', syncForm);
    syncForm();

    bindForm(teacherForm, async (fd) => {
      const role = String(fd.get('role'));
      const isTeacher = role === 'teacher';
      const isAgent = isTeacher && String(fd.get('kind')) === 'agent';
      const email = String(fd.get('email')).trim();
      const name = String(fd.get('name')).trim();
      const existingUid = String(fd.get('existingUid') || '').trim();
      const slot = isTeacher ? Number(fd.get('teacherSlot')) : null;
      const profile = {
        name, email, role, teacherSlot: slot,
        kind: isAgent ? 'agent' : 'human',
        createdAt: new Date(),
      };

      if (existingUid) {
        /* Attach a profile to a login that already exists. */
        await saveUserProfile(existingUid, profile);
        toast(`Profile attached to ${name}.`, 'ok');
        if (isAgent) revealAgentCredentials({ name, email, password: null });
        reload();
        return;
      }

      const password = String(fd.get('password'));
      const secondary = createSecondaryApp();
      try {
        const cred = await createUserWithEmailAndPassword(secondary.auth, email, password);
        await saveUserProfile(cred.user.uid, profile);
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
          throw new Error('That email already has a login. Open "The account already exists" above and paste its UID to attach a profile instead.');
        }
        throw err;
      } finally {
        secondary.dispose();
      }

      toast(`${name} added as ${role}.`, 'ok');
      if (isAgent) revealAgentCredentials({ name, email, password });
      reload();
    });
  }

  /* ---- seeding ---- */
  root.querySelector('#seed-btn')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    const log = root.querySelector('#seed-log');
    if (!confirm('Seed demo courses, lessons, sessions, gap reports and quizzes into this Firestore project?')) return;
    btn.disabled = true;
    btn.textContent = 'Seeding…';
    log.textContent = '';
    try {
      const { seedAll } = await import('../seed.js');
      await seedAll({ log: (line) => { log.textContent += `${line}\n`; } });
      toast('Seeding complete.', 'ok');
      setTimeout(reload, 800);
    } catch (err) {
      console.error(err);
      log.textContent += `\n✗ ${err.message}`;
      toast(`Seeding failed: ${err.message}`, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '🌱 Seed demo data';
    }
  });
}

function showReport(report, { sessionById, courseById, lessonById, userById }) {
  const session = sessionById.get(report.sessionId);
  const course = courseById.get(session?.courseId);
  const lesson = lessonById.get(session?.lessonId);
  const warmups = Array.isArray(report.warmupResults) ? report.warmupResults : [];
  const gaps = Array.isArray(report.identifiedGaps) ? report.identifiedGaps : [];
  sheet(`${esc(course?.title || 'Course')} — ${esc(lesson?.topic || 'session')}`, `
    <p class="small muted">${esc(userById.get(report.teacherId)?.name || 'Teacher')} ·
      session ${esc(fmtDate(session?.scheduledDate, { relative: false }))} ·
      filed ${esc(fmtDateTime(report.filedAt))}</p>
    <div class="row" style="margin:12px 0">
      <span class="pill">warm-up ${esc(pct(warmupScore(report)))}</span>
      ${badge(humanize(report.applicationResult || 'n/a'), kindFor(report.applicationResult))}
    </div>
    <h4 class="small strong">Warm-up</h4>
    <div class="stack" style="margin:6px 0 14px">${warmups.length ? warmups.map((w) => `
      <div class="row"><span class="small" style="flex:1">${esc(w.question)}</span>
        ${badge(humanize(w.result), kindFor(w.result))}</div>`).join('') : '<p class="small muted">None recorded.</p>'}</div>
    <h4 class="small strong">Application task</h4>
    <p class="small" style="margin:6px 0 4px;white-space:pre-wrap">${esc(report.applicationTask || '—')}</p>
    ${report.applicationNotes ? `<p class="small muted" style="white-space:pre-wrap">${esc(report.applicationNotes)}</p>` : ''}
    <h4 class="small strong" style="margin-top:14px">Identified gaps</h4>
    <div class="stack" style="margin:6px 0 14px">${gaps.length ? gaps.map((g) => `
      <div class="row">${badge(humanize(g.severity), kindFor(g.severity))}
        <span class="small" style="flex:1">${esc(g.description)}</span></div>`).join('')
      : '<p class="small muted">No gaps identified.</p>'}</div>
    <h4 class="small strong">Remediation plan</h4>
    <p class="small" style="margin-top:6px;white-space:pre-wrap">${esc(report.remediationPlan || '—')}</p>`);
}
