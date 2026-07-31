/* Ported from agent-skill/principal-teacher/principal.mjs — same
   validation the CLI already relies on, so the Teaching/Grading agents
   get the same clear errors whichever path they use. Every function
   returns a string describing the problem, or null when the payload is
   fine. */

export const MATERIAL_TYPES = ['video', 'reading', 'quiz', 'slides'];
export const SESSION_STATUSES = ['upcoming', 'completed', 'cancelled'];

const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isHM = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function validateCourseCreate(body) {
  if (!body.title) return 'course.title is required.';
  if (body.slot !== undefined) {
    const slot = Number(body.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 6) return 'course.slot must be an integer from 1 to 6.';
  }
  return null;
}

export function validateSlides(slides) {
  if (!Array.isArray(slides) || !slides.length) return 'slides must be a non-empty array.';
  for (const [i, s] of slides.entries()) {
    if (!s || !s.title) return `slides[${i}].title is required.`;
    if (!Array.isArray(s.bullets) || !s.bullets.length) return `slides[${i}].bullets must be a non-empty array of strings.`;
  }
  return null;
}

export function validateMaterial(material, index) {
  const prefix = index === undefined ? 'material' : `materials[${index}]`;
  if (!MATERIAL_TYPES.includes(material.type)) return `${prefix}.type must be one of ${MATERIAL_TYPES.join(', ')}.`;
  if (material.type === 'slides') {
    const problem = validateSlides(material.slides);
    if (problem) return `${prefix}.${problem}`;
  }
  return null;
}

export function validateLesson(lesson, index) {
  const prefix = index === undefined ? 'lesson' : `lessons[${index}]`;
  if (!lesson.topic) return `${prefix}.topic is required.`;
  for (const [i, material] of (lesson.materials || []).entries()) {
    const problem = validateMaterial(material, i);
    if (problem) return `${prefix}.${problem}`;
  }
  return null;
}

export function validateSessionCreate(session, index) {
  const prefix = index === undefined ? 'session' : `sessions[${index}]`;
  if (!isYMD(session.scheduledDate)) return `${prefix}.scheduledDate must be YYYY-MM-DD.`;
  if (!isHM(session.scheduledTime)) return `${prefix}.scheduledTime must be HH:MM (24-hour).`;
  if (session.status !== undefined && !SESSION_STATUSES.includes(session.status)) {
    return `${prefix}.status must be one of ${SESSION_STATUSES.join(', ')}.`;
  }
  return null;
}

export function validateHomeworkCreate(hw, index) {
  const prefix = index === undefined ? 'homework' : `homework[${index}]`;
  const HOMEWORK_TYPES = ['reading', 'video', 'practice'];
  if (!HOMEWORK_TYPES.includes(hw.type)) return `${prefix}.type must be one of ${HOMEWORK_TYPES.join(', ')}.`;
  if (!hw.title) return `${prefix}.title is required.`;
  return null;
}

/** Validates the whole "push a class" payload: either a new course
    ({course, lessons, sessions, homework}) or an append to an existing
    one ({courseId, lessons, sessions, homework}). */
export function validatePushClass(body) {
  if (!body.courseId && !body.course) return 'either courseId (append) or course (create) is required.';
  if (body.course) {
    const problem = validateCourseCreate(body.course);
    if (problem) return problem;
  }
  for (const [i, lesson] of (body.lessons || []).entries()) {
    const problem = validateLesson(lesson, i);
    if (problem) return problem;
  }
  for (const [i, session] of (body.sessions || []).entries()) {
    if (!session.lessonRef && !session.lessonId) return `sessions[${i}].lessonRef or lessonId is required.`;
    const problem = validateSessionCreate(session, i);
    if (problem) return problem;
  }
  for (const [i, hw] of (body.homework || []).entries()) {
    const problem = validateHomeworkCreate(hw, i);
    if (problem) return problem;
  }
  return null;
}

/** Validates a "push grades" payload for one exam attempt. */
export function validatePushGrades(body) {
  if (!body.examId) return 'examId is required.';
  if (!body.studentId) return 'studentId is required.';
  if (typeof body.score !== 'number' || body.score < 0) return 'score must be a non-negative number.';
  if (typeof body.maxScore !== 'number' || body.maxScore <= 0) return 'maxScore must be a positive number.';
  return null;
}
