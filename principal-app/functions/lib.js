/* ============================================================
   lib.js — request parsing and payload validation for the HTTP
   API. Kept free of Firebase imports so it can be unit tested.
   ============================================================ */

const RESULTS = ['correct', 'incorrect', 'hesitant'];
const APP_RESULTS = ['correct', 'partially_correct', 'needs_work'];
const SEVERITIES = ['critical', 'major', 'minor'];

/** The route portion of a request path, with the function prefix removed. */
function routeOf(req) {
  const path = (req.path || '/').replace(/\/+$/, '') || '/';
  return path.startsWith('/api') ? (path.slice(4) || '/') : path;
}

/** @returns {string|null} an error message, or null when the payload is fine. */
function validateGapReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body must be a JSON object.';
  if (!body.sessionId || typeof body.sessionId !== 'string') return 'sessionId is required.';
  if (!body.applicationTask || typeof body.applicationTask !== 'string') return 'applicationTask is required.';
  if (!APP_RESULTS.includes(body.applicationResult)) {
    return `applicationResult must be one of ${APP_RESULTS.join(', ')}.`;
  }

  if (body.warmupResults !== undefined) {
    if (!Array.isArray(body.warmupResults)) return 'warmupResults must be an array.';
    for (const w of body.warmupResults) {
      if (!w || typeof w.question !== 'string' || !RESULTS.includes(w.result)) {
        return `Each warmupResults entry needs a question and a result of ${RESULTS.join(', ')}.`;
      }
    }
  }

  if (body.identifiedGaps !== undefined) {
    if (!Array.isArray(body.identifiedGaps)) return 'identifiedGaps must be an array.';
    for (const g of body.identifiedGaps) {
      if (!g || typeof g.description !== 'string' || !SEVERITIES.includes(g.severity)) {
        return `Each identifiedGaps entry needs a description and a severity of ${SEVERITIES.join(', ')}.`;
      }
    }
  }

  return null;
}

module.exports = { routeOf, validateGapReport, RESULTS, APP_RESULTS, SEVERITIES };
