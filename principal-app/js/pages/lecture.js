/* ============================================================
   #/lecture/:courseId/:lessonId/:materialId — a simple slide
   deck: one slide at a time, click-through, no grading. Content
   is authored either by a human teacher (dashboard form) or an
   AI agent (principal.mjs), stored on a "slides"-type material.
   ============================================================ */

import { getMaterial, getLesson, getCourse } from '../api.js';
import { esc, card, empty } from '../ui.js';

export async function render(mount, ctx) {
  const [courseId, lessonId, materialId] = ctx.params;
  const backHref = ctx.profile.role === 'teacher' ? '#/teacher' : '#/dashboard';

  const [material, lesson, course] = await Promise.all([
    getMaterial(courseId, lessonId, materialId).catch(() => null),
    getLesson(courseId, lessonId).catch(() => null),
    getCourse(courseId).catch(() => null),
  ]);

  const slides = Array.isArray(material?.slides) ? material.slides : [];

  if (!material || material.type !== 'slides' || !slides.length) {
    mount.innerHTML = `<div class="quiz-wrap">${card(
      `${empty('This lecture is not available.', '📽️')}
       <p class="right"><a class="btn btn-sm" href="${backHref}">← Back to dashboard</a></p>`,
    )}</div>`;
    return null;
  }

  ctx.setHeader(material.title || 'Lecture',
    course && lesson ? `${course.title} · ${lesson.topic || 'lesson'}` : '');

  let index = 0;

  function shell(inner) {
    mount.innerHTML = `<div class="quiz-wrap lecture-wrap">
      <div class="quiz-top">
        <a class="btn btn-sm" href="${backHref}">← Exit</a>
        <span class="spacer" style="flex:1"></span>
        <span class="badge badge-blue">📽️ Lecture</span>
      </div>
      ${inner}
    </div>`;
  }

  function paint() {
    const slide = slides[index] || {};
    const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
    const isFirst = index === 0;
    const isLast = index === slides.length - 1;

    shell(card(`
      <div class="q-progress">
        <span class="small strong nowrap">Slide ${index + 1} of ${slides.length}</span>
        <div class="bar"><i style="width:${((index + 1) / slides.length) * 100}%"></i></div>
      </div>
      <div class="slide-dots">${slides.map((_, i) => `
        <span class="slide-dot ${i === index ? 'active' : ''}" data-goto="${i}" title="Slide ${i + 1}"></span>`).join('')}</div>

      <h2 class="slide-title">${esc(slide.title || `Slide ${index + 1}`)}</h2>
      ${bullets.length ? `<ul class="slide-bullets">${bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`
        : '<p class="small muted">No content on this slide.</p>'}
      ${slide.notes ? `<details class="lesson" style="margin-top:16px">
          <summary>Notes</summary>
          <div class="lesson-body" style="white-space:pre-wrap">${esc(slide.notes)}</div>
        </details>` : ''}

      <div class="row" style="margin-top:24px">
        <button class="btn" id="prev-btn" ${isFirst ? 'disabled' : ''}>← Previous</button>
        <span style="flex:1"></span>
        ${isLast
          ? `<a class="btn btn-primary" href="${backHref}">Finish ✓</a>`
          : `<button class="btn btn-primary" id="next-btn">Next →</button>`}
      </div>
    `, { title: esc(material.title || 'Lecture'), sub: `${slides.length} slides` }));

    mount.querySelector('#prev-btn')?.addEventListener('click', () => { index -= 1; paint(); });
    mount.querySelector('#next-btn')?.addEventListener('click', () => { index += 1; paint(); });
    mount.querySelectorAll('.slide-dot').forEach((dot) => {
      dot.addEventListener('click', () => { index = Number(dot.dataset.goto); paint(); });
    });
  }

  const onKey = (event) => {
    if (event.key === 'ArrowRight' && index < slides.length - 1) { index += 1; paint(); }
    else if (event.key === 'ArrowLeft' && index > 0) { index -= 1; paint(); }
  };
  document.addEventListener('keydown', onKey);

  paint();
  return () => document.removeEventListener('keydown', onKey);
}
