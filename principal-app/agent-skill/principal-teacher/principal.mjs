#!/usr/bin/env node
/* ============================================================
   principal.mjs — the teacher agent's tool for Principal.
   ------------------------------------------------------------
   Talks straight to Firebase Auth + the Firestore REST API, so
   no Cloud Functions (and no Blaze plan) are needed. The agent
   signs in as its own teacher account and the Firestore security
   rules confine it to its own course.

   Zero dependencies — Node 18+ only (global fetch).

   Environment:
     PRINCIPAL_PROJECT_ID       e.g. principal-990be
     PRINCIPAL_WEB_API_KEY      Firebase web API key (public)
     PRINCIPAL_AGENT_EMAIL      this teacher's account
     PRINCIPAL_AGENT_PASSWORD   its password
   Optional:
     PRINCIPAL_TOKEN_CACHE      where to cache the ID token
     PRINCIPAL_SETUP_KEY        only needed for the one-time `setup` command,
                                 which provisions PRINCIPAL_AGENT_EMAIL/
                                 PASSWORD as a brand-new teacher account
     FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST  (tests)

   Every command prints JSON on stdout, or {"error":"…"} plus a
   non-zero exit code on failure.
   ============================================================ */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const PROJECT = process.env.PRINCIPAL_PROJECT_ID;
const WEB_KEY = process.env.PRINCIPAL_WEB_API_KEY;
const EMAIL = process.env.PRINCIPAL_AGENT_EMAIL;
const PASSWORD = process.env.PRINCIPAL_AGENT_PASSWORD;
const SETUP_KEY = process.env.PRINCIPAL_SETUP_KEY;

const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const DB_EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

const AUTH_BASE = AUTH_EMULATOR
  ? `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1`
  : 'https://identitytoolkit.googleapis.com/v1';
const TOKEN_BASE = AUTH_EMULATOR
  ? `http://${AUTH_EMULATOR}/securetoken.googleapis.com/v1`
  : 'https://securetoken.googleapis.com/v1';
const DB_BASE = () => (DB_EMULATOR
  ? `http://${DB_EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents`
  : `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`);

const die = (message) => {
  process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
  process.exit(1);
};

/* --------------------------------------------------------------- auth */

function cachePath() {
  if (process.env.PRINCIPAL_TOKEN_CACHE) return process.env.PRINCIPAL_TOKEN_CACHE;
  const tag = crypto.createHash('sha1').update(`${PROJECT}:${EMAIL}`).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `principal-token-${tag}.json`);
}

function readCache() {
  try { return JSON.parse(fs.readFileSync(cachePath(), 'utf8')); } catch { return null; }
}

function writeCache(data) {
  try { fs.writeFileSync(cachePath(), JSON.stringify(data), { mode: 0o600 }); } catch { /* cache is best-effort */ }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!response.ok) {
    const message = parsed?.error?.message || parsed?.error || text.slice(0, 200) || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }
  return parsed;
}

async function signIn() {
  const cached = readCache();
  if (cached?.idToken && cached.expiresAt > Date.now() + 60_000 && cached.email === EMAIL) return cached;

  if (cached?.refreshToken) {
    try {
      const refreshed = await postJson(`${TOKEN_BASE}/token?key=${WEB_KEY}`, {
        grant_type: 'refresh_token', refresh_token: cached.refreshToken,
      });
      const session = {
        idToken: refreshed.id_token,
        refreshToken: refreshed.refresh_token,
        uid: refreshed.user_id || cached.uid,
        email: EMAIL,
        expiresAt: Date.now() + Number(refreshed.expires_in || 3600) * 1000,
      };
      writeCache(session);
      return session;
    } catch { /* fall through to a fresh password sign-in */ }
  }

  const signedIn = await postJson(`${AUTH_BASE}/accounts:signInWithPassword?key=${WEB_KEY}`, {
    email: EMAIL, password: PASSWORD, returnSecureToken: true,
  });
  const session = {
    idToken: signedIn.idToken,
    refreshToken: signedIn.refreshToken,
    uid: signedIn.localId,
    email: EMAIL,
    expiresAt: Date.now() + Number(signedIn.expiresIn || 3600) * 1000,
  };
  writeCache(session);
  return session;
}

/** Provisions this account as a brand-new teacher — see the `setup` command.
    Runs before signIn(), since the account does not exist yet. */
async function runSetup(body) {
  if (!body.name) throw new Error('name is required, e.g. {"name": "Chemistry Agent", "teacherSlot": 3}');
  let signedUp;
  try {
    signedUp = await postJson(`${AUTH_BASE}/accounts:signUp?key=${WEB_KEY}`, {
      email: EMAIL, password: PASSWORD, returnSecureToken: true,
    });
  } catch (err) {
    if (/EMAIL_EXISTS/.test(err.message)) {
      throw new Error(`${EMAIL} already has a login. If that is you from an earlier attempt, ask the admin to `
        + 'attach a profile to its uid instead of running setup again — do not retry setup.');
    }
    throw err;
  }
  const session = {
    idToken: signedUp.idToken,
    refreshToken: signedUp.refreshToken,
    uid: signedUp.localId,
    email: EMAIL,
    expiresAt: Date.now() + Number(signedUp.expiresIn || 3600) * 1000,
  };
  writeCache(session);

  await patchDoc(session, `claims/${session.uid}`, { setupKey: SETUP_KEY, createdAt: new Date() });

  const teacherSlot = Number.isFinite(Number(body.teacherSlot)) ? Number(body.teacherSlot) : null;
  try {
    await patchDoc(session, `users/${session.uid}`, {
      name: body.name,
      email: EMAIL,
      role: 'teacher',
      teacherSlot,
      kind: 'agent',
      provisionedVia: 'self-setup',
      createdAt: new Date(),
    });
  } catch (err) {
    throw new Error(`Account created but the profile write was refused (${err.message}). The setup key may be `
      + `wrong or has been rotated — check with the admin. Your account exists at uid ${session.uid}; an admin `
      + 'can still attach a profile to it manually.');
  }

  process.stdout.write(`${JSON.stringify({
    uid: session.uid,
    email: EMAIL,
    role: 'teacher',
    teacherSlot,
    message: "Provisioned. This process's PRINCIPAL_AGENT_EMAIL/PRINCIPAL_AGENT_PASSWORD are now valid for every other command.",
  }, null, 2)}\n`);
}

/* --------------------------------------------- Firestore value coding */

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}

const encodeFields = (object) => Object.fromEntries(
  Object.entries(object).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]),
);

function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

const decodeFields = (fields) => Object.fromEntries(
  Object.entries(fields || {}).map(([k, v]) => [k, decode(v)]),
);

const idOf = (name) => String(name || '').split('/').pop();
const docToObject = (doc) => (doc ? { id: idOf(doc.name), ...decodeFields(doc.fields) } : null);

/* ------------------------------------------------------ Firestore REST */

async function request(method, url, body = null, token) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!response.ok) {
    const message = parsed?.error?.message || text.slice(0, 300) || response.statusText;
    if (response.status === 403 || /permission/i.test(message)) {
      throw new Error(`403 the security rules refused that — it is outside your own course (${message})`);
    }
    throw new Error(`${response.status} ${message}`);
  }
  return parsed;
}

const getDoc = async (session, pathname) => docToObject(
  await request('GET', `${DB_BASE()}/${pathname}`, null, session.idToken),
);

async function listDocs(session, collectionPath) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${DB_BASE()}/${collectionPath}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const page = await request('GET', url, null, session.idToken);
    (page?.documents || []).forEach((doc) => out.push(docToObject(doc)));
    pageToken = page?.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** Single-field equality query, which is all the rules allow us to need. */
async function queryWhere(session, collectionId, field, value, { parent = '' } = {}) {
  const url = `${DB_BASE()}${parent ? `/${parent}` : ''}:runQuery`;
  const rows = await request('POST', url, {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encode(value) },
      },
      limit: 500,
    },
  }, session.idToken);
  return (rows || []).filter((row) => row.document).map((row) => docToObject(row.document));
}

const createDoc = async (session, collectionPath, data) => docToObject(
  await request('POST', `${DB_BASE()}/${collectionPath}`, { fields: encodeFields(data) }, session.idToken),
);

async function patchDoc(session, pathname, data) {
  const mask = Object.keys(data).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  return docToObject(await request(
    'PATCH',
    `${DB_BASE()}/${pathname}?${mask}`,
    { fields: encodeFields(data) },
    session.idToken,
  ));
}

/* ------------------------------------------------------------ helpers */

const todayYMD = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

async function myCourses(session) {
  const courses = await queryWhere(session, 'courses', 'teacherId', session.uid);
  return courses.sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

async function requireCourse(session, courseId) {
  const courses = await myCourses(session);
  if (!courses.length) throw new Error('No course is assigned to this account yet — ask the admin.');
  if (!courseId) {
    if (courses.length === 1) return courses[0];
    throw new Error(`You teach ${courses.length} courses; pass --course=<id>. Ids: ${courses.map((c) => c.id).join(', ')}`);
  }
  const found = courses.find((c) => c.id === courseId);
  if (!found) throw new Error('That course is not yours.');
  return found;
}

async function lessonsOf(session, courseId) {
  const lessons = await listDocs(session, `courses/${courseId}/lessons`);
  return lessons.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

const materialsOf = (session, courseId, lessonId) =>
  listDocs(session, `courses/${courseId}/lessons/${lessonId}/materials`);

async function sessionsOf(session, { courseId = null, date = null, status = null } = {}) {
  const courses = courseId ? [await requireCourse(session, courseId)] : await myCourses(session);
  const all = [];
  for (const course of courses) {
    const rows = await queryWhere(session, 'sessions', 'courseId', course.id);
    all.push(...rows);
  }
  return all
    .filter((s) => (date ? s.scheduledDate === date : true))
    .filter((s) => (status ? s.status === status : true))
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate))
      || String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || '')));
}

async function ownedSession(session, sessionId) {
  const found = await getDoc(session, `sessions/${sessionId}`);
  if (!found) throw new Error('No session with that id.');
  await requireCourse(session, found.courseId);   // throws unless it is ours
  return found;
}

/* ------------------------------------------------------- validation */

const WARMUP = ['correct', 'incorrect', 'hesitant'];
const APP_RESULTS = ['correct', 'partially_correct', 'needs_work'];
const SEVERITIES = ['critical', 'major', 'minor'];
const MILESTONE_STATUSES = ['not_started', 'in_progress', 'achieved', 'behind'];
const SESSION_STATUSES = ['upcoming', 'completed', 'cancelled'];
const MATERIAL_TYPES = ['video', 'reading', 'quiz', 'slides'];

function validateGapReport(body) {
  if (!body.sessionId) return 'sessionId is required.';
  if (!body.applicationTask) return 'applicationTask is required.';
  if (!APP_RESULTS.includes(body.applicationResult)) return `applicationResult must be one of ${APP_RESULTS.join(', ')}.`;
  for (const w of body.warmupResults || []) {
    if (!w.question || !WARMUP.includes(w.result)) return `each warmupResults entry needs question and result of ${WARMUP.join(', ')}.`;
  }
  for (const g of body.identifiedGaps || []) {
    if (!g.description || !SEVERITIES.includes(g.severity)) return `each identifiedGaps entry needs description and severity of ${SEVERITIES.join(', ')}.`;
  }
  return null;
}

function validateSlides(slides) {
  if (!Array.isArray(slides) || !slides.length) return 'slides must be a non-empty array.';
  for (const [i, s] of slides.entries()) {
    if (!s || !s.title) return `slides[${i}].title is required.`;
    if (!Array.isArray(s.bullets) || !s.bullets.length) return `slides[${i}].bullets must be a non-empty array of strings.`;
  }
  return null;
}

function validateQuiz(body) {
  if (!body.title) return 'title is required.';
  if (!Array.isArray(body.questions) || !body.questions.length) return 'questions must be a non-empty array.';
  for (const [i, q] of body.questions.entries()) {
    if (!q.questionText) return `questions[${i}].questionText is required.`;
    if (!Array.isArray(q.options) || q.options.length < 2) return `questions[${i}].options needs at least two entries.`;
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
      return `questions[${i}].correctIndex must point at one of its options.`;
    }
  }
  return null;
}

const isYMD = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isHM = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

function validateCourseCreate(body) {
  if (!body.title) return 'title is required.';
  if (body.slot !== undefined) {
    const slot = Number(body.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > 6) return 'slot must be an integer from 1 to 6.';
  }
  return null;
}

function validateSessionCreate(body) {
  if (!body.lessonId) return 'lessonId is required.';
  if (!isYMD(body.scheduledDate)) return 'scheduledDate must be YYYY-MM-DD.';
  if (!isHM(body.scheduledTime)) return 'scheduledTime must be HH:MM (24-hour).';
  if (body.status !== undefined && !SESSION_STATUSES.includes(body.status)) {
    return `status must be one of ${SESSION_STATUSES.join(', ')}.`;
  }
  return null;
}

function validateMilestoneCreate(body) {
  if (!body.description) return 'description is required.';
  const targetWeek = Number(body.targetWeek);
  if (!Number.isFinite(targetWeek) || targetWeek <= 0) return 'targetWeek must be a positive number.';
  if (body.status !== undefined && !MILESTONE_STATUSES.includes(body.status)) {
    return `status must be one of ${MILESTONE_STATUSES.join(', ')}.`;
  }
  return null;
}

/* -------------------------------------------------------------- CLI */

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) flags[match[1]] = match[2] === undefined ? true : match[2];
    else positional.push(arg);
  }
  return { flags, positional };
}

/** JSON from an argument, or from @file, or from stdin when given "-". */
function readPayload(argument) {
  if (!argument) throw new Error('This command needs a JSON payload.');
  let text = argument;
  if (argument === '-') text = fs.readFileSync(0, 'utf8');
  else if (argument.startsWith('@')) text = fs.readFileSync(argument.slice(1), 'utf8');
  try { return JSON.parse(text); } catch (err) { throw new Error(`Payload is not valid JSON: ${err.message}`); }
}

const USAGE = `principal.mjs — teacher tool for Principal

  setup <json|@file|->            first run only: provision this account as a new teacher
                                   (needs PRINCIPAL_SETUP_KEY); {name, teacherSlot?}
  whoami                          your account and course(s)
  course [--course=ID]            course with lessons, materials, milestones
  today                           today's sessions, lesson and materials inlined
  sessions [--date=YMD|today] [--status=upcoming|completed|cancelled]
  complete <sessionId> [--notes=TEXT]
  cancel <sessionId>
  gap-report <json|@file|->       file a report; supports markSessionCompleted
  milestones
  milestone <id> <status> [--notes=TEXT]
  course-create <json|@file|->    create your own course; {title, slot?, ...}
  session-create <json|@file|->   schedule a session; {lessonId, scheduledDate, scheduledTime, status?}
  milestone-create <json|@file|-> add a milestone; {description, targetWeek, status?}
  lesson <json|@file|->           create a lesson (materials may nest)
  material <lessonId> <json>      attach one material (video/reading/quiz/slides)
  quiz <json|@file|->             create an auto-graded multiple-choice quiz
  attempts [--quizId=ID]          the student's graded quiz attempts
  assessments                     the student's self-assessments
  reports [--limit=N]             gap reports you have filed`;

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const command = positional[0];

  if (!command || command === 'help' || flags.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  for (const [name, value] of Object.entries({
    PRINCIPAL_PROJECT_ID: PROJECT,
    PRINCIPAL_WEB_API_KEY: WEB_KEY,
    PRINCIPAL_AGENT_EMAIL: EMAIL,
    PRINCIPAL_AGENT_PASSWORD: PASSWORD,
    ...(command === 'setup' ? { PRINCIPAL_SETUP_KEY: SETUP_KEY } : {}),
  })) {
    if (!value) die(`${name} is not set in the environment.`);
  }

  if (command === 'setup') {
    await runSetup(readPayload(positional[1] || '{}'));
    return;
  }

  const session = await signIn();
  const out = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

  switch (command) {
    case 'whoami': {
      const profile = await getDoc(session, `users/${session.uid}`);
      const courses = await myCourses(session);
      out({
        uid: session.uid,
        name: profile?.name || '',
        email: profile?.email || EMAIL,
        role: profile?.role || 'unknown',
        teacherSlot: profile?.teacherSlot ?? null,
        today: todayYMD(),
        courses: courses.map((c) => ({ id: c.id, title: c.title, slot: c.slot, studentName: c.studentName })),
      });
      return;
    }

    case 'course': {
      const course = await requireCourse(session, flags.course);
      const lessons = await lessonsOf(session, course.id);
      const withMaterials = [];
      for (const lesson of lessons) {
        withMaterials.push({ ...lesson, materials: await materialsOf(session, course.id, lesson.id) });
      }
      const milestones = await listDocs(session, `courses/${course.id}/milestones`);
      out({ ...course, lessons: withMaterials, milestones });
      return;
    }

    case 'today':
    case 'sessions': {
      const date = command === 'today'
        ? todayYMD()
        : (flags.date === 'today' ? todayYMD() : flags.date || null);
      const rows = await sessionsOf(session, { courseId: flags.course, date, status: flags.status });
      if (command !== 'today') { out({ sessions: rows }); return; }
      const enriched = [];
      for (const row of rows) {
        const lessons = await lessonsOf(session, row.courseId);
        const lesson = lessons.find((l) => l.id === row.lessonId) || null;
        enriched.push({
          ...row,
          lesson: lesson ? { ...lesson, materials: await materialsOf(session, row.courseId, lesson.id) } : null,
        });
      }
      out({ date: todayYMD(), sessions: enriched });
      return;
    }

    case 'complete':
    case 'cancel': {
      const sessionId = positional[1];
      if (!sessionId) throw new Error('Pass the session id.');
      await ownedSession(session, sessionId);
      const patch = { status: command === 'complete' ? 'completed' : 'cancelled', updatedBy: 'agent' };
      if (typeof flags.notes === 'string') patch.teacherNotes = flags.notes;
      out({ session: await patchDoc(session, `sessions/${sessionId}`, patch) });
      return;
    }

    case 'gap-report': {
      const body = readPayload(positional[1]);
      const problem = validateGapReport(body);
      if (problem) throw new Error(problem);
      const target = await ownedSession(session, body.sessionId);
      const created = await createDoc(session, 'gapReports', {
        sessionId: body.sessionId,
        teacherId: session.uid,
        courseId: target.courseId,
        warmupResults: body.warmupResults || [],
        applicationTask: body.applicationTask,
        applicationResult: body.applicationResult,
        applicationNotes: body.applicationNotes || '',
        identifiedGaps: body.identifiedGaps || [],
        remediationPlan: body.remediationPlan || '',
        filedAt: new Date(),
        source: 'agent',
      });
      let sessionCompleted = false;
      if (body.markSessionCompleted) {
        await patchDoc(session, `sessions/${body.sessionId}`, { status: 'completed', updatedBy: 'agent' });
        sessionCompleted = true;
      }
      out({ id: created.id, sessionCompleted });
      return;
    }

    case 'milestones': {
      const course = await requireCourse(session, flags.course);
      const milestones = await listDocs(session, `courses/${course.id}/milestones`);
      out({ courseId: course.id, milestones: milestones.sort((a, b) => (a.targetWeek ?? 0) - (b.targetWeek ?? 0)) });
      return;
    }

    case 'milestone': {
      const [, milestoneId, status] = positional;
      if (!milestoneId || !status) throw new Error('Usage: milestone <id> <status> [--notes=TEXT]');
      if (!MILESTONE_STATUSES.includes(status)) throw new Error(`status must be one of ${MILESTONE_STATUSES.join(', ')}.`);
      const course = await requireCourse(session, flags.course);
      const patch = { status, achievedDate: status === 'achieved' ? new Date() : null };
      if (typeof flags.notes === 'string') patch.notes = flags.notes;
      out({ milestone: await patchDoc(session, `courses/${course.id}/milestones/${milestoneId}`, patch) });
      return;
    }

    case 'course-create': {
      const body = readPayload(positional[1]);
      const problem = validateCourseCreate(body);
      if (problem) throw new Error(problem);
      const created = await createDoc(session, 'courses', {
        title: body.title,
        teacherId: session.uid,
        teacherName: body.teacherName || '',
        slot: body.slot !== undefined ? Number(body.slot) : null,
        dayType: body.dayType || 'A-day',
        sessionLengthMin: Number(body.sessionLengthMin || 50),
        studentName: body.studentName || '',
        skillLevel: body.skillLevel || '',
        goal: body.goal || '',
        createdAt: new Date(),
        source: 'agent',
      });
      out({ id: created.id });
      return;
    }

    case 'session-create': {
      const body = readPayload(positional[1]);
      const problem = validateSessionCreate(body);
      if (problem) throw new Error(problem);
      const course = await requireCourse(session, body.courseId || flags.course);
      const lessons = await lessonsOf(session, course.id);
      if (!lessons.some((l) => l.id === body.lessonId)) throw new Error(`lessonId "${body.lessonId}" is not a lesson on this course.`);
      const created = await createDoc(session, 'sessions', {
        courseId: course.id,
        lessonId: body.lessonId,
        scheduledDate: body.scheduledDate,
        scheduledTime: body.scheduledTime,
        status: body.status || 'upcoming',
        teacherNotes: body.teacherNotes || '',
        createdAt: new Date(),
      });
      out({ id: created.id, courseId: course.id });
      return;
    }

    case 'milestone-create': {
      const body = readPayload(positional[1]);
      const problem = validateMilestoneCreate(body);
      if (problem) throw new Error(problem);
      const course = await requireCourse(session, body.courseId || flags.course);
      const created = await createDoc(session, `courses/${course.id}/milestones`, {
        description: body.description,
        targetWeek: Number(body.targetWeek),
        status: body.status || 'not_started',
        notes: body.notes || '',
      });
      out({ id: created.id, courseId: course.id });
      return;
    }

    case 'lesson': {
      const body = readPayload(positional[1]);
      if (!body.topic) throw new Error('topic is required.');
      const course = await requireCourse(session, body.courseId || flags.course);
      const existing = await lessonsOf(session, course.id);
      const lesson = await createDoc(session, `courses/${course.id}/lessons`, {
        weekNumber: Number(body.weekNumber || 1),
        sessionNumber: Number(body.sessionNumber || 1),
        dayOfWeek: body.dayOfWeek || '',
        topic: body.topic,
        objective: body.objective || '',
        activities: body.activities || '',
        homework: body.homework || '',
        order: Number.isFinite(Number(body.order)) ? Number(body.order) : existing.length + 1,
        source: 'agent',
      });
      const materialIds = [];
      for (const [i, material] of (body.materials || []).entries()) {
        if (!MATERIAL_TYPES.includes(material.type)) throw new Error(`materials[${i}].type must be one of ${MATERIAL_TYPES.join(', ')}.`);
        if (material.type === 'slides') {
          const problem = validateSlides(material.slides);
          if (problem) throw new Error(`materials[${i}].${problem}`);
        }
        const created = await createDoc(session, `courses/${course.id}/lessons/${lesson.id}/materials`, {
          type: material.type,
          title: material.title || '',
          url: material.url || '',
          durationMin: material.type === 'video' ? Number(material.durationMin || 0) : 0,
          ...(material.type === 'slides' ? { slides: material.slides } : {}),
          order: Number.isFinite(Number(material.order)) ? Number(material.order) : i + 1,
        });
        materialIds.push(created.id);
      }
      out({ courseId: course.id, lessonId: lesson.id, materialIds });
      return;
    }

    case 'material': {
      const lessonId = positional[1];
      const body = readPayload(positional[2]);
      if (!lessonId) throw new Error('Usage: material <lessonId> <json>');
      if (!MATERIAL_TYPES.includes(body.type)) throw new Error(`type must be one of ${MATERIAL_TYPES.join(', ')}.`);
      if (body.type === 'slides') {
        const problem = validateSlides(body.slides);
        if (problem) throw new Error(problem);
      }
      const course = await requireCourse(session, body.courseId || flags.course);
      const existing = await materialsOf(session, course.id, lessonId);
      const created = await createDoc(session, `courses/${course.id}/lessons/${lessonId}/materials`, {
        type: body.type,
        title: body.title || '',
        url: body.url || '',
        durationMin: body.type === 'video' ? Number(body.durationMin || 0) : 0,
        ...(body.type === 'slides' ? { slides: body.slides } : {}),
        order: Number.isFinite(Number(body.order)) ? Number(body.order) : existing.length + 1,
      });
      out({ courseId: course.id, lessonId, materialId: created.id });
      return;
    }

    case 'quiz': {
      const body = readPayload(positional[1]);
      const problem = validateQuiz(body);
      if (problem) throw new Error(problem);
      const course = await requireCourse(session, body.courseId || flags.course);
      const created = await createDoc(session, 'quizzes', {
        courseId: course.id,
        lessonId: body.lessonId || null,
        title: body.title,
        description: body.description || '',
        timeLimitMinutes: Number(body.timeLimitMinutes || 0),
        questions: body.questions.map((q) => ({
          questionText: q.questionText,
          options: q.options.map((option, i) => ({
            label: option.label || String.fromCharCode(65 + i),
            text: option.text,
          })),
          correctIndex: Number(q.correctIndex),
        })),
        createdAt: new Date(),
        source: 'agent',
      });
      out({ id: created.id, questionCount: body.questions.length });
      return;
    }

    case 'attempts': {
      const courses = await myCourses(session);
      const attempts = [];
      for (const course of courses) {
        const quizzes = await queryWhere(session, 'quizzes', 'courseId', course.id);
        for (const quiz of quizzes) {
          if (flags.quizId && quiz.id !== flags.quizId) continue;
          const rows = await queryWhere(session, 'quizAttempts', 'quizId', quiz.id);
          rows.forEach((attempt) => attempts.push({
            ...attempt,
            quizTitle: quiz.title,
            questionCount: (quiz.questions || []).length,
          }));
        }
      }
      out({ attempts });
      return;
    }

    case 'assessments': {
      const rows = await sessionsOf(session, { courseId: flags.course });
      const ids = new Set(rows.map((s) => s.id));
      const assessments = [];
      for (const id of ids) {
        const found = await queryWhere(session, 'studentAssessments', 'sessionId', id);
        assessments.push(...found);
      }
      out({ assessments });
      return;
    }

    case 'reports': {
      const rows = await queryWhere(session, 'gapReports', 'teacherId', session.uid);
      rows.sort((a, b) => String(b.filedAt || '').localeCompare(String(a.filedAt || '')));
      out({ gapReports: rows.slice(0, Number(flags.limit) || 20) });
      return;
    }

    default:
      throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
  }
}

main().catch((err) => die(err.message));
