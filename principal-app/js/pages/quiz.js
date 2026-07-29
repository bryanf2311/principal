/* ============================================================
   #/quiz/:quizId — one question at a time, countdown timer,
   auto-submit on expiry, instant auto-graded results.
   ============================================================ */

import {
  getQuiz, getCourse, createQuizAttempt, listQuizAttempts, gradeAttempt,
} from '../api.js';
import {
  esc, card, badge, bar, empty, fmtClock, fmtAgo, toast, friendlyError,
} from '../ui.js';

export async function render(mount, ctx) {
  const [quizId] = ctx.params;
  const quiz = await getQuiz(quizId);

  if (!quiz) {
    mount.innerHTML = `<div class="quiz-wrap">${card(
      empty('That quiz no longer exists.', '🤔') + `<p class="right"><a class="btn btn-sm" href="#/dashboard">← Back to dashboard</a></p>`,
    )}</div>`;
    return null;
  }

  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const course = quiz.courseId ? await getCourse(quiz.courseId).catch(() => null) : null;
  const isStudent = ctx.profile.role === 'student';
  const previous = isStudent
    ? (await listQuizAttempts({ userId: ctx.user.uid })).filter((a) => a.quizId === quizId)
    : [];

  ctx.setHeader(quiz.title || 'Quiz', course ? `${course.title} · ${questions.length} questions` : `${questions.length} questions`);

  const run = {
    index: 0,
    answers: new Array(questions.length).fill(null),   // selectedIndex per question
    startedAt: Date.now(),
    remaining: Number(quiz.timeLimitMinutes) > 0 ? Number(quiz.timeLimitMinutes) * 60 : null,
    submitted: false,
    timer: null,
  };

  const stop = () => { if (run.timer) { clearInterval(run.timer); run.timer = null; } };

  if (!questions.length) {
    mount.innerHTML = `<div class="quiz-wrap">${card(empty('This quiz has no questions yet.', '📝'))}</div>`;
    return null;
  }

  /* ---------------------------------------------------------- rendering */

  function shell(inner) {
    mount.innerHTML = `<div class="quiz-wrap">
      <div class="quiz-top">
        <a class="btn btn-sm" href="${isStudent ? '#/dashboard' : '#/teacher'}">← Exit</a>
        <span class="spacer" style="flex:1"></span>
        ${!isStudent ? badge('preview — attempt not saved', 'blue') : ''}
        <span id="timer-slot"></span>
      </div>
      ${inner}
    </div>`;
    paintTimer();
  }

  function paintTimer() {
    const slot = mount.querySelector('#timer-slot');
    if (!slot) return;
    if (run.submitted) { slot.innerHTML = `<span class="badge badge-gray">submitted</span>`; return; }
    if (run.remaining === null) { slot.innerHTML = `<span class="badge badge-gray">no time limit</span>`; return; }
    const cls = run.remaining <= 30 ? 'danger' : run.remaining <= 60 ? 'warn' : '';
    slot.innerHTML = `<span class="timer ${cls}">⏱ ${fmtClock(run.remaining)}</span>`;
  }

  function paintQuestion() {
    const q = questions[run.index] || {};
    const options = Array.isArray(q.options) ? q.options : [];
    const chosen = run.answers[run.index];
    const answered = run.answers.filter((a) => a !== null).length;
    const isLast = run.index === questions.length - 1;

    shell(card(`
      <div class="q-progress">
        <span class="small strong nowrap">Question ${run.index + 1} of ${questions.length}</span>
        <div class="bar"><i style="width:${((run.index + 1) / questions.length) * 100}%"></i></div>
        <span class="tiny muted nowrap">${answered}/${questions.length} answered</span>
      </div>

      <p class="q-text">${esc(q.questionText || '')}</p>

      <div id="opts">
        ${options.map((opt, i) => `
          <label class="opt ${chosen === i ? 'selected' : ''}" data-i="${i}">
            <input type="radio" name="answer" value="${i}" ${chosen === i ? 'checked' : ''}>
            <span class="opt-label">${esc(opt.label || String.fromCharCode(65 + i))}</span>
            <span>${esc(opt.text || '')}</span>
          </label>`).join('')}
      </div>

      <div class="row" style="margin-top:20px">
        <button class="btn" id="prev-btn" ${run.index === 0 ? 'disabled' : ''}>← Previous</button>
        <span style="flex:1"></span>
        ${isLast
          ? `<button class="btn btn-primary" id="submit-btn">Submit quiz</button>`
          : `<button class="btn btn-primary" id="next-btn">Next →</button>`}
      </div>
      ${isLast && answered < questions.length
        ? `<p class="tiny muted right" style="margin-top:8px">${questions.length - answered} unanswered — they will be marked incorrect.</p>`
        : ''}
    `, { title: esc(quiz.title || 'Quiz'), sub: quiz.description ? esc(quiz.description) : '' }));

    mount.querySelectorAll('.opt').forEach((label) => {
      label.addEventListener('click', () => {
        run.answers[run.index] = Number(label.dataset.i);
        mount.querySelectorAll('.opt').forEach((l) => l.classList.toggle('selected', l === label));
      });
    });
    mount.querySelector('#prev-btn')?.addEventListener('click', () => { run.index -= 1; paintQuestion(); });
    mount.querySelector('#next-btn')?.addEventListener('click', () => { run.index += 1; paintQuestion(); });
    mount.querySelector('#submit-btn')?.addEventListener('click', () => submit(false));
  }

  function paintResults({ score, correctCount, total }, { autoSubmitted, saved }) {
    const passed = score >= 70;
    shell(`
      ${card(`
        <div class="score-ring ${passed ? 'pass' : ''}" style="--pct:${score}"><span>${score}%</span></div>
        <p class="right" style="text-align:center">
          <span class="strong">${correctCount} of ${total} correct</span><br>
          <span class="small muted">Time spent ${fmtClock((Date.now() - run.startedAt) / 1000)}
          ${autoSubmitted ? ' · submitted automatically when time ran out' : ''}
          ${saved ? '' : ' · not recorded (preview)'}</span>
        </p>
      `, { title: passed ? '🎉 Nice work!' : '📚 Worth another look' })}

      ${card(questions.map((q, i) => {
        const picked = run.answers[i];
        const right = picked === q.correctIndex;
        const options = Array.isArray(q.options) ? q.options : [];
        return `<div class="review-q">
          <div class="row">
            <span class="strong" style="flex:1">${i + 1}. ${esc(q.questionText || '')}</span>
            ${badge(right ? 'correct' : picked === null ? 'skipped' : 'incorrect', right ? 'green' : picked === null ? 'gray' : 'red')}
          </div>
          <div style="margin-top:9px">
            ${options.map((opt, oi) => {
              const cls = oi === q.correctIndex ? 'correct' : (oi === picked && !right ? 'wrong' : '');
              const tag = oi === q.correctIndex ? ' ✓ correct answer' : (oi === picked && !right ? ' ← your answer' : '');
              return `<div class="opt ${cls}" style="cursor:default">
                <span class="opt-label">${esc(opt.label || String.fromCharCode(65 + oi))}</span>
                <span>${esc(opt.text || '')}<span class="tiny muted">${tag}</span></span>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join(''), { title: 'Question review' })}

      <p class="row" style="margin-top:16px">
        <a class="btn btn-primary" href="${isStudent ? '#/dashboard' : '#/teacher'}">Back to dashboard</a>
        <button class="btn" id="retake-btn">Retake quiz</button>
      </p>`);

    mount.querySelector('#retake-btn').addEventListener('click', () => {
      run.index = 0;
      run.answers = new Array(questions.length).fill(null);
      run.startedAt = Date.now();
      run.submitted = false;
      run.remaining = Number(quiz.timeLimitMinutes) > 0 ? Number(quiz.timeLimitMinutes) * 60 : null;
      startTimer();
      paintQuestion();
    });
  }

  /* --------------------------------------------------------- submitting */

  async function submit(autoSubmitted) {
    if (run.submitted) return;
    run.submitted = true;
    stop();

    const answers = run.answers
      .map((selectedIndex, questionIndex) => ({ questionIndex, selectedIndex }))
      .filter((a) => a.selectedIndex !== null);
    const result = gradeAttempt(quiz, answers);
    const timeSpentSeconds = Math.round((Date.now() - run.startedAt) / 1000);

    let saved = false;
    if (isStudent) {
      try {
        await createQuizAttempt({
          quizId,
          userId: ctx.user.uid,
          answers,
          score: result.score,
          timeSpentSeconds,
        });
        saved = true;
      } catch (err) {
        console.error(err);
        toast(`Score not saved: ${friendlyError(err)}`, 'err');
      }
    }

    if (autoSubmitted) toast('Time’s up — your answers were submitted.', 'err');
    paintResults(result, { autoSubmitted, saved });
  }

  function startTimer() {
    stop();
    if (run.remaining === null) return;
    run.timer = setInterval(() => {
      run.remaining -= 1;
      if (run.remaining <= 0) { run.remaining = 0; paintTimer(); submit(true); return; }
      paintTimer();
    }, 1000);
  }

  /* ------------------------------------------------------------- launch */

  if (previous.length) {
    const best = Math.max(...previous.map((a) => Math.round(a.score || 0)));
    mount.innerHTML = `<div class="quiz-wrap">${card(`
      <p class="small">You have already taken this quiz ${previous.length} ${previous.length === 1 ? 'time' : 'times'}
        — best score ${badge(`${best}%`, best >= 80 ? 'green' : best >= 60 ? 'yellow' : 'red')},
        last attempt ${esc(fmtAgo(previous[0].completedAt))}.</p>
      ${bar(best, best >= 80 ? 'green' : best >= 60 ? 'yellow' : 'red')}
      <div class="row" style="margin-top:16px">
        <button class="btn btn-primary" id="start-btn">Take it again</button>
        <a class="btn" href="#/dashboard">← Back to dashboard</a>
      </div>`, { title: esc(quiz.title || 'Quiz'), sub: quiz.description ? esc(quiz.description) : '' })}</div>`;
    mount.querySelector('#start-btn').addEventListener('click', () => { startTimer(); paintQuestion(); });
  } else {
    startTimer();
    paintQuestion();
  }

  return stop; // router calls this when leaving the page
}
