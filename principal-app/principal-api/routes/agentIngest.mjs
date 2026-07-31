/* Server-to-server routes: the Teaching agent pushes a whole class
   (course/lessons/materials/sessions/homework), the Grading agent
   pushes one exam attempt's grade. Both behind requireAgentKey — see
   lib/auth.mjs for why this trust boundary gets a shared secret while
   the browser-facing routes don't.

   Not transactional: a failure partway through a push-class call can
   leave earlier lessons/sessions already written. Acceptable for a v1
   (principal.mjs's own CLI writes sequentially too, same tradeoff) —
   re-running with courseId set to the partially-created course is the
   recovery path, not an automatic rollback. */
import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firestore.mjs';
import { requireAgentKey } from '../lib/auth.mjs';
import { validatePushClass, validatePushGrades } from '../lib/validate.mjs';

export const agentIngestRouter = Router();
agentIngestRouter.use(requireAgentKey);

agentIngestRouter.post('/teaching/push-class', async (req, res) => {
  const body = req.body || {};
  const problem = validatePushClass(body);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }

  try {
    let courseId = body.courseId;
    if (body.course) {
      const courseRef = await db.collection('courses').add({
        ...body.course,
        createdAt: FieldValue.serverTimestamp(),
      });
      courseId = courseRef.id;
    } else {
      const courseSnap = await db.doc(`courses/${courseId}`).get();
      if (!courseSnap.exists) {
        res.status(404).json({ error: `courseId ${courseId} not found.` });
        return;
      }
    }

    // Lessons may be referenced by sessions before they have a real
    // Firestore id — the agent supplies its own `ref` string per lesson
    // and sessions point at that `ref` instead of a real id.
    const lessonIdByRef = new Map();
    const lessonIds = [];
    for (const lesson of body.lessons || []) {
      const { materials, ref, ...lessonFields } = lesson;
      const lessonRef = await db.collection(`courses/${courseId}/lessons`).add({
        ...lessonFields,
        source: 'agent',
      });
      lessonIds.push(lessonRef.id);
      if (ref) lessonIdByRef.set(ref, lessonRef.id);

      for (const [i, material] of (materials || []).entries()) {
        await db.collection(`courses/${courseId}/lessons/${lessonRef.id}/materials`).add({
          type: material.type,
          title: material.title || '',
          url: material.url || '',
          durationMin: material.type === 'video' ? Number(material.durationMin || 0) : 0,
          ...(material.type === 'slides' ? { slides: material.slides } : {}),
          order: Number.isFinite(Number(material.order)) ? Number(material.order) : i + 1,
        });
      }
    }

    const sessionIds = [];
    for (const session of body.sessions || []) {
      const { lessonRef, lessonId, ...sessionFields } = session;
      const resolvedLessonId = lessonId || lessonIdByRef.get(lessonRef);
      if (!resolvedLessonId) {
        res.status(400).json({ error: `session lessonRef "${lessonRef}" did not match any pushed lesson.` });
        return;
      }
      const sessionRef = await db.collection('sessions').add({
        courseId,
        lessonId: resolvedLessonId,
        status: 'upcoming',
        ...sessionFields,
      });
      sessionIds.push(sessionRef.id);
    }

    const homeworkIds = [];
    for (const hw of body.homework || []) {
      const homeworkRef = await db.collection('homework').add({
        courseId,
        status: 'assigned',
        ...hw,
      });
      homeworkIds.push(homeworkRef.id);
    }

    res.status(201).json({ courseId, lessonIds, sessionIds, homeworkIds });
  } catch (err) {
    console.error('push-class failed:', err);
    res.status(500).json({ error: err.message });
  }
});

agentIngestRouter.post('/grading/push-grades', async (req, res) => {
  const body = req.body || {};
  const problem = validatePushGrades(body);
  if (problem) {
    res.status(400).json({ error: problem });
    return;
  }

  try {
    const attemptRef = await db.collection('examAttempts').add({
      examId: body.examId,
      sessionId: body.sessionId || null,
      courseId: body.courseId || null,
      studentId: body.studentId,
      score: body.score,
      maxScore: body.maxScore,
      perQuestion: body.perQuestion || null,
      feedback: body.feedback || null,
      gradedBy: 'grading-agent',
      gradedAt: FieldValue.serverTimestamp(),
    });
    res.status(201).json({ examAttemptId: attemptRef.id });
  } catch (err) {
    console.error('push-grades failed:', err);
    res.status(500).json({ error: err.message });
  }
});
