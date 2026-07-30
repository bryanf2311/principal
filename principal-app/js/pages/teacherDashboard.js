/* ============================================================
   #/teacher — everything one teacher needs for their slot.
   Today's class · lesson plan · student progress · gap report
   filing · quiz authoring & results · session history · agents
   ============================================================ */

import {
  listCourses, listLessons, listMaterials, listMilestones, updateMilestone,
  listSessions, updateSession, listGapReports, createGapReport,
  listQuizzes, createQuiz, listQuizAttempts, listStudentAssessments,
  milestoneProgress, courseHealth, warmupScore, averageWarmup, trendOf, quizAverage,
  HEALTH_LABEL,
} from '../api.js';

import {
  esc, section, card, badge, bar, empty, healthDot, materialLink, sparkline, sheet,
  skeletonPage, fmtDate, fmtTime, fmtAgo, fmtDateTime, todayYMD, kindFor, humanize,
  pct, toast, bindForm,
} from '../ui.js';

let selectedCourseId = null;   // survives re-renders within a session

export async function render(mount, ctx) {
  mount.innerHTML = skeletonPage();
  const isOwner = ctx.profile.role === 'teacher';

  const courses = isOwner ? await listCourses({ teacherId: ctx.user.uid }) : await listCourses();
  if (!courses.length) {
    mount.innerHTML = card(empty(
      isOwner
        ? 'No course is assigned to you yet. Ask your admin to create one for your slot.'
        : 'No courses exist yet — create one from the Admin dashboard.',
      '📚',
    ));
    return null;
  }

  const course = courses.find((c) => c.id === selectedCourseId) || courses[0];
  selectedCourseId = course.id;

  const [lessons, milestones, sessions, quizzes, allReports] = await Promise.all([
    listLessons(course.id),
    listMilestones(course.id),
    listSessions({ courseId: course.id }),
    listQuizzes({ courseId: course.id }),
    isOwner ? listGapReports({ teacherId: ctx.user.uid }) : listGapReports(),
  ]);

  const sessionIds = new Set(sessions.map((s) => s.id));
  const reports = allReports.filter((r) => sessionIds.has(r.sessionId));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const today = todayYMD();

  const [attemptsByQuiz, assessments, materialsByLesson] = await Promise.all([
    (async () => {
      const entries = await Promise.all(quizzes.map(async (q) => [q.id, await listQuizAttempts({ quizId: q.id })]));
      return Object.fromEntries(entries);
    })(),
    (async () => (await listStudentAssessments()).filter((a) => sessionIds.has(a.sessionId)))().catch(() => []),
    (async () => {
      const entries = await Promise.all(lessons.map(async (l) => [l.id, await listMaterials(course.id, l.id)]));
      return Object.fromEntries(entries);
    })(),
  ]);

  const todaySessions = sessions.filter((s) => s.scheduledDate === today && s.status !== 'cancelled');
  const past = sessions.filter((s) => s.scheduledDate <= today).slice().reverse();
  const completedNoReport = sessions
    .filter((s) => s.status === 'completed' && !reports.some((r) => r.sessionId === s.id))
    .reverse();
  const filedFor = new Map(reports.map((r) => [r.sessionId, r]));

  const ctxData = { course, courses, lessons, lessonById, milestones, sessions, reports, quizzes,
    attemptsByQuiz, assessments, materialsByLesson, todaySessions, past, completedNoReport, filedFor, isOwner };

  ctx.setHeader(course.title || 'Teacher Dashboard',
    `Slot ${course.slot ?? '—'} · ${course.dayType || ''} · student ${course.studentName || '—'}`);

  /* Everything lives inside a fresh root element: re-rendering replaces the
     node, so the delegated listeners attached below go away with it. */
  mount.innerHTML = `<div id="teacher-root">${[
    courses.length > 1 ? courseSwitcher(courses, course) : '',
    renderToday(ctxData),
    renderCourse(ctxData),
    renderProgress(ctxData),
    renderGapForm(ctxData),
    renderQuizPanels(ctxData),
    renderHistory(ctxData),
    renderAgentPanel(ctx, isOwner),
  ].join('')}</div>`;

  wire(mount.querySelector('#teacher-root'), mount, ctx, ctxData);
  return null;
}

/* ------------------------------------------------------------ sections */

function courseSwitcher(courses, current) {
  return `<div class="section"><div class="card row">
    <label class="strong small" for="course-switch">Course</label>
    <select id="course-switch" style="max-width:340px">
      ${courses.map((c) => `<option value="${esc(c.id)}" ${c.id === current.id ? 'selected' : ''}>
        Slot ${esc(c.slot)} — ${esc(c.title)}</option>`).join('')}
    </select>
  </div></div>`;
}

function renderToday({ todaySessions, lessonById, course, materialsByLesson }) {
  if (!todaySessions.length) {
    return section('📅 Today’s Class', card(empty('No class today for this course. Next scheduled session appears under Session History.', '☕')), { id: 'sec-today' });
  }
  const cards = todaySessions.map((s) => {
    const lesson = lessonById.get(s.lessonId);
    const materials = materialsByLesson[s.lessonId] || [];
    return card(`
      <div class="row">
        <span class="hero-time">🕐 ${esc(fmtTime(s.scheduledTime))}</span>
        <span class="hero-label">${esc(course.sessionLengthMin || 0)} min · ${esc(course.studentName || 'student')}</span>
        ${s.status === 'completed' ? badge('completed', 'green') : ''}
      </div>
      <h4>${esc(lesson?.topic || 'Session')}</h4>
      <p class="hero-meta">Week ${esc(lesson?.weekNumber ?? '—')}, session ${esc(lesson?.sessionNumber ?? '—')} · ${esc(lesson?.dayOfWeek || '')}</p>
      ${lesson?.objective ? `<p class="hero-body"><strong>Objective:</strong> ${esc(lesson.objective)}</p>` : ''}
      ${lesson?.activities ? `<p class="hero-body"><strong>Activities:</strong> ${esc(lesson.activities)}</p>` : ''}
      ${materials.length ? `<p class="hero-label" style="margin:14px 0 8px">Materials</p>
        <div class="stack">${materials.map(materialLink).join('')}</div>` : ''}
      ${s.status !== 'completed'
        ? `<div class="row" style="margin-top:16px">
             <button class="btn btn-sm" data-complete="${esc(s.id)}">✓ Mark completed</button>
             <button class="btn btn-sm btn-danger" data-cancel="${esc(s.id)}">Cancel session</button>
           </div>`
        : ''}
    `, { cls: 'hero' });
  }).join('');
  return section('📅 Today’s Class', `<div class="grid">${cards}</div>`, { id: 'sec-today' });
}

function renderCourse({ course, lessons, materialsByLesson, milestones }) {
  const progress = milestoneProgress(milestones);
  const byWeek = new Map();
  lessons.forEach((l) => {
    const list = byWeek.get(l.weekNumber) || [];
    list.push(l);
    byWeek.set(l.weekNumber, list);
  });

  const plan = [...byWeek.keys()].sort((a, b) => a - b).map((week) => `
    <h4 class="small muted" style="margin:16px 0 8px;text-transform:uppercase;letter-spacing:.06em">Week ${esc(week)}</h4>
    ${byWeek.get(week).map((l) => {
      const materials = materialsByLesson[l.id] || [];
      return `<details class="lesson">
        <summary><span class="pill">S${esc(l.sessionNumber)}</span> ${esc(l.topic || 'Lesson')}
          <span class="tiny muted">${esc(l.dayOfWeek || '')}</span></summary>
        <div class="lesson-body">
          <dl>
            <dt>Objective</dt><dd>${esc(l.objective || '—')}</dd>
            <dt>Activities</dt><dd>${esc(l.activities || '—')}</dd>
            <dt>Homework</dt><dd>${esc(l.homework || '—')}</dd>
          </dl>
          ${materials.length ? `<div class="stack" style="margin-top:12px">${materials.map(materialLink).join('')}</div>`
            : '<p class="tiny muted" style="margin-top:10px">No materials attached.</p>'}
        </div>
      </details>`;
    }).join('')}`).join('');

  return section('📚 My Course', card(`
    <div class="field-row" style="margin-bottom:6px">
      <div><div class="stat-label">Student</div><div class="strong">${esc(course.studentName || '—')}</div></div>
      <div><div class="stat-label">Skill level</div><div class="strong">${esc(course.skillLevel || '—')}</div></div>
      <div><div class="stat-label">Session length</div><div class="strong">${esc(course.sessionLengthMin || '—')} min</div></div>
      <div><div class="stat-label">Schedule</div><div class="strong">${esc(course.dayType || '—')}</div></div>
    </div>
    ${course.goal ? `<p class="small" style="margin-top:10px">🎯 <strong>Goal:</strong> ${esc(course.goal)}</p>` : ''}
    <div style="margin-top:14px"><div class="small strong" style="margin-bottom:5px">Milestone progress — ${progress.achieved}/${progress.total}</div>
      ${bar(progress.pct, 'green')}</div>
    <div style="margin-top:8px">${plan || empty('No lessons in this course yet.', '📝')}</div>
  `, { title: esc(course.title || 'Course'), sub: `${lessons.length} lessons` }), { id: 'sec-course' });
}

function renderProgress({ milestones, reports, sessions, course, lessonById, assessments, isOwner }) {
  const progress = milestoneProgress(milestones);
  const health = courseHealth({ milestones, reports });
  const trend = trendOf(reports);
  const avg = averageWarmup(reports);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  const milestoneRows = milestones.length ? milestones.map((m) => `
    <div class="row" style="gap:8px">
      <span class="small" style="flex:1;min-width:150px">${esc(m.description)}
        <span class="tiny muted">· target week ${esc(m.targetWeek)}</span>
        ${m.notes ? `<br><span class="tiny muted">${esc(m.notes)}</span>` : ''}</span>
      ${isOwner
        ? `<select class="ms-status" data-id="${esc(m.id)}" style="max-width:160px">
            ${['not_started', 'in_progress', 'achieved', 'behind'].map((s) => `
              <option value="${s}" ${m.status === s ? 'selected' : ''}>${humanize(s)}</option>`).join('')}
          </select>`
        : badge(humanize(m.status), kindFor(m.status))}
    </div>`).join('') : '<p class="small muted">No milestones defined for this course.</p>';

  const reportRows = reports.slice(0, 6).map((r) => {
    const s = sessionById.get(r.sessionId);
    const lesson = lessonById.get(s?.lessonId);
    const gaps = Array.isArray(r.identifiedGaps) ? r.identifiedGaps : [];
    return `<div>
      <div class="row">
        <span class="small strong" style="flex:1;min-width:140px">${esc(lesson?.topic || 'Session')}
          <span class="muted">· ${esc(fmtDate(s?.scheduledDate, { relative: false }))}</span></span>
        <span class="pill">warm-up ${esc(pct(warmupScore(r)))}</span>
        ${badge(humanize(r.applicationResult || 'n/a'), kindFor(r.applicationResult))}
      </div>
      ${gaps.length ? `<div class="row" style="margin-top:6px">${gaps
        .map((g) => badge(`${humanize(g.severity)}: ${g.description}`, kindFor(g.severity))).join('')}</div>` : ''}
      <div class="right"><button class="btn-link tiny" data-report="${esc(r.id)}">View full report</button></div>
    </div>`;
  }).join('');

  const reflectionRows = assessments.slice(0, 5).map((a) => {
    const s = sessionById.get(a.sessionId);
    const lesson = lessonById.get(s?.lessonId);
    return `<div>
      <div class="row">
        <span class="small strong" style="flex:1">${esc(lesson?.topic || 'Session')}</span>
        <span class="pill">understood ${esc(a.understandingRating)}/5</span>
        <span class="pill">confident ${esc(a.confidenceRating)}/5</span>
      </div>
      ${a.notes ? `<p class="small muted" style="margin-top:4px">“${esc(a.notes)}”</p>` : ''}
      <p class="tiny muted">${esc(fmtAgo(a.createdAt))}</p>
    </div>`;
  }).join('');

  return section('📈 Student Progress', `<div class="grid-2">
      ${card(`
        <div class="row" style="margin-bottom:10px">
          ${healthDot(health)} <span class="strong">${esc(HEALTH_LABEL[health])}</span>
          <span class="spacer" style="flex:1"></span>
          ${badge(`trend: ${trend.label}`, trend.kind === 'gray' ? 'gray' : trend.kind === 'green' ? 'green' : 'red')}
        </div>
        <div class="small strong" style="margin-bottom:5px">Milestones — ${Math.round(progress.pct)}%</div>
        ${bar(progress.pct, health === 'red' ? 'red' : health === 'yellow' ? 'yellow' : 'green')}
        <div class="small strong" style="margin:14px 0 5px">Average warm-up score — ${esc(pct(avg))}</div>
        ${sparkline(trend.series, { kind: trend.kind === 'gray' ? 'accent' : trend.kind })}
        <p class="tiny muted">Warm-up accuracy per gap report, oldest → newest.</p>
        <div class="stack divide" style="margin-top:14px">${milestoneRows}</div>
      `, { title: `${esc(course.studentName || 'Student')} · health` })}

      ${card(reports.length
        ? `<div class="stack divide">${reportRows}</div>`
        : empty('No gap reports filed for this course yet.', '🩺'), { title: 'Recent gap reports' })
      }
    </div>
    ${assessments.length ? section('', card(`<div class="stack divide">${reflectionRows}</div>`,
      { title: '💭 Student reflections', sub: 'Self-assessments submitted after class' })) : ''}`,
  { id: 'sec-progress' });
}

function renderGapForm({ completedNoReport, sessions, lessonById, filedFor }) {
  const options = (completedNoReport.length ? completedNoReport : sessions.filter((s) => s.status === 'completed'))
    .map((s) => {
      const lesson = lessonById.get(s.lessonId);
      const already = filedFor.has(s.id) ? ' (report already filed)' : '';
      return `<option value="${esc(s.id)}">${esc(fmtDate(s.scheduledDate, { relative: false }))} — ${esc(lesson?.topic || 'session')}${already}</option>`;
    }).join('');

  if (!options) {
    return section('🩺 File Gap Report', card(empty(
      'Mark a session completed first — gap reports attach to completed sessions.', '🩺',
    )), { id: 'sec-gap' });
  }

  return section('🩺 File Gap Report', card(`
    <form id="gap-form">
      <div data-error></div>

      <div class="field">
        <label for="gap-session">Session</label>
        <select id="gap-session" name="sessionId" required>${options}</select>
        <p class="hint">Only completed sessions appear here. Filing again on the same session adds a second report.</p>
      </div>

      <fieldset class="sub">
        <legend>Warm-up results</legend>
        <div id="warmup-rows"></div>
        <button class="btn btn-sm" type="button" id="add-warmup">＋ Add warm-up question</button>
      </fieldset>

      <fieldset class="sub">
        <legend>Application task</legend>
        <div class="field">
          <label for="applicationTask">What did you ask them to do?</label>
          <textarea id="applicationTask" name="applicationTask" required
            placeholder="Solve 3x + 7 = 22 and explain each step aloud"></textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="applicationResult">Result</label>
            <select id="applicationResult" name="applicationResult" required>
              <option value="correct">Correct</option>
              <option value="partially_correct" selected>Partially correct</option>
              <option value="needs_work">Needs work</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="applicationNotes">Notes on how it went</label>
          <textarea id="applicationNotes" name="applicationNotes"
            placeholder="Set up the equation confidently, slipped on the sign when moving the 7."></textarea>
        </div>
      </fieldset>

      <fieldset class="sub">
        <legend>Identified gaps</legend>
        <div id="gap-rows"></div>
        <button class="btn btn-sm" type="button" id="add-gap">＋ Add gap</button>
      </fieldset>

      <div class="field">
        <label for="remediationPlan">Remediation plan</label>
        <textarea id="remediationPlan" name="remediationPlan" required
          placeholder="Five sign-change drills at the start of next session, then re-test the same task."></textarea>
      </div>

      <div class="field">
        <label for="teacherNotes">Session notes (saved on the session)</label>
        <textarea id="teacherNotes" name="teacherNotes" placeholder="Optional — anything else worth recording."></textarea>
      </div>

      <button class="btn btn-primary" type="submit">File gap report</button>
    </form>`, { title: 'New report', sub: 'Warm-up → application → gaps → plan' }), { id: 'sec-gap' });
}

function renderQuizPanels({ quizzes, attemptsByQuiz, lessons }) {
  const resultRows = quizzes.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Quiz</th><th>Questions</th><th>Limit</th><th>Attempts</th><th>Average</th><th></th></tr></thead>
      <tbody>${quizzes.map((q) => {
        const attempts = attemptsByQuiz[q.id] || [];
        const avg = quizAverage(attempts);
        return `<tr>
          <td><span class="strong">${esc(q.title)}</span><br><span class="tiny muted">${esc(fmtAgo(q.createdAt))}</span></td>
          <td>${Array.isArray(q.questions) ? q.questions.length : 0}</td>
          <td>${q.timeLimitMinutes ? `${esc(q.timeLimitMinutes)} min` : '—'}</td>
          <td>${attempts.length}</td>
          <td>${Number.isFinite(avg)
            ? badge(`${Math.round(avg)}%`, avg >= 80 ? 'green' : avg >= 60 ? 'yellow' : 'red')
            : '<span class="muted">—</span>'}</td>
          <td class="nowrap">
            <button class="btn btn-sm" data-attempts="${esc(q.id)}" ${attempts.length ? '' : 'disabled'}>Attempts</button>
            <a class="btn btn-sm" href="#/quiz/${encodeURIComponent(q.id)}">Preview</a>
          </td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : empty('No quizzes yet for this course — create the first one below.', '📝');

  const lessonOptions = ['<option value="">— none (whole course) —</option>']
    .concat(lessons.map((l) => `<option value="${esc(l.id)}">W${esc(l.weekNumber)}S${esc(l.sessionNumber)} — ${esc(l.topic || 'lesson')}</option>`))
    .join('');

  return section('📝 Quizzes', `
    ${card(resultRows, { title: 'Quiz results' })}
    ${card(`
      <form id="quiz-form">
        <div data-error></div>
        <div class="field-row">
          <div class="field">
            <label for="quiz-title">Title</label>
            <input id="quiz-title" name="title" type="text" required placeholder="Week 1 check-in">
          </div>
          <div class="field">
            <label for="quiz-limit">Time limit (minutes, 0 = none)</label>
            <input id="quiz-limit" name="timeLimitMinutes" type="number" min="0" max="240" value="10" required>
          </div>
          <div class="field">
            <label for="quiz-lesson">Attach to lesson</label>
            <select id="quiz-lesson" name="lessonId">${lessonOptions}</select>
          </div>
        </div>
        <div class="field">
          <label for="quiz-desc">Description</label>
          <textarea id="quiz-desc" name="description" placeholder="Five questions on what we covered this week."></textarea>
        </div>
        <div id="question-rows"></div>
        <button class="btn btn-sm" type="button" id="add-question">＋ Add question</button>
        <div style="margin-top:16px"><button class="btn btn-primary" type="submit">Create quiz</button></div>
      </form>`, { title: 'Create a quiz', sub: 'Multiple choice, auto-graded' })}
  `, { id: 'sec-quiz' });
}

function renderHistory({ past, lessonById, filedFor, isOwner }) {
  const body = past.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th><th>Topic</th><th>Status</th><th>Gap report</th><th>Notes</th></tr></thead>
      <tbody>${past.map((s) => {
        const lesson = lessonById.get(s.lessonId);
        const report = filedFor.get(s.id);
        return `<tr>
          <td class="nowrap">${esc(fmtDate(s.scheduledDate, { relative: false }))}<br>
            <span class="tiny muted">${esc(fmtTime(s.scheduledTime))}</span></td>
          <td>${esc(lesson?.topic || '—')}<br><span class="tiny muted">Week ${esc(lesson?.weekNumber ?? '—')}</span></td>
          <td>${badge(humanize(s.status), kindFor(s.status))}
            ${isOwner && s.status === 'upcoming' ? `<br><button class="btn-link tiny" data-complete="${esc(s.id)}">mark completed</button>` : ''}</td>
          <td>${report
            ? `<button class="btn-link" data-report="${esc(report.id)}">View report →</button>`
            : '<span class="tiny muted">not filed</span>'}</td>
          <td class="small muted">${esc(s.teacherNotes || '')}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`
    : empty('No sessions in the past yet.', '🕘');
  return section('🕘 Session History', card(body), { id: 'sec-history' });
}

function renderAgentPanel(ctx, isOwner) {
  return section('🤖 Agent access', card(`
    <p class="small muted">This course can also be taught by an AI agent. An agent signs in with its
      own teacher account and writes here directly — the same lessons, sessions, gap reports,
      milestones and quizzes you see on this page.</p>
    <p class="small muted" style="margin-top:10px">${isOwner
      ? 'Your own account is a teacher account, so an agent configured with your credentials would act as you. Ask your admin for a separate agent account instead.'
      : 'Create one from <a href="#/admin">Admin → Add Teacher → 🤖 AI agent</a>, then hand the agent its four environment variables.'}</p>
    <details class="lesson" style="margin-top:14px">
      <summary>What the agent runs</summary>
      <div class="lesson-body">
        <pre class="mono tiny" style="overflow:auto;margin:0">node principal.mjs today
node principal.mjs gap-report '{"sessionId":"…","applicationTask":"…",
  "applicationResult":"partially_correct","identifiedGaps":[],
  "remediationPlan":"…","markSessionCompleted":true}'</pre>
        <p class="tiny muted" style="margin-top:8px">The tool and its instructions live in
          <code>agent-skill/principal-teacher/</code>. No paid Firebase plan is involved.</p>
      </div>
    </details>`), { id: 'sec-api' });
}

/* --------------------------------------------------------------- wiring */

function warmupRow(i) {
  return `<div class="field-row" data-row style="align-items:end;margin-bottom:10px">
    <div class="field" style="margin:0">
      <label>Question ${i + 1}</label>
      <input type="text" name="warmupQuestion" required placeholder="What is 7 × 8?">
    </div>
    <div class="field" style="margin:0;max-width:170px">
      <label>Result</label>
      <select name="warmupResult" required>
        <option value="correct">Correct</option>
        <option value="hesitant">Hesitant</option>
        <option value="incorrect">Incorrect</option>
      </select>
    </div>
    <div><button class="btn btn-sm btn-danger" type="button" data-remove>✕</button></div>
  </div>`;
}

function gapRow(i) {
  return `<div class="field-row" data-row style="align-items:end;margin-bottom:10px">
    <div class="field" style="margin:0">
      <label>Gap ${i + 1}</label>
      <input type="text" name="gapDescription" required placeholder="Loses the sign when moving terms across =">
    </div>
    <div class="field" style="margin:0;max-width:170px">
      <label>Severity</label>
      <select name="gapSeverity" required>
        <option value="critical">Critical</option>
        <option value="major" selected>Major</option>
        <option value="minor">Minor</option>
      </select>
    </div>
    <div><button class="btn btn-sm btn-danger" type="button" data-remove>✕</button></div>
  </div>`;
}

function questionRow(i) {
  const letters = ['A', 'B', 'C', 'D'];
  return `<fieldset class="sub" data-question>
    <legend>Question <span data-num>${i + 1}</span></legend>
    <div class="field">
      <label>Question text</label>
      <input type="text" name="questionText" required placeholder="Which step isolates x in 3x + 7 = 22?">
    </div>
    ${letters.map((letter) => `
      <div class="field-row" style="align-items:end">
        <div class="field" style="margin:0 0 10px">
          <label>Option ${letter}</label>
          <input type="text" name="option${letter}" ${letter === 'A' || letter === 'B' ? 'required' : ''}
            placeholder="${letter === 'A' ? 'Subtract 7 from both sides' : letter === 'D' ? 'Leave blank to skip' : ''}">
        </div>
      </div>`).join('')}
    <div class="field-row">
      <div class="field" style="margin:0">
        <label>Correct answer</label>
        <select name="correctIndex" required>
          ${letters.map((letter, li) => `<option value="${li}">${letter}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn btn-sm btn-danger" type="button" data-remove-question>✕ Remove question</button>
      </div>
    </div>
  </fieldset>`;
}

function repeater(container, addBtn, factory, { min = 1 } = {}) {
  if (!container || !addBtn) return;
  const renumber = () => {
    [...container.children].forEach((row, i) => {
      const label = row.querySelector('label');
      if (label && /^(Question|Gap) \d+$/.test(label.textContent)) {
        label.textContent = label.textContent.replace(/\d+$/, String(i + 1));
      }
      const num = row.querySelector('[data-num]');
      if (num) num.textContent = String(i + 1);
    });
  };
  const add = () => { container.insertAdjacentHTML('beforeend', factory(container.children.length)); renumber(); };
  for (let i = 0; i < min; i += 1) add();
  addBtn.addEventListener('click', add);
  container.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove], [data-remove-question]');
    if (!btn) return;
    const row = btn.closest('[data-row], [data-question]');
    if (row && container.children.length > 1) { row.remove(); renumber(); }
    else toast('At least one entry is required.');
  });
}

function wire(root, mount, ctx, data) {
  const reload = () => render(mount, ctx);

  /* course switcher */
  root.querySelector('#course-switch')?.addEventListener('change', (event) => {
    selectedCourseId = event.target.value;
    reload();
  });

  /* session status buttons (today card + history table) */
  root.addEventListener('click', async (event) => {
    const complete = event.target.closest('[data-complete]');
    const cancel = event.target.closest('[data-cancel]');
    if (!complete && !cancel) return;
    const id = (complete || cancel).dataset.complete || (complete || cancel).dataset.cancel;
    try {
      await updateSession(id, { status: complete ? 'completed' : 'cancelled' });
      toast(complete ? 'Session marked completed.' : 'Session cancelled.', 'ok');
      reload();
    } catch (err) {
      console.error(err);
      toast(`Could not update session: ${err.message}`, 'err');
    }
  });

  /* milestone status changes */
  root.querySelectorAll('.ms-status').forEach((select) => {
    select.addEventListener('change', async () => {
      const status = select.value;
      try {
        await updateMilestone(data.course.id, select.dataset.id, {
          status,
          achievedDate: status === 'achieved' ? new Date() : null,
        });
        toast('Milestone updated.', 'ok');
      } catch (err) {
        console.error(err);
        toast(`Could not update milestone: ${err.message}`, 'err');
      }
    });
  });

  /* gap report + quiz attempt viewers */
  root.addEventListener('click', (event) => {
    const reportBtn = event.target.closest('[data-report]');
    if (reportBtn) {
      const report = data.reports.find((r) => r.id === reportBtn.dataset.report);
      if (report) showReport(report, data);
      return;
    }
    const attemptsBtn = event.target.closest('[data-attempts]');
    if (attemptsBtn) {
      const quiz = data.quizzes.find((q) => q.id === attemptsBtn.dataset.attempts);
      showAttempts(quiz, data.attemptsByQuiz[attemptsBtn.dataset.attempts] || []);
    }
  });

  /* ---- gap report form ---- */
  const gapForm = root.querySelector('#gap-form');
  if (gapForm) {
    repeater(gapForm.querySelector('#warmup-rows'), gapForm.querySelector('#add-warmup'), warmupRow, { min: 3 });
    repeater(gapForm.querySelector('#gap-rows'), gapForm.querySelector('#add-gap'), gapRow, { min: 1 });

    bindForm(gapForm, async (fd) => {
      const questions = fd.getAll('warmupQuestion').map((q) => String(q).trim());
      const results = fd.getAll('warmupResult');
      const warmupResults = questions
        .map((question, i) => ({ question, result: String(results[i] || 'correct') }))
        .filter((r) => r.question);

      const descriptions = fd.getAll('gapDescription').map((d) => String(d).trim());
      const severities = fd.getAll('gapSeverity');
      const identifiedGaps = descriptions
        .map((description, i) => ({ description, severity: String(severities[i] || 'minor') }))
        .filter((g) => g.description);

      const sessionId = String(fd.get('sessionId'));
      await createGapReport({
        sessionId,
        teacherId: ctx.user.uid,
        courseId: data.course.id,
        warmupResults,
        applicationTask: String(fd.get('applicationTask') || '').trim(),
        applicationResult: String(fd.get('applicationResult')),
        applicationNotes: String(fd.get('applicationNotes') || '').trim(),
        identifiedGaps,
        remediationPlan: String(fd.get('remediationPlan') || '').trim(),
      });

      const notes = String(fd.get('teacherNotes') || '').trim();
      if (notes) await updateSession(sessionId, { teacherNotes: notes });

      toast('Gap report filed.', 'ok');
      reload();
    });
  }

  /* ---- quiz creation form ---- */
  const quizForm = root.querySelector('#quiz-form');
  if (quizForm) {
    repeater(quizForm.querySelector('#question-rows'), quizForm.querySelector('#add-question'), questionRow, { min: 1 });

    bindForm(quizForm, async (fd) => {
      const blocks = [...quizForm.querySelectorAll('[data-question]')];
      const questions = blocks.map((block) => {
        const text = block.querySelector('[name=questionText]').value.trim();
        const options = ['A', 'B', 'C', 'D']
          .map((letter) => ({ label: letter, text: block.querySelector(`[name=option${letter}]`).value.trim() }))
          .filter((opt) => opt.text);
        const correctIndex = Number(block.querySelector('[name=correctIndex]').value);
        return { questionText: text, options, correctIndex };
      }).filter((q) => q.questionText && q.options.length >= 2);

      if (!questions.length) throw new Error('Add at least one question with two or more options.');
      const bad = questions.find((q) => q.correctIndex >= q.options.length);
      if (bad) throw new Error(`“${bad.questionText}” marks an empty option as the correct answer.`);

      await createQuiz({
        courseId: data.course.id,
        lessonId: String(fd.get('lessonId') || '') || null,
        title: String(fd.get('title') || '').trim(),
        description: String(fd.get('description') || '').trim(),
        timeLimitMinutes: Number(fd.get('timeLimitMinutes') || 0),
        questions,
      });
      toast('Quiz created.', 'ok');
      reload();
    });
  }

}

/* ------------------------------------------------------------- viewers */

function showReport(report, { sessions, lessonById }) {
  const session = sessions.find((s) => s.id === report.sessionId);
  const lesson = lessonById.get(session?.lessonId);
  const warmups = Array.isArray(report.warmupResults) ? report.warmupResults : [];
  const gaps = Array.isArray(report.identifiedGaps) ? report.identifiedGaps : [];
  sheet(`Gap report — ${esc(lesson?.topic || 'session')}`, `
    <p class="small muted">${esc(fmtDate(session?.scheduledDate, { relative: false }))} ·
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

function showAttempts(quiz, attempts) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  sheet(`Attempts — ${esc(quiz?.title || 'Quiz')}`, attempts.length ? `
    <p class="small muted">${attempts.length} ${attempts.length === 1 ? 'attempt' : 'attempts'} ·
      average ${esc(Math.round(quizAverage(attempts)))}%</p>
    <div class="stack divide" style="margin-top:12px">${attempts.map((a) => {
      const answers = Array.isArray(a.answers) ? a.answers : [];
      return `<div>
        <div class="row">
          ${badge(`${Math.round(a.score || 0)}%`, (a.score || 0) >= 80 ? 'green' : (a.score || 0) >= 60 ? 'yellow' : 'red')}
          <span class="small" style="flex:1">${esc(fmtDateTime(a.completedAt))}</span>
          <span class="tiny muted">${Number.isFinite(a.timeSpentSeconds) ? `${Math.round(a.timeSpentSeconds / 60)} min` : ''}</span>
        </div>
        <div class="row" style="margin-top:6px">${questions.map((q, i) => {
          const picked = answers.find((x) => x.questionIndex === i);
          const right = picked && picked.selectedIndex === q.correctIndex;
          return `<span class="badge badge-${right ? 'green' : 'red'}" title="${esc(q.questionText || '')}">Q${i + 1} ${right ? '✓' : '✕'}</span>`;
        }).join('')}</div>
      </div>`;
    }).join('')}</div>` : '<p class="small muted">No attempts yet.</p>');
}
