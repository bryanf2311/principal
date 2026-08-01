/* ============================================================
   #/class/:courseId/session/:sessionId — one class session: its
   slide deck & other materials, homework, and (once graded)
   exams. Tabs, not one long scroll — same pattern as the rest
   of this app.
   ============================================================ */

import {
  getCourse, getSession, getLesson, listMaterials, listHomework, setHomeworkStatus,
  listGapReports, listExams, listExamAttempts, listExamSubmissions,
} from '../api.js';
import {
  esc, section, card, badge, empty, materialLink, skeletonPage,
  fmtDate, fmtTime, humanize, kindFor, pct, toast, HOMEWORK_TYPE_ICON,
} from '../ui.js';
import { isPrincipalApiConfigured } from '../principal-api-config.js';
import { requestGradeUpdate } from '../principal-api-client.js';

export async function render(mount, ctx) {
  mount.innerHTML = skeletonPage();
  const [courseId, sessionId] = ctx.params;
  const backHref = `#/class/${encodeURIComponent(courseId)}`;

  const [course, session] = await Promise.all([getCourse(courseId), getSession(sessionId)]);
  if (!course || !session || session.courseId !== courseId) {
    mount.innerHTML = card(`${empty('This session could not be found.', '🤷')}
      <p class="right"><a class="btn btn-sm" href="${backHref}">← Back to class</a></p>`);
    return;
  }

  const [lesson, materials, allHomework, reports, exams] = await Promise.all([
    session.lessonId ? getLesson(courseId, session.lessonId) : null,
    session.lessonId ? listMaterials(courseId, session.lessonId) : [],
    listHomework({ courseId }),
    listGapReports({ sessionId }),
    listExams({ sessionId }),
  ]);
  const homework = allHomework.filter((h) => !session.lessonId || !h.lessonId || h.lessonId === session.lessonId);
  const report = reports[0] || null;

  const isStudent = ctx.profile.role === 'student';
  const examAttempts = isStudent
    ? (await Promise.all(exams.map((e) => listExamAttempts({ examId: e.id, studentId: ctx.user.uid })))).flat()
    : (await Promise.all(exams.map((e) => listExamAttempts({ examId: e.id })))).flat();
  const examSubmissions = isStudent
    ? (await Promise.all(exams.map((e) => listExamSubmissions({ examId: e.id, studentId: ctx.user.uid })))).flat()
    : (await Promise.all(exams.map((e) => listExamSubmissions({ examId: e.id })))).flat();
  const ungradedCount = isStudent ? 0
    : examSubmissions.filter((s) => !examAttempts.some((a) => a.studentId === s.studentId && a.examId === s.examId)).length;

  ctx.setHeader(lesson?.topic || 'Session', `${course.title} · ${fmtDate(session.scheduledDate)}`);

  mount.innerHTML = [
    overviewCard(session, lesson, report, backHref),
    section('', `
      <div class="tabs">
        <button type="button" class="tab-btn active" data-tab-btn="slides">📽️ Slides &amp; materials</button>
        <button type="button" class="tab-btn" data-tab-btn="homework">📓 Homework${homework.length ? ` (${homework.length})` : ''}</button>
        <button type="button" class="tab-btn" data-tab-btn="exam">📝 Exam${exams.length ? ` (${exams.length})` : ''}</button>
      </div>
      <div class="tab-panels">
        <div class="tab-panel active" data-tab-panel="slides">${materialsPanel(materials, courseId, lesson)}</div>
        <div class="tab-panel" data-tab-panel="homework">${homeworkPanel(homework, courseId)}</div>
        <div class="tab-panel" data-tab-panel="exam">${examPanel(exams, examAttempts, examSubmissions, ctx.profile.role, { sessionId, ungradedCount })}</div>
      </div>
    `, { id: 'sec-session-tabs' }),
  ].join('');

  wire(mount, ctx);
}

function overviewCard(session, lesson, report, backHref) {
  const gaps = Array.isArray(report?.identifiedGaps) ? report.identifiedGaps : [];
  return card(`
    <div class="card-head">
      <div>
        <h3>${esc(fmtDate(session.scheduledDate, { relative: false }))}</h3>
        <p class="tiny muted">${esc(fmtTime(session.scheduledTime))}
          ${lesson ? ` · Week ${esc(lesson.weekNumber)}, session ${esc(lesson.sessionNumber)}` : ''}</p>
      </div>
      <span class="spacer"></span>
      ${badge(session.status || 'upcoming', kindFor(session.status || 'upcoming'))}
      <a class="btn btn-sm" href="${backHref}">← Back</a>
    </div>
    ${lesson?.objective ? `<p class="hero-body"><strong>Objective:</strong> ${esc(lesson.objective)}</p>` : ''}
    ${session.teacherNotes ? `<p class="small" style="margin-top:8px"><strong>Teacher notes:</strong> ${esc(session.teacherNotes)}</p>` : ''}
    ${report ? `
      <div class="small strong" style="margin-top:14px">Gap report</div>
      <p class="small muted" style="margin:4px 0">application:
        ${badge(humanize(report.applicationResult || 'n/a'), kindFor(report.applicationResult))}</p>
      ${gaps.length ? `<div class="row" style="margin-top:6px">
          ${gaps.map((g) => badge(`${humanize(g.severity)}: ${g.description}`, kindFor(g.severity))).join('')}
        </div>` : '<p class="small muted">No gaps identified.</p>'}
      ${report.remediationPlan ? `<p class="small" style="margin-top:8px"><strong>Plan:</strong> ${esc(report.remediationPlan)}</p>` : ''}
    ` : (session.status === 'completed' ? '<p class="small muted" style="margin-top:12px">No gap report filed for this session yet.</p>' : '')}
  `);
}

function materialsPanel(materials, courseId, lesson) {
  if (!materials.length) return empty('No slides or materials attached to this session yet.', '📽️');
  return `<div class="stack">${materials.map((m) => materialLink(m, courseId, lesson?.id)).join('')}</div>`;
}

function homeworkPanel(homework, courseId) {
  if (!homework.length) return empty('No homework assigned for this session.', '📓');
  return `<div class="stack divide">${homework.map((h) => `
    <div class="row">
      <span>${HOMEWORK_TYPE_ICON[h.type] || '📌'}</span>
      <span class="small" style="flex:1;min-width:160px">
        <span class="strong">${esc(h.title)}</span>
        ${h.details ? `<br><span class="muted">${esc(h.details)}</span>` : ''}
      </span>
      ${h.url ? `<a class="btn btn-sm" href="${esc(h.url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ''}
      <button class="btn btn-sm ${h.status === 'done' ? '' : 'btn-primary'}" data-hw-toggle="${esc(h.id)}" data-hw-done="${h.status === 'done' ? '0' : '1'}" data-course="${esc(courseId)}">
        ${h.status === 'done' ? '↺ Mark not done' : '✓ Mark done'}
      </button>
    </div>
  `).join('')}</div>`;
}

function examPanel(exams, attempts, submissions, role, { sessionId, ungradedCount } = {}) {
  if (!exams.length) return empty('No exam for this session yet.', '📝');
  const attemptByExam = new Map(attempts.map((a) => [a.examId, a]));
  const submissionByExam = new Map(submissions.map((s) => [s.examId, s]));

  const rows = exams.map((e) => {
    if (role !== 'student') {
      return `<div class="row"><span class="strong" style="flex:1">${esc(e.title || 'Exam')}</span>
        <span class="tiny muted">${e.questions?.length || 0} question${e.questions?.length === 1 ? '' : 's'}</span></div>`;
    }

    const attempt = attemptByExam.get(e.id);
    if (attempt) {
      return `<div class="row">
        <span class="strong" style="flex:1">${esc(e.title || 'Exam')}</span>
        ${badge(`${attempt.score}/${attempt.maxScore} · ${pct(attempt.score / attempt.maxScore)}`, kindFor('completed'))}
        <a class="btn btn-sm" href="#/exam/${esc(e.id)}">Review</a>
      </div>${attempt.feedback ? `<p class="small muted" style="margin:4px 0 0">${esc(attempt.feedback)}</p>` : ''}`;
    }

    if (submissionByExam.has(e.id)) {
      return `<div class="row">
        <span class="strong" style="flex:1">${esc(e.title || 'Exam')}</span>
        ${badge('awaiting grading', 'blue')}
      </div>`;
    }

    return `<div class="row">
      <span class="strong" style="flex:1">${esc(e.title || 'Exam')}</span>
      <a class="btn btn-sm btn-primary" href="#/exam/${esc(e.id)}">Take exam →</a>
    </div>`;
  }).join('');

  const gradeButton = role !== 'student' && ungradedCount > 0
    ? `<div style="margin-top:14px">
        ${isPrincipalApiConfigured()
    ? `<button class="btn btn-primary btn-sm" id="grade-update-btn" data-session="${esc(sessionId)}">
            🩺 Ask the Grading agent to grade ${ungradedCount} submission${ungradedCount === 1 ? '' : 's'} →
          </button>`
    : `<p class="tiny muted">${ungradedCount} submission${ungradedCount === 1 ? '' : 's'} awaiting grading —
          asking the Grading agent needs <code>principal-api</code> deployed and configured first.</p>`}
      </div>`
    : '';

  return `<div class="stack divide">${rows}</div>${gradeButton}`;
}

function wire(mount, ctx) {
  const tabsSection = mount.querySelector('#sec-session-tabs');
  tabsSection?.querySelectorAll('[data-tab-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.tabBtn;
      tabsSection.querySelectorAll('[data-tab-btn]').forEach((b) => b.classList.toggle('active', b === btn));
      tabsSection.querySelectorAll('[data-tab-panel]').forEach((p) => p.classList.toggle('active', p.dataset.tabPanel === id));
    });
  });

  mount.querySelectorAll('[data-hw-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
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
  });

  const gradeBtn = mount.querySelector('#grade-update-btn');
  gradeBtn?.addEventListener('click', async () => {
    gradeBtn.disabled = true;
    try {
      const idToken = await ctx.user.getIdToken();
      await requestGradeUpdate(idToken, { sessionId: gradeBtn.dataset.session });
      toast('Sent to the Grading agent.', 'ok');
    } catch (err) {
      console.error(err);
      toast(`Could not reach the Grading agent: ${err.message}`, 'err');
      gradeBtn.disabled = false;
    }
  });
}
