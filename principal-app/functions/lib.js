/* ============================================================
   lib.js — request parsing and payload validation for the HTTP
   API. Kept free of Firebase imports so it can be unit tested.
   ============================================================ */

const WARMUP_RESULTS = ['correct', 'incorrect', 'hesitant'];
const APP_RESULTS = ['correct', 'partially_correct', 'needs_work'];
const SEVERITIES = ['critical', 'major', 'minor'];
const SESSION_STATUSES = ['upcoming', 'completed', 'cancelled'];
const MILESTONE_STATUSES = ['not_started', 'in_progress', 'achieved', 'behind'];
const MATERIAL_TYPES = ['video', 'reading', 'quiz'];

/** The route portion of a request path, with the function prefix removed. */
function routeOf(req) {
  const path = (req.path || '/').replace(/\/+$/, '') || '/';
  return path.startsWith('/api') ? (path.slice(4) || '/') : path;
}

/** ['sessions', 'abc123'] for "/sessions/abc123". */
function segmentsOf(route) {
  return String(route || '/').split('/').filter(Boolean);
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isYMD = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHM = (v) => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);

function isPlainObject(body) {
  return Boolean(body) && typeof body === 'object' && !Array.isArray(body);
}

/** @returns {string|null} an error message, or null when the payload is fine. */
function validateGapReport(body) {
  if (!isPlainObject(body)) return 'Body must be a JSON object.';
  if (!isText(body.sessionId)) return 'sessionId is required.';
  if (!isText(body.applicationTask)) return 'applicationTask is required.';
  if (!APP_RESULTS.includes(body.applicationResult)) {
    return `applicationResult must be one of ${APP_RESULTS.join(', ')}.`;
  }

  if (body.warmupResults !== undefined) {
    if (!Array.isArray(body.warmupResults)) return 'warmupResults must be an array.';
    for (const w of body.warmupResults) {
      if (!isPlainObject(w) || !isText(w.question) || !WARMUP_RESULTS.includes(w.result)) {
        return `Each warmupResults entry needs a question and a result of ${WARMUP_RESULTS.join(', ')}.`;
      }
    }
  }

  if (body.identifiedGaps !== undefined) {
    if (!Array.isArray(body.identifiedGaps)) return 'identifiedGaps must be an array.';
    for (const g of body.identifiedGaps) {
      if (!isPlainObject(g) || !isText(g.description) || !SEVERITIES.includes(g.severity)) {
        return `Each identifiedGaps entry needs a description and a severity of ${SEVERITIES.join(', ')}.`;
      }
    }
  }

  return null;
}

function validateSessionUpdate(body) {
  if (!isPlainObject(body)) return 'Body must be a JSON object.';
  if (body.status === undefined && body.teacherNotes === undefined && body.scheduledDate === undefined
      && body.scheduledTime === undefined) {
    return 'Nothing to update: send status, teacherNotes, scheduledDate or scheduledTime.';
  }
  if (body.status !== undefined && !SESSION_STATUSES.includes(body.status)) {
    return `status must be one of ${SESSION_STATUSES.join(', ')}.`;
  }
  if (body.teacherNotes !== undefined && typeof body.teacherNotes !== 'string') {
    return 'teacherNotes must be a string.';
  }
  if (body.scheduledDate !== undefined && !isYMD(body.scheduledDate)) {
    return 'scheduledDate must look like YYYY-MM-DD.';
  }
  if (body.scheduledTime !== undefined && !isHM(body.scheduledTime)) {
    return 'scheduledTime must look like HH:MM (24-hour).';
  }
  return null;
}

function validateMaterial(material, prefix = '') {
  if (!isPlainObject(material)) return `${prefix}material must be an object.`;
  if (!MATERIAL_TYPES.includes(material.type)) {
    return `${prefix}type must be one of ${MATERIAL_TYPES.join(', ')}.`;
  }
  if (!isText(material.title)) return `${prefix}title is required.`;
  if (material.url !== undefined && typeof material.url !== 'string') return `${prefix}url must be a string.`;
  if (material.durationMin !== undefined && !Number.isFinite(Number(material.durationMin))) {
    return `${prefix}durationMin must be a number.`;
  }
  return null;
}

function validateLesson(body) {
  if (!isPlainObject(body)) return 'Body must be a JSON object.';
  if (!isText(body.topic)) return 'topic is required.';
  if (!Number.isFinite(Number(body.weekNumber)) || Number(body.weekNumber) < 1) {
    return 'weekNumber must be a positive number.';
  }
  if (!Number.isFinite(Number(body.sessionNumber)) || Number(body.sessionNumber) < 1) {
    return 'sessionNumber must be a positive number.';
  }
  if (body.materials !== undefined) {
    if (!Array.isArray(body.materials)) return 'materials must be an array.';
    for (const [i, material] of body.materials.entries()) {
      const problem = validateMaterial(material, `materials[${i}].`);
      if (problem) return problem;
    }
  }
  return null;
}

function validateMilestoneUpdate(body) {
  if (!isPlainObject(body)) return 'Body must be a JSON object.';
  if (body.status === undefined && body.notes === undefined) {
    return 'Nothing to update: send status or notes.';
  }
  if (body.status !== undefined && !MILESTONE_STATUSES.includes(body.status)) {
    return `status must be one of ${MILESTONE_STATUSES.join(', ')}.`;
  }
  if (body.notes !== undefined && typeof body.notes !== 'string') return 'notes must be a string.';
  return null;
}

function validateQuiz(body) {
  if (!isPlainObject(body)) return 'Body must be a JSON object.';
  if (!isText(body.title)) return 'title is required.';
  if (body.timeLimitMinutes !== undefined && !Number.isFinite(Number(body.timeLimitMinutes))) {
    return 'timeLimitMinutes must be a number (0 means no limit).';
  }
  if (!Array.isArray(body.questions) || !body.questions.length) {
    return 'questions must be a non-empty array.';
  }
  for (const [i, question] of body.questions.entries()) {
    if (!isPlainObject(question) || !isText(question.questionText)) {
      return `questions[${i}].questionText is required.`;
    }
    if (!Array.isArray(question.options) || question.options.length < 2) {
      return `questions[${i}].options needs at least two entries.`;
    }
    for (const [oi, option] of question.options.entries()) {
      if (!isPlainObject(option) || !isText(option.text)) {
        return `questions[${i}].options[${oi}].text is required.`;
      }
    }
    const correct = Number(question.correctIndex);
    if (!Number.isInteger(correct) || correct < 0 || correct >= question.options.length) {
      return `questions[${i}].correctIndex must point at one of its options.`;
    }
  }
  return null;
}

module.exports = {
  routeOf,
  segmentsOf,
  validateGapReport,
  validateSessionUpdate,
  validateLesson,
  validateMaterial,
  validateMilestoneUpdate,
  validateQuiz,
  WARMUP_RESULTS,
  APP_RESULTS,
  SEVERITIES,
  SESSION_STATUSES,
  MILESTONE_STATUSES,
  MATERIAL_TYPES,
};
