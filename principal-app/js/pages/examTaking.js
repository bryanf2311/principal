/* ============================================================
   #/exam/:examId — one question at a time, like quiz.js, but no
   client-side auto-grading: exams are graded by the Grading
   agent (see principal-api). Submitting writes to
   examSubmissions and shows an "awaiting grading" screen, not a
   score.
   ============================================================ */

import {
  getExam, getCourse, createExamSubmission, listExamSubmissions, listExamAttempts,
} from '../api.js';
import { esc, card, badge, empty, fmtAgo, toast, friendlyError } from '../ui.js';

export async function render(mount, ctx) {
  const [examId] = ctx.params;
  const exam = await getExam(examId);

  if (!exam) {
    mount.innerHTML = `<div class="quiz-wrap">${card(
      empty('That exam no longer exists.', '🤔') + `<p class="right"><a class="btn btn-sm" href="#/dashboard">← Back to dashboard</a></p>`,
    )}</div>`;
    return;
  }

  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const course = exam.courseId ? await getCourse(exam.courseId).catch(() => null) : null;
  const backHref = exam.sessionId ? `#/class/${exam.courseId}/session/${exam.sessionId}` : '#/dashboard';
  const isTaker = ctx.profile.role === 'student' || ctx.profile.role === 'admin';

  const [attempts, submissions] = isTaker
    ? await Promise.all([
      listExamAttempts({ examId }).then((all) => all.filter((a) => a.studentId === ctx.user.uid)),
      listExamSubmissions({ examId }).then((all) => all.filter((s) => s.studentId === ctx.user.uid)),
    ])
    : [[], []];

  ctx.setHeader(exam.title || 'Exam', course ? `${course.title} · ${questions.length} questions` : `${questions.length} questions`);

  if (!questions.length) {
    mount.innerHTML = `<div class="quiz-wrap">${card(empty('This exam has no questions yet.', '📝'))}</div>`;
    return;
  }

  function shell(inner) {
    mount.innerHTML = `<div class="quiz-wrap">
      <div class="quiz-top">
        <a class="btn btn-sm" href="${backHref}">← Exit</a>
        <span class="spacer" style="flex:1"></span>
        ${!isTaker ? badge('preview — not saved', 'blue') : ''}
      </div>
      ${inner}
    </div>`;
  }

  /* Already graded — this is final, no retake. */
  if (attempts.length) {
    const attempt = attempts[0];
    shell(card(`
      <div class="score-ring pass" style="--pct:${Math.round((attempt.score / attempt.maxScore) * 100)}">
        <span>${attempt.score}/${attempt.maxScore}</span>
      </div>
      <p class="right" style="text-align:center">
        <span class="strong">Graded ${esc(fmtAgo(attempt.gradedAt))}</span>
      </p>
      ${attempt.feedback ? `<p class="small" style="margin-top:12px">${esc(attempt.feedback)}</p>` : ''}
      <p class="row" style="margin-top:16px"><a class="btn btn-primary" href="${backHref}">← Back</a></p>
    `, { title: esc(exam.title || 'Exam') }));
    return;
  }

  /* Submitted, waiting on the Grading agent. */
  if (submissions.length) {
    shell(card(`
      ${empty('Submitted — waiting for it to be graded.', '⏳')}
      <p class="tiny muted" style="text-align:center">Submitted ${esc(fmtAgo(submissions[0].submittedAt))}</p>
      <p class="right" style="margin-top:12px"><a class="btn btn-primary" href="${backHref}">← Back</a></p>
    `, { title: esc(exam.title || 'Exam') }));
    return;
  }

  const run = { index: 0, answers: new Array(questions.length).fill(null), startedAt: Date.now(), submitted: false };

  function paintQuestion() {
    const q = questions[run.index] || {};
    const options = Array.isArray(q.options) ? q.options : [];
    const isMc = q.kind === 'mc' && options.length > 0;
    const chosen = run.answers[run.index];
    const answered = run.answers.filter((a) => a !== null && a !== '').length;
    const isLast = run.index === questions.length - 1;

    shell(card(`
      <div class="q-progress">
        <span class="small strong nowrap">Question ${run.index + 1} of ${questions.length}</span>
        <div class="bar"><i style="width:${((run.index + 1) / questions.length) * 100}%"></i></div>
        <span class="tiny muted nowrap">${answered}/${questions.length} answered</span>
      </div>

      <p class="q-text">${esc(q.questionText || '')}</p>

      ${isMc ? `<div id="opts">
        ${options.map((opt, i) => `
          <label class="opt ${chosen === i ? 'selected' : ''}" data-i="${i}">
            <input type="radio" name="answer" value="${i}" ${chosen === i ? 'checked' : ''}>
            <span class="opt-label">${esc(opt.label || String.fromCharCode(65 + i))}</span>
            <span>${esc(opt.text || '')}</span>
          </label>`).join('')}
      </div>` : `<textarea id="free-answer" rows="6" placeholder="Your answer…">${esc(chosen || '')}</textarea>`}

      <div class="row" style="margin-top:20px">
        <button class="btn" id="prev-btn" ${run.index === 0 ? 'disabled' : ''}>← Previous</button>
        <span style="flex:1"></span>
        ${isLast
          ? `<button class="btn btn-primary" id="submit-btn">Submit exam</button>`
          : `<button class="btn btn-primary" id="next-btn">Next →</button>`}
      </div>
      ${isLast && answered < questions.length
        ? `<p class="tiny muted right" style="margin-top:8px">${questions.length - answered} unanswered.</p>`
        : ''}
    `, { title: esc(exam.title || 'Exam'), sub: exam.description ? esc(exam.description) : '' }));

    if (isMc) {
      mount.querySelectorAll('.opt').forEach((label) => {
        label.addEventListener('click', () => {
          run.answers[run.index] = Number(label.dataset.i);
          mount.querySelectorAll('.opt').forEach((l) => l.classList.toggle('selected', l === label));
        });
      });
    } else {
      mount.querySelector('#free-answer')?.addEventListener('input', (e) => {
        run.answers[run.index] = e.target.value;
      });
    }
    mount.querySelector('#prev-btn')?.addEventListener('click', () => { run.index -= 1; paintQuestion(); });
    mount.querySelector('#next-btn')?.addEventListener('click', () => { run.index += 1; paintQuestion(); });
    mount.querySelector('#submit-btn')?.addEventListener('click', submit);
  }

  async function submit() {
    if (run.submitted) return;
    run.submitted = true;

    const answers = questions.map((q, questionIndex) => (q.kind === 'mc'
      ? { questionIndex, selectedIndex: run.answers[questionIndex] }
      : { questionIndex, text: run.answers[questionIndex] || '' }));

    if (!isTaker) {
      toast('Preview only — this answer set was not submitted.', '');
      shell(card(`${empty('Preview complete — nothing was submitted.', '👀')}
        <p class="right" style="margin-top:12px"><a class="btn btn-primary" href="${backHref}">← Back</a></p>`));
      return;
    }

    try {
      await createExamSubmission({
        examId, courseId: exam.courseId, sessionId: exam.sessionId || null, studentId: ctx.user.uid, answers,
      });
      toast('Exam submitted — awaiting grading.', 'ok');
      render(mount, ctx);
    } catch (err) {
      console.error(err);
      run.submitted = false;
      toast(`Could not submit: ${friendlyError(err)}`, 'err');
    }
  }

  paintQuestion();
}
