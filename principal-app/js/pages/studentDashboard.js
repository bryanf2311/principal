/* ============================================================
   #/dashboard — the student's home.
   Today's classes · quick stats · upcoming timeline · progress
   per course · pending quizzes · recent gap reports · reflection
   ============================================================ */

import {
  listCourses, listLessons, listMaterialsForLessons, listMilestones, listSessions,
  listGapReports, listQuizzes, listQuizAttempts, createStudentAssessment,
  listHomework, setHomeworkStatus,
  milestoneProgress, courseHealth, currentStreak, averageWarmup, warmupScore,
  HEALTH_LABEL,
} from '../api.js';
import {
  esc, section, card, badge, bar, empty, healthDot, materialLink, skeletonPage,
  fmtDate, fmtTime, fmtAgo, todayYMD, addDaysYMD, kindFor, humanize, pct, toast, bindForm,
  HOMEWORK_TYPE_ICON,
} from '../ui.js';
import { isOpenClawConfigured } from '../openclaw-config.js';
import { streamChat } from '../openclaw-client.js';

export async function render(mount, ctx) {
  mount.innerHTML = skeletonPage();

  const today = todayYMD();
  const [courses, allSessions, reports, quizzes, attempts, homework] = await Promise.all([
    listCourses(),
    listSessions(),
    listGapReports(),
    listQuizzes(),
    listQuizAttempts({ userId: ctx.user.uid }),
    listHomework(),
  ]);

  const perCourse = await Promise.all(courses.map(async (course) => ({
    course,
    lessons: await listLessons(course.id),
    milestones: await listMilestones(course.id),
  })));

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const lessonIndex = new Map();          // lessonId -> lesson
  const lessonsByCourse = new Map();      // courseId -> lessons[]
  const milestonesByCourse = new Map();
  perCourse.forEach(({ course, lessons, milestones }) => {
    lessonsByCourse.set(course.id, lessons);
    milestonesByCourse.set(course.id, milestones);
    lessons.forEach((l) => lessonIndex.set(l.id, { ...l, courseId: course.id }));
  });
  const sessionById = new Map(allSessions.map((s) => [s.id, s]));

  const todaySessions = allSessions.filter((s) => s.scheduledDate === today && s.status !== 'cancelled');
  const upcoming = allSessions
    .filter((s) => s.scheduledDate > today && s.status === 'upcoming')
    .slice(0, 7);
  const completed = allSessions.filter((s) => s.status === 'completed');

  /* Materials only for the lessons shown today — keeps reads small. */
  const todayPairs = todaySessions
    .map((s) => ({ courseId: s.courseId, lessonId: s.lessonId }))
    .filter((p) => p.courseId && p.lessonId);
  const todayMaterials = await listMaterialsForLessons(todayPairs);

  const teachers = [...new Map(
    courses.filter((c) => c.teacherId).map((c) => [c.teacherId, { id: c.teacherId, name: c.teacherName || 'Teacher' }]),
  ).values()];

  mount.innerHTML = [
    renderToday(todaySessions, { courseById, lessonIndex, todayMaterials }),
    renderClasses(perCourse, { allSessions, lessonIndex, today }),
    renderChat(teachers),
    renderHomework(homework, { courseById }),
    renderStats({ completed, allSessions, reports, today }),
    renderUpcoming(upcoming, { courseById, lessonIndex }),
    renderProgress(perCourse, { reports, sessionById }),
    renderQuizzes(quizzes, attempts, { courseById }),
    renderActivity(reports, { sessionById, courseById, lessonIndex }),
    renderReflection(completed, { courseById, lessonIndex }),
  ].join('');

  return wire(mount, ctx, { completed, courseById, allSessions, lessonIndex, reports, teachers });
}

/* ------------------------------------------------------------ sections */

function renderToday(sessions, { courseById, lessonIndex, todayMaterials }) {
  if (!sessions.length) {
    return section('📅 Today’s Classes', card(
      empty('No sessions scheduled today! Enjoy the breathing room, or get a head start on an upcoming lesson.', '🌤️'),
    ), { id: 'sec-today' });
  }

  const cards = sessions.map((s) => {
    const course = courseById.get(s.courseId);
    const lesson = lessonIndex.get(s.lessonId);
    const materials = todayMaterials[s.lessonId] || [];
    const done = s.status === 'completed';
    return card(`
      <div class="row">
        <span class="hero-time">🕐 ${esc(fmtTime(s.scheduledTime))}</span>
        ${course?.sessionLengthMin ? `<span class="hero-label">${esc(course.sessionLengthMin)} min</span>` : ''}
        ${done ? badge('completed', 'green') : ''}
      </div>
      <h4>${esc(lesson?.topic || course?.title || 'Session')}</h4>
      <p class="hero-meta">${esc(course?.title || 'Course')} · ${esc(course?.teacherName || 'Teacher')}
        ${lesson ? ` · Week ${esc(lesson.weekNumber)}, session ${esc(lesson.sessionNumber)}` : ''}</p>
      ${lesson?.objective ? `<p class="hero-body"><strong>Objective:</strong> ${esc(lesson.objective)}</p>` : ''}
      ${lesson?.homework ? `<p class="hero-body"><strong>Homework:</strong> ${esc(lesson.homework)}</p>` : ''}
      ${materials.length ? `<p class="hero-label" style="margin:14px 0 8px">Materials</p>
        <div class="stack">${materials.map((m) => materialLink(m, s.courseId, s.lessonId)).join('')}</div>` : ''}
    `, { cls: 'hero' });
  }).join('');

  return section('📅 Today’s Classes', `<div class="grid">${cards}</div>`, {
    sub: `${sessions.length} ${sessions.length === 1 ? 'class' : 'classes'} scheduled`,
    id: 'sec-today',
  });
}

/** One tab per course; each tab lists every session for that course, newest
    first, so past classes are one click away — not just what's upcoming. */
function renderClasses(perCourse, { allSessions, lessonIndex, today }) {
  if (!perCourse.length) {
    return section('📚 My Classes', card(empty('No courses yet. An admin can add one from the Admin dashboard.', '📚')), { id: 'sec-classes' });
  }

  const tabs = perCourse.map(({ course }, i) => `
    <button type="button" class="tab-btn ${i === 0 ? 'active' : ''}" data-tab-btn="${esc(course.id)}">${esc(course.title)}</button>
  `).join('');

  const panels = perCourse.map(({ course }, i) => {
    const sessions = allSessions
      .filter((s) => s.courseId === course.id)
      .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)
        || String(b.scheduledTime || '').localeCompare(String(a.scheduledTime || '')));

    const rows = sessions.length ? sessions.map((s) => {
      const lesson = lessonIndex.get(s.lessonId);
      const isToday = s.scheduledDate === today;
      const statusBadge = s.status === 'completed' ? badge('completed', 'green')
        : s.status === 'cancelled' ? badge('cancelled', 'gray')
        : badge(isToday ? 'today' : 'upcoming', 'blue');
      return `<details class="lesson class-date">
        <summary>
          <span class="cd-date">${esc(fmtDate(s.scheduledDate, { relative: false }))}</span>
          <span class="cd-topic">${esc(lesson?.topic || 'Session')}</span>
          ${statusBadge}
        </summary>
        <div class="lesson-body" data-session-body="${esc(s.id)}" data-lesson="${esc(s.lessonId || '')}" data-course="${esc(course.id)}">
          <p class="small muted">Loading…</p>
        </div>
      </details>`;
    }).join('') : empty('No sessions scheduled for this class yet.', '🗓️');

    return `<div class="tab-panel ${i === 0 ? 'active' : ''}" data-tab-panel="${esc(course.id)}">
      <div class="stack">${rows}</div>
    </div>`;
  }).join('');

  return section('📚 My Classes', `<div class="tabs">${tabs}</div><div class="tab-panels">${panels}</div>`, {
    sub: 'a tab per class — open any date to revisit it',
    id: 'sec-classes',
  });
}

/** Filled in lazily the first time a date is expanded — see wire(). */
function classDateDetailHtml(session, { course, lesson, materials, report }) {
  const gaps = Array.isArray(report?.identifiedGaps) ? report.identifiedGaps : [];
  return `
    <p class="hero-meta">${lesson ? `Week ${esc(lesson.weekNumber)}, session ${esc(lesson.sessionNumber)} · ` : ''}${esc(fmtTime(session.scheduledTime))}</p>
    ${lesson?.objective ? `<p class="hero-body"><strong>Objective:</strong> ${esc(lesson.objective)}</p>` : ''}
    ${lesson?.homework ? `<p class="hero-body"><strong>Homework:</strong> ${esc(lesson.homework)}</p>` : ''}
    ${materials.length ? `<p class="hero-label" style="margin:14px 0 8px">Materials</p>
      <div class="stack">${materials.map((m) => materialLink(m, course.id, lesson?.id)).join('')}</div>` : ''}
    ${session.teacherNotes ? `<p class="small" style="margin-top:12px"><strong>Teacher notes:</strong> ${esc(session.teacherNotes)}</p>` : ''}
    ${report ? `
      <div class="small strong" style="margin-top:14px">Gap report</div>
      <p class="small muted" style="margin:4px 0">application:
        ${badge(humanize(report.applicationResult || 'n/a'), kindFor(report.applicationResult))}
        · warm-up ${esc(pct(warmupScore(report)))}</p>
      ${gaps.length ? `<div class="row" style="margin-top:6px">
          ${gaps.map((g) => badge(`${humanize(g.severity)}: ${g.description}`, kindFor(g.severity))).join('')}
        </div>` : '<p class="small muted">No gaps identified.</p>'}
      ${report.remediationPlan ? `<p class="small" style="margin-top:8px"><strong>Plan:</strong> ${esc(report.remediationPlan)}</p>` : ''}
    ` : (session.status === 'completed' ? '<p class="small muted" style="margin-top:12px">No gap report filed for this session yet.</p>' : '')}`;
}

function homeworkRow(h, { courseById }, { done }) {
  const course = courseById.get(h.courseId);
  return `<div class="row">
    <span>${HOMEWORK_TYPE_ICON[h.type] || '📌'}</span>
    <span class="small" style="flex:1;min-width:160px">
      <span class="strong">${esc(h.title)}</span>
      <span class="tiny muted"> · ${esc(course?.title || 'Course')}</span>
      ${h.details ? `<br><span class="muted">${esc(h.details)}</span>` : ''}
    </span>
    ${h.url ? `<a class="btn btn-sm" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ''}
    <button class="btn btn-sm ${done ? '' : 'btn-primary'}" data-hw-toggle="${esc(h.id)}" data-hw-done="${done ? '0' : '1'}">
      ${done ? '↺ Mark not done' : '✓ Mark done'}
    </button>
  </div>`;
}

/** Reading chapters, lectures/videos to watch, or skill practice (guitar,
    singing, …) — anything a teacher assigns outside of class time. */
/** Live chat with a teacher agent, over the OpenClaw Gateway (see
    openclaw-config.js). The thread is not persisted — it clears when
    this page next re-renders — this is a live conversation, not a
    record; gap reports and homework are still where the durable
    teaching record lives. */
function renderChat(teachers) {
  if (!teachers.length) {
    return section('💬 Chat', card(empty('No teacher assigned yet — a chat opens up once you have a course.', '💬')), { id: 'sec-chat' });
  }
  if (!isOpenClawConfigured()) {
    return section('💬 Chat', card(`
      <p class="small muted">Live chat needs the OpenClaw Gateway connection set up first —
        fill in <code>gatewayBaseUrl</code> and <code>sessionKey</code> in
        <code>js/openclaw-config.js</code>, then reload this page.</p>`), { id: 'sec-chat' });
  }

  const options = teachers.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  return section('💬 Chat', card(`
    ${teachers.length > 1 ? `<div class="field" style="margin-bottom:12px">
      <label for="chat-teacher">Talk to</label>
      <select id="chat-teacher">${options}</select>
    </div>` : `<input type="hidden" id="chat-teacher" value="${esc(teachers[0].id)}">`}
    <div id="chat-thread" class="chat-thread"></div>
    <form id="chat-form" class="chat-form">
      <textarea id="chat-input" rows="2" required placeholder="Ask a question…"></textarea>
      <button class="btn btn-primary" type="submit">Send</button>
    </form>
    <p class="tiny muted" style="margin-top:8px">This conversation isn't saved — it clears when you leave this tab.</p>
  `, { title: `Talk to ${esc(teachers.length > 1 ? 'your teacher' : teachers[0].name)}`, sub: 'Live, streamed replies' }), { id: 'sec-chat' });
}

function renderHomework(homework, { courseById }) {
  if (!homework.length) {
    return section('📓 Homework', card(empty('No homework assigned yet — it will show up here as soon as a teacher assigns some.', '📓')), { id: 'sec-homework' });
  }

  const pending = homework.filter((h) => h.status !== 'done');
  const done = homework.filter((h) => h.status === 'done');

  const pendingBody = pending.length
    ? `<div class="stack divide">${pending.map((h) => homeworkRow(h, { courseById }, { done: false })).join('')}</div>`
    : empty('Nothing pending — nice work.', '✅');

  const doneBody = done.length ? `<details class="lesson" style="margin-top:14px">
      <summary>Completed (${done.length})</summary>
      <div class="lesson-body stack divide">${done.map((h) => homeworkRow(h, { courseById }, { done: true })).join('')}</div>
    </details>` : '';

  return section('📓 Homework', card(`${pendingBody}${doneBody}`, {
    title: 'Reading, videos & practice',
    sub: `${pending.length} pending`,
  }), { id: 'sec-homework' });
}

function renderStats({ completed, allSessions, reports, today }) {
  const weekStart = addDaysYMD(today, -new Date(`${today}T00:00:00`).getDay());
  const weekEnd = addDaysYMD(weekStart, 6);
  const thisWeek = allSessions.filter((s) => s.scheduledDate >= weekStart && s.scheduledDate <= weekEnd);
  const weekDone = thisWeek.filter((s) => s.status === 'completed').length;
  const streak = currentStreak(allSessions);
  const avg = averageWarmup(reports);

  const tiles = [
    { label: 'Sessions completed', value: completed.length, note: 'all time' },
    { label: 'This week', value: `${weekDone}/${thisWeek.length}`, note: 'completed / scheduled' },
    { label: 'Current streak', value: `${streak} 🔥`, note: streak ? 'class days all-completed' : 'complete a class to start' },
    { label: 'Avg warm-up', value: pct(avg), note: `${reports.length} gap ${reports.length === 1 ? 'report' : 'reports'}` },
  ];

  return section('⚡ Quick Stats', `<div class="stats">${tiles.map((t) => `
    <div class="stat">
      <div class="stat-label">${esc(t.label)}</div>
      <div class="stat-value">${esc(t.value)}</div>
      <div class="stat-note">${esc(t.note)}</div>
    </div>`).join('')}</div>`, { id: 'sec-stats' });
}

function renderUpcoming(sessions, { courseById, lessonIndex }) {
  const body = sessions.length
    ? `<div class="timeline">${sessions.map((s, i) => {
        const course = courseById.get(s.courseId);
        const lesson = lessonIndex.get(s.lessonId);
        return `<div class="tl-item ${i > 2 ? 'dim' : ''}">
          <div class="tl-date">${esc(fmtDate(s.scheduledDate))} · ${esc(fmtTime(s.scheduledTime))}</div>
          <div class="tl-title">${esc(lesson?.topic || 'Session')}</div>
          <div class="small muted">${esc(course?.title || 'Course')} · ${esc(course?.teacherName || '')}
            ${lesson ? ` · Week ${esc(lesson.weekNumber)}` : ''}</div>
        </div>`;
      }).join('')}</div>`
    : empty('Nothing on the calendar yet — your teachers will schedule the next sessions soon.', '🗓️');

  return section('🗓️ Upcoming', card(body), {
    sub: sessions.length ? `next ${sessions.length} across all courses` : '',
    id: 'sec-upcoming',
  });
}

function renderProgress(perCourse, { reports, sessionById }) {
  if (!perCourse.length) {
    return section('📈 Progress Overview', card(empty('No courses yet. An admin can add one from the Admin dashboard.', '📚')), { id: 'sec-progress' });
  }

  const cards = perCourse.map(({ course, milestones }) => {
    const courseReports = reports.filter((r) => sessionById.get(r.sessionId)?.courseId === course.id);
    const progress = milestoneProgress(milestones);
    const health = courseHealth({ milestones, reports: courseReports });
    const latest = courseReports[0];
    const latestGaps = Array.isArray(latest?.identifiedGaps) ? latest.identifiedGaps : [];

    return card(`
      <div class="card-title-row">
        <span>${healthDot(health)}</span>
        <h3 style="flex:1">${esc(course.title)}</h3>
        ${badge(HEALTH_LABEL[health], kindFor(health === 'green' ? 'completed' : health === 'yellow' ? 'major' : 'critical'))}
      </div>
      <p class="small muted" style="margin:2px 0 12px">
        Slot ${esc(course.slot)} · ${esc(course.dayType || '')} · ${esc(course.teacherName || '')}
        ${course.goal ? `<br>🎯 ${esc(course.goal)}` : ''}
      </p>

      <div class="small strong" style="margin-bottom:5px">Milestones — ${progress.achieved}/${progress.total} achieved</div>
      ${bar(progress.pct, health === 'red' ? 'red' : health === 'yellow' ? 'yellow' : 'green')}

      <div class="small strong" style="margin:14px 0 5px">Latest gap report</div>
      ${latest ? `
        <p class="small muted">${esc(fmtAgo(latest.filedAt))} · application:
          ${badge(humanize(latest.applicationResult || 'n/a'), kindFor(latest.applicationResult))}
          · warm-up ${esc(pct(warmupScore(latest)))}</p>
        ${latestGaps.length ? `<div class="row" style="margin-top:8px">
            ${latestGaps.map((g) => badge(`${humanize(g.severity)}: ${g.description}`, kindFor(g.severity))).join('')}
          </div>` : '<p class="small muted" style="margin-top:6px">No gaps identified — nice.</p>'}
        ${latest.remediationPlan ? `<p class="small" style="margin-top:8px"><strong>Plan:</strong> ${esc(latest.remediationPlan)}</p>` : ''}
      ` : '<p class="small muted">No gap reports filed yet.</p>'}

      <details class="lesson" style="margin-top:14px">
        <summary>All milestones (${progress.total})</summary>
        <div class="lesson-body stack">
          ${milestones.length ? milestones.map((m) => `<div class="row">
              ${badge(humanize(m.status), kindFor(m.status))}
              <span class="small" style="flex:1">${esc(m.description)}</span>
              <span class="tiny muted nowrap">week ${esc(m.targetWeek)}</span>
            </div>`).join('') : '<p class="small muted">None defined.</p>'}
        </div>
      </details>`);
  }).join('');

  return section('📈 Progress Overview', `<div class="grid">${cards}</div>`, { id: 'sec-progress' });
}

function renderQuizzes(quizzes, attempts, { courseById }) {
  const attemptedIds = new Set(attempts.map((a) => a.quizId));
  const pending = quizzes.filter((q) => !attemptedIds.has(q.id));
  const doneRows = attempts.slice(0, 5);

  const pendingBody = pending.length
    ? `<div class="stack">${pending.map((q) => `
        <div class="row" style="border:1px solid var(--line);border-radius:9px;padding:11px 13px">
          <span style="flex:1;min-width:180px">
            <span class="strong">${esc(q.title)}</span><br>
            <span class="tiny muted">${esc(courseById.get(q.courseId)?.title || 'Course')} ·
              ${Array.isArray(q.questions) ? q.questions.length : 0} questions ·
              ${q.timeLimitMinutes ? `⏱ ${esc(q.timeLimitMinutes)} min` : 'no time limit'}</span>
          </span>
          <a class="btn btn-primary btn-sm" href="#/quiz/${encodeURIComponent(q.id)}">Start quiz →</a>
        </div>`).join('')}</div>`
    : empty('All caught up — no quizzes waiting for you! 🎉', '✅');

  const doneBody = doneRows.length
    ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Quiz</th><th>Score</th><th>Time</th><th>Taken</th></tr></thead>
        <tbody>${doneRows.map((a) => {
          const quiz = quizzes.find((q) => q.id === a.quizId);
          return `<tr>
            <td>${esc(quiz?.title || a.quizId)}</td>
            <td>${badge(`${Math.round(a.score || 0)}%`, (a.score || 0) >= 80 ? 'green' : (a.score || 0) >= 60 ? 'yellow' : 'red')}</td>
            <td class="muted">${Number.isFinite(a.timeSpentSeconds) ? `${Math.round(a.timeSpentSeconds / 60)} min` : '—'}</td>
            <td class="muted">${esc(fmtAgo(a.completedAt))}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`
    : '<p class="small muted">No attempts yet.</p>';

  return section('📝 Quizzes', `<div class="grid-2">
      ${card(pendingBody, { title: `Pending (${pending.length})` })}
      ${card(doneBody, { title: 'Your recent results' })}
    </div>`, { id: 'sec-quizzes' });
}

function renderActivity(reports, { sessionById, courseById, lessonIndex }) {
  const rows = reports.slice(0, 10);
  const body = rows.length
    ? `<div class="stack divide">${rows.map((r) => {
        const session = sessionById.get(r.sessionId);
        const course = courseById.get(session?.courseId);
        const lesson = lessonIndex.get(session?.lessonId);
        const gaps = Array.isArray(r.identifiedGaps) ? r.identifiedGaps : [];
        return `<div>
          <div class="row">
            <span class="strong" style="flex:1;min-width:160px">${esc(course?.title || 'Course')}
              <span class="muted">— ${esc(lesson?.topic || 'session')}</span></span>
            ${badge(humanize(r.applicationResult || 'n/a'), kindFor(r.applicationResult))}
            <span class="tiny muted nowrap">${esc(fmtAgo(r.filedAt))}</span>
          </div>
          <div class="row" style="margin-top:6px">
            <span class="pill">warm-up ${esc(pct(warmupScore(r)))}</span>
            ${gaps.length
              ? gaps.map((g) => badge(`${humanize(g.severity)}: ${g.description}`, kindFor(g.severity))).join('')
              : badge('no gaps', 'green')}
          </div>
          ${r.applicationNotes ? `<p class="small muted" style="margin-top:6px">${esc(r.applicationNotes)}</p>` : ''}
        </div>`;
      }).join('')}</div>`
    : empty('No gap reports yet — they appear here after each class.', '🔔');

  return section('🔔 Recent Activity', card(body), {
    sub: rows.length ? `last ${rows.length} gap ${rows.length === 1 ? 'report' : 'reports'}` : '',
    id: 'sec-activity',
  });
}

function renderReflection(completed, { courseById, lessonIndex }) {
  const recent = completed.slice(-6).reverse();
  if (!recent.length) return '';
  const options = recent.map((s) => {
    const course = courseById.get(s.courseId);
    const lesson = lessonIndex.get(s.lessonId);
    return `<option value="${esc(s.id)}">${esc(fmtDate(s.scheduledDate, { relative: false }))} — ${esc(course?.title || 'Course')}: ${esc(lesson?.topic || 'session')}</option>`;
  }).join('');
  const scale = (name, label) => `<div class="field">
      <label for="${name}">${label}</label>
      <select id="${name}" name="${name}" required>
        <option value="5">5 — completely</option><option value="4">4 — mostly</option>
        <option value="3" selected>3 — somewhat</option><option value="2">2 — a little</option>
        <option value="1">1 — not at all</option>
      </select>
    </div>`;

  return section('💭 Reflect on a Class', card(`
    <form id="reflect-form">
      <div data-error></div>
      <div class="field">
        <label for="sessionId">Session</label>
        <select id="sessionId" name="sessionId" required>${options}</select>
      </div>
      <div class="field-row">
        ${scale('understandingRating', 'How well did you understand it?')}
        ${scale('confidenceRating', 'How confident do you feel now?')}
      </div>
      <div class="field">
        <label for="notes">Anything you want your teacher to know?</label>
        <textarea id="notes" name="notes" placeholder="The second example clicked once we drew it out…"></textarea>
      </div>
      <button class="btn btn-primary" type="submit">Send reflection</button>
    </form>`, { title: 'Self-assessment', sub: 'Your teacher sees these alongside their gap reports.' }),
  { id: 'sec-reflect' });
}

/* --------------------------------------------------------------- wiring */

function wire(mount, ctx, { courseById, allSessions, lessonIndex, reports, teachers }) {
  const form = mount.querySelector('#reflect-form');
  if (form) {
    bindForm(form, async (data) => {
      await createStudentAssessment({
        sessionId: String(data.get('sessionId')),
        userId: ctx.user.uid,
        understandingRating: Number(data.get('understandingRating')),
        confidenceRating: Number(data.get('confidenceRating')),
        notes: String(data.get('notes') || '').trim(),
      });
      form.reset();
      toast('Reflection saved — thanks!', 'ok');
    });
  }

  const homeworkSection = mount.querySelector('#sec-homework');
  homeworkSection?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-hw-toggle]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await setHomeworkStatus(btn.dataset.hwToggle, btn.dataset.hwDone === '1');
      render(mount, ctx);
    } catch (err) {
      console.error(err);
      toast(`Could not update homework: ${err.message}`, 'err');
      btn.disabled = false;
    }
  });

  let activeStream = null;
  const cleanup = () => { if (activeStream) activeStream.abort(); };

  const chatForm = mount.querySelector('#chat-form');
  if (chatForm) {
    const thread = mount.querySelector('#chat-thread');
    const teacherSelect = mount.querySelector('#chat-teacher');
    const history = [];   // {role, content}[] — this tab's live thread only, not persisted

    const addBubble = (cls, text) => {
      const el = document.createElement('div');
      el.className = `chat-msg ${cls}`;
      el.textContent = text;
      thread.appendChild(el);
      thread.scrollTop = thread.scrollHeight;
      return el;
    };

    chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = mount.querySelector('#chat-input');
      const text = input.value.trim();
      if (!text || activeStream) return;
      const teacher = teachers.find((t) => t.id === teacherSelect.value) || teachers[0];

      addBubble('user', text);
      history.push({ role: 'user', content: text });
      input.value = '';

      const submitBtn = chatForm.querySelector('[type=submit]');
      submitBtn.disabled = true;
      const replyEl = addBubble('assistant pending', '…');
      let replyText = '';

      activeStream = streamChat({
        sessionKey: `${ctx.user.uid}:${teacher.id}`,
        messages: history,
        onToken: (chunk) => {
          replyText += chunk;
          replyEl.textContent = replyText;
          thread.scrollTop = thread.scrollHeight;
        },
        onDone: () => {
          replyEl.classList.remove('pending');
          history.push({ role: 'assistant', content: replyText });
          activeStream = null;
          submitBtn.disabled = false;
        },
        onError: (err) => {
          console.error(err);
          replyEl.classList.remove('pending');
          replyEl.classList.add('error');
          replyEl.textContent = `Could not reach the teacher: ${err.message}`;
          activeStream = null;
          submitBtn.disabled = false;
        },
      });
    });
  }

  const classesSection = mount.querySelector('#sec-classes');
  if (!classesSection) return cleanup;

  classesSection.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tabBtn;
      classesSection.querySelectorAll('[data-tab-btn]').forEach((b) => b.classList.toggle('active', b === btn));
      classesSection.querySelectorAll('[data-tab-panel]').forEach((p) => p.classList.toggle('active', p.dataset.tabPanel === id));
    });
  });

  const materialsCache = new Map();   // lessonId -> materials[], shared across every date opened
  classesSection.querySelectorAll('[data-session-body]').forEach((body) => {
    const details = body.closest('details');
    details.addEventListener('toggle', async () => {
      if (!details.open || body.dataset.loaded) return;
      body.dataset.loaded = '1';
      const session = allSessions.find((s) => s.id === body.dataset.sessionBody);
      const course = courseById.get(body.dataset.course);
      const lessonId = body.dataset.lesson;
      const lesson = lessonIndex.get(lessonId);
      let materials = [];
      if (lessonId) {
        if (!materialsCache.has(lessonId)) {
          const map = await listMaterialsForLessons([{ courseId: body.dataset.course, lessonId }]);
          materialsCache.set(lessonId, map[lessonId] || []);
        }
        materials = materialsCache.get(lessonId);
      }
      const report = reports.find((r) => r.sessionId === body.dataset.sessionBody);
      body.innerHTML = classDateDetailHtml(session, { course, lesson, materials, report });
    });
  });

  return cleanup;
}
