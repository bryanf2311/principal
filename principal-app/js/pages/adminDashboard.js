/* ============================================================
   #/admin — system-wide view.
   Courses & health · teachers & keys · every gap report
   (searchable) · aggregate quiz results · system health ·
   add course · add account · demo seeding
   ============================================================ */

import { createUserWithEmailAndPassword } from 'firebase/auth';
import { createSecondaryApp, DEFAULT_NEW_ACCOUNT_PASSWORD } from '../firebase-config.js';
import {
  listUsers, listCourses, listLessons, listMilestones, listSessions, listGapReports,
  listQuizzes, listQuizAttempts, createCourse, saveUserProfile, rotateApiKey,
  generateApiKey, milestoneProgress, courseHealth, warmupScore, quizAverage, HEALTH_LABEL,
} from '../api.js';
import {
  esc, section, card, badge, bar, empty, healthDot, skeletonPage, sheet,
  fmtDate, fmtAgo, fmtDateTime, todayYMD, kindFor, humanize, pct, toast, bindForm, toDate,
} from '../ui.js';

export async function render(mount, ctx) {
  mount.innerHTML = skeletonPage();

  const [users, courses, sessions, reports, quizzes, attempts] = await Promise.all([
    listUsers(),
    listCourses(),
    listSessions(),
    listGapReports(),
    listQuizzes(),
    listQuizAttempts(),
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
    attempts, userById, courseById, sessionById, lessonById };

  ctx.setHeader('Admin Dashboard',
    `${courses.length} courses · ${teachers.length} teachers · ${reports.length} gap reports`);

  mount.innerHTML = `<div id="admin-root">${[
    renderOverview(data),
    renderCourses(data),
    renderTeachers(data),
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
    { label: 'Teachers', value: teachers.length, note: `${teachers.filter((t) => t.apiKey).length} with API keys` },
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
  const { courses } = data;
  const body = courses.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Health</th><th>Course</th><th>Slot</th><th>Teacher</th><th>Student</th>
        <th>Schedule</th><th>Milestones</th><th>Lessons</th><th>Last report</th></tr></thead>
      <tbody>${courses.map((c) => {
        const { health, progress, reports, lessons } = healthOf(c.id, data);
        return `<tr>
          <td>${healthDot(health)}</td>
          <td><span class="strong">${esc(c.title)}</span>
            ${c.goal ? `<br><span class="tiny muted">🎯 ${esc(c.goal)}</span>` : ''}</td>
          <td>${esc(c.slot ?? '—')}</td>
          <td>${esc(c.teacherName || '—')}</td>
          <td>${esc(c.studentName || '—')}<br><span class="tiny muted">${esc(c.skillLevel || '')}</span></td>
          <td class="nowrap">${esc(c.dayType || '—')}<br><span class="tiny muted">${esc(c.sessionLengthMin || '—')} min</span></td>
          <td style="min-width:130px">${bar(progress.pct, health === 'red' ? 'red' : health === 'yellow' ? 'yellow' : 'green',
            `${progress.achieved}/${progress.total}`)}</td>
          <td>${lessons.length}</td>
          <td class="nowrap tiny muted">${reports.length ? esc(fmtAgo(reports[0].filedAt)) : 'never'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : empty('No courses yet — add the first one below.', '📚');
  return section('📚 All Courses', card(body), { id: 'sec-courses' });
}

function renderTeachers(data) {
  const { teachers, courses, reports } = data;
  const body = teachers.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Slot</th><th>Teacher</th><th>Course</th><th>Reports filed</th>
        <th>Last activity</th><th>API key</th><th></th></tr></thead>
      <tbody>${teachers.map((t) => {
        const theirCourses = courses.filter((c) => c.teacherId === t.id);
        const theirReports = reports.filter((r) => r.teacherId === t.id);
        const lastReport = theirReports[0];
        const lastActivity = [toDate(t.lastActiveAt), toDate(lastReport?.filedAt)]
          .filter(Boolean).sort((a, b) => b - a)[0];
        return `<tr>
          <td>${t.teacherSlot ? `<span class="pill">${esc(t.teacherSlot)}</span>` : '<span class="muted">—</span>'}</td>
          <td><span class="strong">${esc(t.name || '—')}</span><br><span class="tiny muted">${esc(t.email || '')}</span></td>
          <td>${theirCourses.length ? theirCourses.map((c) => esc(c.title)).join('<br>') : '<span class="tiny muted">unassigned</span>'}</td>
          <td>${theirReports.length}</td>
          <td class="nowrap tiny muted">${lastActivity ? esc(fmtAgo(lastActivity)) : 'never'}</td>
          <td>${t.apiKey
            ? `${badge('active', 'green')}<br><code class="tiny">${esc(String(t.apiKey).slice(0, 11))}…</code>`
            : badge('missing', 'red')}</td>
          <td class="nowrap">
            <button class="btn btn-sm" data-rotate="${esc(t.id)}">${t.apiKey ? '♻︎ Rotate' : '＋ Generate'}</button>
            ${t.apiKey ? `<button class="btn btn-sm" data-copy-key="${esc(t.id)}">📋</button>` : ''}
          </td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : empty('No teacher accounts yet — create one below.', '👩‍🏫');
  return section('👩‍🏫 All Teachers', card(body), { id: 'sec-teachers' });
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
      <th>Warm-up</th><th>Application</th><th>Gaps</th><th></th></tr></thead>
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
  const missingKeys = teachers.filter((t) => !t.apiKey);
  const unassigned = teachers.filter((t) => !courses.some((c) => c.teacherId === t.id));
  const orphanCourses = courses.filter((c) => !users.some((u) => u.id === c.teacherId));
  const lastWrite = [
    ...reports.map((r) => toDate(r.filedAt)),
    ...attempts.map((a) => toDate(a.completedAt)),
    ...sessions.map((s) => toDate(s.createdAt)),
  ].filter(Boolean).sort((a, b) => b - a)[0];

  const checks = [
    { ok: teachers.length > 0, label: `${teachers.length} teacher accounts`, detail: 'slots 1–6' },
    { ok: !missingKeys.length, label: 'API keys issued', detail: missingKeys.length ? `missing: ${missingKeys.map((t) => t.name || t.email).join(', ')}` : 'every teacher has a key' },
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

  return section('➕ Add Teacher', card(`
    <form id="teacher-form">
      <div data-error></div>
      <div class="field-row">
        <div class="field"><label for="t-name">Full name</label>
          <input id="t-name" name="name" type="text" required placeholder="Ms. Rivera"></div>
        <div class="field"><label for="t-email">Email</label>
          <input id="t-email" name="email" type="email" required placeholder="teacher3@example.com"></div>
      </div>
      <div class="field-row">
        <div class="field"><label for="t-role">Role</label>
          <select id="t-role" name="role" required>
            <option value="teacher" selected>Teacher</option>
            <option value="student">Student</option>
            <option value="admin">Admin</option>
          </select></div>
        <div class="field"><label for="t-slot">Teacher slot</label>
          <select id="t-slot" name="teacherSlot">${slotOptions}</select></div>
        <div class="field"><label for="t-pass">Initial password</label>
          <input id="t-pass" name="password" type="text" required minlength="6"
            value="${esc(DEFAULT_NEW_ACCOUNT_PASSWORD)}"></div>
      </div>
      <button class="btn btn-primary" type="submit">Create account</button>
      <p class="hint">Creates the Firebase Auth user and its <code>users/{uid}</code> profile, and issues an API key
        for teachers. Your own session stays signed in. Ask them to change the password after first sign-in.</p>
    </form>`, { title: 'New account', sub: 'Teacher by default — students and admins too' }), { id: 'sec-add-teacher' });
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

  /* ---- API key actions ---- */
  root.addEventListener('click', async (event) => {
    const rotate = event.target.closest('[data-rotate]');
    const copy = event.target.closest('[data-copy-key]');
    if (rotate) {
      const teacher = data.userById.get(rotate.dataset.rotate);
      if (teacher?.apiKey && !confirm(`Rotate the API key for ${teacher.name || teacher.email}? The old key stops working immediately.`)) return;
      rotate.disabled = true;
      try {
        await rotateApiKey(rotate.dataset.rotate);
        toast('API key updated.', 'ok');
        reload();
      } catch (err) {
        console.error(err);
        toast(`Could not rotate key: ${err.message}`, 'err');
        rotate.disabled = false;
      }
      return;
    }
    if (copy) {
      const teacher = data.userById.get(copy.dataset.copyKey);
      try {
        await navigator.clipboard.writeText(teacher?.apiKey || '');
        toast(`Copied ${teacher?.name || 'teacher'}’s API key.`, 'ok');
      } catch {
        sheet('API key', `<code class="mono">${esc(teacher?.apiKey || '')}</code>`);
      }
    }
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

  /* ---- add account (secondary app keeps the admin signed in) ---- */
  const teacherForm = root.querySelector('#teacher-form');
  if (teacherForm) {
    bindForm(teacherForm, async (fd) => {
      const role = String(fd.get('role'));
      const email = String(fd.get('email')).trim();
      const name = String(fd.get('name')).trim();
      const password = String(fd.get('password'));
      const slot = role === 'teacher' ? Number(fd.get('teacherSlot')) : null;

      const secondary = createSecondaryApp();
      try {
        const cred = await createUserWithEmailAndPassword(secondary.auth, email, password);
        await saveUserProfile(cred.user.uid, {
          name,
          email,
          role,
          teacherSlot: slot,
          apiKey: role === 'teacher' ? generateApiKey() : '',
          createdAt: new Date(),
        });
      } finally {
        secondary.dispose();
      }
      toast(`${name} added as ${role}.`, 'ok');
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
