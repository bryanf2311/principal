/* ============================================================
   Cloud Functions for Principal (optional — the web app works
   without them; they add the X-API-Key HTTP API and a callable
   for rotating keys).

   Deploy:  cd functions && npm install && firebase deploy --only functions

   Endpoints (base URL: https://REGION-PROJECT.cloudfunctions.net/api)
     GET  /course        → the caller's course(s) with lessons,
                           materials and milestones
     GET  /sessions      → sessions for the caller's course(s)
     GET  /gap-reports   → gap reports the caller has filed
     POST /gap-reports   → file a gap report
   Every request needs a header:  X-API-Key: pk_…

   Callable (from the signed-in web app):
     rotateApiKey        → issues a fresh key for the caller
   ============================================================ */

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { newApiKey, resolveApiKey } = require('./generateApiKey');
const { routeOf, validateGapReport } = require('./lib');

initializeApp();
const db = getFirestore();

/* ------------------------------------------------------------- helpers */

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.set('Access-Control-Max-Age', '3600');
}

const send = (res, status, body) => res.status(status).json(body);

async function coursesOf(teacher) {
  const snap = teacher.data.role === 'admin'
    ? await db.collection('courses').get()
    : await db.collection('courses').where('teacherId', '==', teacher.uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function expandCourse(course) {
  const lessonsSnap = await db.collection('courses').doc(course.id).collection('lessons').orderBy('order').get();
  const lessons = [];
  for (const lessonDoc of lessonsSnap.docs) {
    const materialsSnap = await lessonDoc.ref.collection('materials').orderBy('order').get();
    lessons.push({
      id: lessonDoc.id,
      ...lessonDoc.data(),
      materials: materialsSnap.docs.map((m) => ({ id: m.id, ...m.data() })),
    });
  }
  const milestonesSnap = await db.collection('courses').doc(course.id).collection('milestones').get();
  return {
    ...course,
    lessons,
    milestones: milestonesSnap.docs.map((m) => ({ id: m.id, ...m.data() })),
  };
}

/* ------------------------------------------------------------ HTTP API */

exports.api = onRequest({ cors: false, maxInstances: 5 }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');

  const teacher = await resolveApiKey(db, req.get('X-API-Key'));
  if (!teacher) return send(res, 401, { error: 'Invalid or missing X-API-Key header.' });

  const route = routeOf(req);

  try {
    /* ---- GET /course ---- */
    if (req.method === 'GET' && (route === '/course' || route === '/courses' || route === '/')) {
      const courses = await coursesOf(teacher);
      const expanded = await Promise.all(courses.map(expandCourse));
      return send(res, 200, { teacher: { uid: teacher.uid, name: teacher.data.name }, courses: expanded });
    }

    /* ---- GET /sessions ---- */
    if (req.method === 'GET' && route === '/sessions') {
      const courses = await coursesOf(teacher);
      const ids = courses.map((c) => c.id);
      if (!ids.length) return send(res, 200, { sessions: [] });
      const snaps = await Promise.all(ids.map((id) => db.collection('sessions')
        .where('courseId', '==', id).orderBy('scheduledDate').get()));
      const sessions = snaps.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      return send(res, 200, { sessions });
    }

    /* ---- GET /gap-reports ---- */
    if (req.method === 'GET' && route === '/gap-reports') {
      const snap = await db.collection('gapReports')
        .where('teacherId', '==', teacher.uid)
        .orderBy('filedAt', 'desc')
        .limit(50)
        .get();
      return send(res, 200, { gapReports: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

    /* ---- POST /gap-reports ---- */
    if (req.method === 'POST' && route === '/gap-reports') {
      const body = req.body || {};
      const problem = validateGapReport(body);
      if (problem) return send(res, 400, { error: problem });

      const sessionSnap = await db.collection('sessions').doc(String(body.sessionId)).get();
      if (!sessionSnap.exists) return send(res, 404, { error: 'sessionId does not exist.' });

      const courseId = sessionSnap.data().courseId;
      const courseSnap = await db.collection('courses').doc(String(courseId)).get();
      const ownsIt = courseSnap.exists && courseSnap.data().teacherId === teacher.uid;
      if (!ownsIt && teacher.data.role !== 'admin') {
        return send(res, 403, { error: 'That session belongs to another teacher’s course.' });
      }

      const ref = await db.collection('gapReports').add({
        sessionId: String(body.sessionId),
        teacherId: teacher.uid,
        courseId,
        warmupResults: body.warmupResults || [],
        applicationTask: String(body.applicationTask),
        applicationResult: body.applicationResult,
        applicationNotes: String(body.applicationNotes || ''),
        identifiedGaps: body.identifiedGaps || [],
        remediationPlan: String(body.remediationPlan || ''),
        filedAt: FieldValue.serverTimestamp(),
        source: 'api',
      });

      if (body.markSessionCompleted) {
        await sessionSnap.ref.update({ status: 'completed' });
      }
      return send(res, 201, { id: ref.id });
    }

    return send(res, 404, { error: `Unknown route ${req.method} ${route}.` });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Internal error.' });
  }
});

/* --------------------------------------------------------- callables */

/** Rotates the caller's own API key (teachers), or another user's (admins). */
exports.rotateApiKey = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError('unauthenticated', 'Sign in first.');

  const callerSnap = await db.collection('users').doc(auth.uid).get();
  if (!callerSnap.exists) throw new HttpsError('permission-denied', 'No profile for this account.');
  const caller = callerSnap.data();

  const targetUid = request.data?.uid || auth.uid;
  if (targetUid !== auth.uid && caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can rotate someone else’s key.');
  }
  if (caller.role !== 'teacher' && caller.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only teachers and admins have API keys.');
  }

  const apiKey = newApiKey();
  await db.collection('users').doc(targetUid).update({
    apiKey,
    apiKeyRotatedAt: FieldValue.serverTimestamp(),
  });
  return { apiKey };
});
