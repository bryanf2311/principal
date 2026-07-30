/* ============================================================
   api.js — the X-API-Key HTTP API that agent teachers drive.
   ------------------------------------------------------------
   Exported as createApi(db, { FieldValue }) so it can be tested
   against the Firestore emulator without deploying anything.

   Every route is scoped to the teacher that owns the API key:
   a key can only ever read or write its own course's data.

   Teachers with exactly one course may omit courseId — the
   common case for an agent that teaches a single slot.
   ============================================================ */

const {
  routeOf, segmentsOf, validateGapReport, validateSessionUpdate,
  validateLesson, validateMaterial, validateMilestoneUpdate, validateQuiz,
} = require('./lib');
const { resolveApiKey } = require('./generateApiKey');

const ENDPOINTS = [
  ['GET', '/', 'This index.'],
  ['GET', '/course', 'Your course(s) with lessons, materials and milestones.'],
  ['GET', '/sessions', 'Your sessions. Filters: ?date=YYYY-MM-DD|today, ?status=upcoming|completed|cancelled.'],
  ['GET', '/sessions/today', 'Shorthand for today\'s sessions, with the lesson inlined.'],
  ['PATCH', '/sessions/{id}', 'Update status, teacherNotes, scheduledDate or scheduledTime.'],
  ['POST', '/lessons', 'Add a lesson (optionally with a materials array).'],
  ['POST', '/materials', 'Attach a material to a lesson.'],
  ['GET', '/milestones', 'Your course milestones.'],
  ['PATCH', '/milestones/{id}', 'Update a milestone status or notes.'],
  ['GET', '/gap-reports', 'Gap reports you have filed (newest first).'],
  ['POST', '/gap-reports', 'File a gap report. Pass markSessionCompleted to close the session too.'],
  ['GET', '/quizzes', 'Quizzes on your course.'],
  ['POST', '/quizzes', 'Create a multiple-choice quiz.'],
  ['GET', '/quiz-attempts', 'Student attempts on your quizzes, graded. Filter: ?quizId=.'],
  ['GET', '/assessments', 'Student self-assessments for your sessions.'],
];

function createApi(db, { FieldValue }) {
  const now = () => FieldValue.serverTimestamp();
  const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  /** Thrown to produce a specific HTTP status. */
  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function coursesOf(teacher) {
    const snap = teacher.data.role === 'admin'
      ? await db.collection('courses').get()
      : await db.collection('courses').where('teacherId', '==', teacher.uid).get();
    return withId(snap);
  }

  /**
   * Resolves the course a request targets and proves the key owns it.
   * Falls back to the teacher's only course when courseId is omitted.
   */
  async function requireCourse(teacher, courseId) {
    const courses = await coursesOf(teacher);
    if (!courseId) {
      if (courses.length === 1) return courses[0];
      if (!courses.length) throw new ApiError(404, 'No course is assigned to this API key yet.');
      throw new ApiError(400, `courseId is required — this key owns ${courses.length} courses: ${courses.map((c) => c.id).join(', ')}.`);
    }
    const found = courses.find((c) => c.id === courseId);
    if (!found) throw new ApiError(403, 'That course does not belong to this API key.');
    return found;
  }

  async function requireSession(teacher, sessionId) {
    const snap = await db.collection('sessions').doc(String(sessionId)).get();
    if (!snap.exists) throw new ApiError(404, 'sessionId does not exist.');
    const session = { id: snap.id, ...snap.data() };
    await requireCourse(teacher, session.courseId);
    return { session, ref: snap.ref };
  }

  async function lessonsOf(courseId) {
    const snap = await db.collection('courses').doc(courseId).collection('lessons').orderBy('order').get();
    return withId(snap);
  }

  async function expandCourse(course) {
    const lessonDocs = await db.collection('courses').doc(course.id).collection('lessons').orderBy('order').get();
    const lessons = [];
    for (const lessonDoc of lessonDocs.docs) {
      const materials = await lessonDoc.ref.collection('materials').orderBy('order').get();
      lessons.push({ id: lessonDoc.id, ...lessonDoc.data(), materials: withId(materials) });
    }
    const milestones = await db.collection('courses').doc(course.id).collection('milestones').get();
    return { ...course, lessons, milestones: withId(milestones) };
  }

  function todayYMD() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  async function sessionsOf(teacher, { date = null, status = null } = {}) {
    const courses = await coursesOf(teacher);
    if (!courses.length) return { courses, sessions: [] };
    const snaps = await Promise.all(courses.map((c) => db.collection('sessions').where('courseId', '==', c.id).get()));
    let sessions = snaps.flatMap(withId);
    if (date) sessions = sessions.filter((s) => s.scheduledDate === date);
    if (status) sessions = sessions.filter((s) => s.status === status);
    sessions.sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate))
      || String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || '')));
    return { courses, sessions };
  }

  /* ------------------------------------------------------------ handler */

  return async function handle(req, res) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.set('Access-Control-Max-Age', '3600');
    if (req.method === 'OPTIONS') return res.status(204).send('');

    const key = typeof req.get === 'function' ? req.get('X-API-Key') : (req.headers || {})['x-api-key'];
    const teacher = await resolveApiKey(db, key);
    if (!teacher) {
      return res.status(401).json({
        error: 'Invalid or missing X-API-Key header.',
        hint: 'An admin issues keys from the Principal dashboard: Admin → All Teachers → Copy.',
      });
    }

    const route = routeOf(req);
    const seg = segmentsOf(route);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const q = req.query || {};
    const method = req.method;

    const send = (status, payload) => res.status(status).json(payload);

    try {
      /* ---------------------------------------------------- discovery */
      if (method === 'GET' && !seg.length) {
        const courses = await coursesOf(teacher);
        return send(200, {
          service: 'principal',
          teacher: { id: teacher.uid, name: teacher.data.name || '', slot: teacher.data.teacherSlot ?? null },
          courses: courses.map((c) => ({ id: c.id, title: c.title, slot: c.slot, studentName: c.studentName })),
          today: todayYMD(),
          endpoints: ENDPOINTS.map(([m, path, description]) => ({ method: m, path, description })),
          notes: courses.length === 1
            ? 'You own one course, so courseId may be omitted from every request.'
            : 'Pass courseId explicitly — this key owns more than one course.',
        });
      }

      /* ------------------------------------------------------- course */
      if (method === 'GET' && (seg[0] === 'course' || seg[0] === 'courses') && seg.length === 1) {
        const courses = await coursesOf(teacher);
        return send(200, {
          teacher: { id: teacher.uid, name: teacher.data.name || '' },
          courses: await Promise.all(courses.map(expandCourse)),
        });
      }

      /* ----------------------------------------------------- sessions */
      if (seg[0] === 'sessions' && method === 'GET' && seg.length <= 2) {
        const wantsToday = seg[1] === 'today';
        if (seg.length === 2 && !wantsToday) {
          const { session } = await requireSession(teacher, seg[1]);
          return send(200, { session });
        }
        const date = wantsToday ? todayYMD() : (q.date === 'today' ? todayYMD() : q.date || null);
        const { sessions } = await sessionsOf(teacher, { date, status: q.status || null });
        if (!wantsToday) return send(200, { sessions });

        /* today's view inlines the lesson so an agent needs one call */
        const lessonCache = new Map();
        const enriched = [];
        for (const session of sessions) {
          if (!lessonCache.has(session.courseId)) {
            lessonCache.set(session.courseId, await lessonsOf(session.courseId));
          }
          const lesson = lessonCache.get(session.courseId).find((l) => l.id === session.lessonId) || null;
          let materials = [];
          if (lesson) {
            const snap = await db.collection('courses').doc(session.courseId)
              .collection('lessons').doc(lesson.id).collection('materials').orderBy('order').get();
            materials = withId(snap);
          }
          enriched.push({ ...session, lesson: lesson ? { ...lesson, materials } : null });
        }
        return send(200, { date: todayYMD(), sessions: enriched });
      }

      if (seg[0] === 'sessions' && seg.length === 2 && (method === 'PATCH' || method === 'POST')) {
        const problem = validateSessionUpdate(body);
        if (problem) return send(400, { error: problem });
        const { ref } = await requireSession(teacher, seg[1]);
        const patch = { updatedAt: now(), updatedBy: 'api' };
        for (const field of ['status', 'teacherNotes', 'scheduledDate', 'scheduledTime']) {
          if (body[field] !== undefined) patch[field] = body[field];
        }
        await ref.update(patch);
        const after = await ref.get();
        return send(200, { session: { id: after.id, ...after.data() } });
      }

      /* ------------------------------------------------------ lessons */
      if (seg[0] === 'lessons' && method === 'POST' && seg.length === 1) {
        const problem = validateLesson(body);
        if (problem) return send(400, { error: problem });
        const course = await requireCourse(teacher, body.courseId);
        const existing = await lessonsOf(course.id);
        const order = Number.isFinite(Number(body.order)) ? Number(body.order) : existing.length + 1;
        const lessonRef = await db.collection('courses').doc(course.id).collection('lessons').add({
          weekNumber: Number(body.weekNumber),
          sessionNumber: Number(body.sessionNumber),
          dayOfWeek: body.dayOfWeek || '',
          topic: body.topic,
          objective: body.objective || '',
          activities: body.activities || '',
          homework: body.homework || '',
          order,
          createdAt: now(),
          source: 'api',
        });
        const materials = [];
        for (const [i, material] of (body.materials || []).entries()) {
          const ref = await lessonRef.collection('materials').add({
            type: material.type,
            title: material.title,
            url: material.url || '',
            durationMin: material.type === 'video' ? Number(material.durationMin || 0) : 0,
            order: Number.isFinite(Number(material.order)) ? Number(material.order) : i + 1,
          });
          materials.push(ref.id);
        }
        return send(201, { courseId: course.id, lessonId: lessonRef.id, materialIds: materials });
      }

      /* ---------------------------------------------------- materials */
      if (seg[0] === 'materials' && method === 'POST' && seg.length === 1) {
        if (!body.lessonId) return send(400, { error: 'lessonId is required.' });
        const problem = validateMaterial(body);
        if (problem) return send(400, { error: problem });
        const course = await requireCourse(teacher, body.courseId);
        const lessonRef = db.collection('courses').doc(course.id).collection('lessons').doc(String(body.lessonId));
        if (!(await lessonRef.get()).exists) return send(404, { error: 'lessonId does not exist on your course.' });
        const existing = await lessonRef.collection('materials').get();
        const ref = await lessonRef.collection('materials').add({
          type: body.type,
          title: body.title,
          url: body.url || '',
          durationMin: body.type === 'video' ? Number(body.durationMin || 0) : 0,
          order: Number.isFinite(Number(body.order)) ? Number(body.order) : existing.size + 1,
        });
        return send(201, { courseId: course.id, lessonId: body.lessonId, materialId: ref.id });
      }

      /* --------------------------------------------------- milestones */
      if (seg[0] === 'milestones' && method === 'GET' && seg.length === 1) {
        const course = await requireCourse(teacher, q.courseId);
        const snap = await db.collection('courses').doc(course.id).collection('milestones').get();
        return send(200, {
          courseId: course.id,
          milestones: withId(snap).sort((a, b) => (a.targetWeek ?? 0) - (b.targetWeek ?? 0)),
        });
      }

      if (seg[0] === 'milestones' && seg.length === 2 && (method === 'PATCH' || method === 'POST')) {
        const problem = validateMilestoneUpdate(body);
        if (problem) return send(400, { error: problem });
        const course = await requireCourse(teacher, body.courseId);
        const ref = db.collection('courses').doc(course.id).collection('milestones').doc(seg[1]);
        if (!(await ref.get()).exists) return send(404, { error: 'That milestone is not on your course.' });
        const patch = { updatedAt: now() };
        if (body.status !== undefined) {
          patch.status = body.status;
          patch.achievedDate = body.status === 'achieved' ? now() : null;
        }
        if (body.notes !== undefined) patch.notes = body.notes;
        await ref.update(patch);
        const after = await ref.get();
        return send(200, { milestone: { id: after.id, ...after.data() } });
      }

      /* -------------------------------------------------- gap reports */
      if (seg[0] === 'gap-reports' && method === 'GET' && seg.length === 1) {
        const snap = await db.collection('gapReports').where('teacherId', '==', teacher.uid).get();
        const reports = withId(snap).sort((a, b) => {
          const at = a.filedAt?.toMillis ? a.filedAt.toMillis() : 0;
          const bt = b.filedAt?.toMillis ? b.filedAt.toMillis() : 0;
          return bt - at;
        });
        return send(200, { gapReports: reports.slice(0, Number(q.limit) || 50) });
      }

      if (seg[0] === 'gap-reports' && method === 'POST' && seg.length === 1) {
        const problem = validateGapReport(body);
        if (problem) return send(400, { error: problem });
        const { session, ref: sessionRef } = await requireSession(teacher, body.sessionId);
        const created = await db.collection('gapReports').add({
          sessionId: String(body.sessionId),
          teacherId: teacher.uid,
          courseId: session.courseId,
          warmupResults: body.warmupResults || [],
          applicationTask: String(body.applicationTask),
          applicationResult: body.applicationResult,
          applicationNotes: String(body.applicationNotes || ''),
          identifiedGaps: body.identifiedGaps || [],
          remediationPlan: String(body.remediationPlan || ''),
          filedAt: now(),
          source: 'api',
        });
        if (body.markSessionCompleted) {
          await sessionRef.update({ status: 'completed', updatedAt: now(), updatedBy: 'api' });
        }
        return send(201, { id: created.id, sessionCompleted: Boolean(body.markSessionCompleted) });
      }

      /* ------------------------------------------------------ quizzes */
      if (seg[0] === 'quizzes' && method === 'GET' && seg.length === 1) {
        const courses = await coursesOf(teacher);
        const ids = courses.map((c) => c.id);
        if (!ids.length) return send(200, { quizzes: [] });
        const snaps = await Promise.all(ids.map((id) => db.collection('quizzes').where('courseId', '==', id).get()));
        return send(200, { quizzes: snaps.flatMap(withId) });
      }

      if (seg[0] === 'quizzes' && method === 'POST' && seg.length === 1) {
        const problem = validateQuiz(body);
        if (problem) return send(400, { error: problem });
        const course = await requireCourse(teacher, body.courseId);
        const questions = body.questions.map((question) => ({
          questionText: question.questionText,
          options: question.options.map((option, i) => ({
            label: option.label || String.fromCharCode(65 + i),
            text: option.text,
          })),
          correctIndex: Number(question.correctIndex),
        }));
        const ref = await db.collection('quizzes').add({
          courseId: course.id,
          lessonId: body.lessonId || null,
          title: body.title,
          description: body.description || '',
          timeLimitMinutes: Number(body.timeLimitMinutes || 0),
          questions,
          createdAt: now(),
          source: 'api',
        });
        return send(201, { id: ref.id, questionCount: questions.length });
      }

      /* ------------------------------------------------ quiz attempts */
      if (seg[0] === 'quiz-attempts' && method === 'GET' && seg.length === 1) {
        const courses = await coursesOf(teacher);
        const ids = courses.map((c) => c.id);
        if (!ids.length) return send(200, { attempts: [] });
        const quizSnaps = await Promise.all(ids.map((id) => db.collection('quizzes').where('courseId', '==', id).get()));
        const quizzes = quizSnaps.flatMap(withId).filter((quiz) => (q.quizId ? quiz.id === q.quizId : true));
        const attempts = [];
        for (const quiz of quizzes) {
          const snap = await db.collection('quizAttempts').where('quizId', '==', quiz.id).get();
          for (const attempt of withId(snap)) {
            attempts.push({
              ...attempt,
              quizTitle: quiz.title,
              questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
            });
          }
        }
        return send(200, { attempts });
      }

      /* -------------------------------------------------- assessments */
      if (seg[0] === 'assessments' && method === 'GET' && seg.length === 1) {
        const { sessions } = await sessionsOf(teacher);
        const ids = new Set(sessions.map((s) => s.id));
        if (!ids.size) return send(200, { assessments: [] });
        const snap = await db.collection('studentAssessments').get();
        return send(200, { assessments: withId(snap).filter((a) => ids.has(a.sessionId)) });
      }

      return send(404, {
        error: `Unknown route ${method} ${route}.`,
        endpoints: ENDPOINTS.map(([m, path]) => `${m} ${path}`),
      });
    } catch (err) {
      if (err instanceof ApiError) return send(err.status, { error: err.message });
      console.error(err);
      return send(500, { error: 'Internal error.' });
    }
  };
}

module.exports = { createApi, ENDPOINTS };
