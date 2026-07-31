/* ============================================================
   #/class/:courseId — one class's own dashboard. A grid of
   clickable squares, one per session, labeled by date; clicking
   one opens that session's slides/homework/exam.
   ============================================================ */

import {
  getCourse, listSessions, listMilestones, listGapReports, milestoneProgress, courseHealth, HEALTH_LABEL,
} from '../api.js';
import {
  esc, section, card, badge, bar, empty, healthDot, skeletonPage, fmtDate, fmtTime, todayYMD, kindFor,
} from '../ui.js';

export async function render(mount, ctx) {
  mount.innerHTML = skeletonPage();
  const [courseId] = ctx.params;
  const backHref = ctx.profile.role === 'teacher' ? '#/teacher' : '#/dashboard';

  const [course, sessions, milestones, reports] = await Promise.all([
    getCourse(courseId),
    listSessions({ courseId }),
    listMilestones(courseId),
    listGapReports({}).then((all) => all.filter((r) => r.courseId === courseId)),
  ]);

  if (!course) {
    mount.innerHTML = card(`${empty('This class could not be found.', '🤷')}
      <p class="right"><a class="btn btn-sm" href="${backHref}">← Back to dashboard</a></p>`);
    return;
  }

  ctx.setHeader(course.title, `${course.dayType || ''}${course.studentName ? ` · ${course.studentName}` : ''}`);

  const progress = milestoneProgress(milestones);
  const healthStatus = courseHealth({ milestones, reports });
  const today = todayYMD();
  const sorted = [...sessions].sort((a, b) => (a.scheduledDate || '').localeCompare(b.scheduledDate || ''));

  const grid = sorted.length
    ? sorted.map((s) => sessionSquare(s, courseId, today)).join('')
    : empty('No sessions scheduled for this class yet.', '🗓️');

  mount.innerHTML = [
    section('📘 Overview', card(`
      <div class="card-head">
        <div>
          <h3>${esc(course.title)} ${healthDot(healthStatus)}</h3>
          <p class="tiny muted">${esc(HEALTH_LABEL[healthStatus] || 'On track')}</p>
        </div>
        <span class="spacer"></span>
        <a class="btn btn-sm" href="${backHref}">← Back</a>
      </div>
      ${bar(progress.pct, '', `${progress.achieved}/${progress.total} milestones`)}
    `), { id: 'sec-class-head' }),
    section('🗓️ Sessions', `<div class="session-grid">${grid}</div>`, { id: 'sec-class-sessions', sub: `${sorted.length} total` }),
  ].join('');
}

function sessionSquare(session, courseId, today) {
  const isToday = session.scheduledDate === today;
  const statusLabel = session.status === 'upcoming' && isToday ? 'today' : (session.status || 'upcoming');
  return `<a class="session-square status-${esc(session.status || 'upcoming')} ${isToday ? 'is-today' : ''}"
      href="#/class/${esc(courseId)}/session/${esc(session.id)}">
    <span class="session-square-date">${esc(fmtDate(session.scheduledDate))}</span>
    <span class="session-square-time">${esc(fmtTime(session.scheduledTime))}</span>
    ${badge(statusLabel, kindFor(session.status || 'upcoming'))}
  </a>`;
}
