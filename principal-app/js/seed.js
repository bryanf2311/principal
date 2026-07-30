/* ============================================================
   seed.js — populates Firestore with the demo dataset from the
   Admin dashboard ("Seed demo data"). Idempotent: anything that
   already exists is left untouched.

   New Auth accounts are created on a secondary Firebase app so
   the signed-in admin keeps their own session.
   ============================================================ */

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
} from 'firebase/auth';
import { createSecondaryApp, DEFAULT_NEW_ACCOUNT_PASSWORD } from './firebase-config.js';
import {
  listUsers, listCourses, listQuizzes, listSessions, listGapReports, listQuizAttempts,
  saveUserProfile, createCourse, createLesson, createMaterial, createMilestone,
  createSession, createGapReport, createQuiz, createQuizAttempt, createStudentAssessment,
  gradeAttempt,
} from './api.js';
import {
  SEED_USERS, SEED_COURSES, SEED_ATTEMPT, SEED_ASSESSMENTS, buildCourse,
} from './seed-content.js';
import { parseYMD } from './ui.js';

/**
 * @param {{ log?: (line: string) => void, password?: string }} options
 */
export async function seedAll({ log = () => {}, password = DEFAULT_NEW_ACCOUNT_PASSWORD } = {}) {
  const say = (line) => { log(line); console.info(`[seed] ${line}`); };

  /* ---------------------------------------------------------- 1. users */
  const existingUsers = await listUsers();
  const byEmail = new Map(existingUsers.map((u) => [String(u.email || '').toLowerCase(), u]));
  const uidByKey = {};
  const nameByKey = {};

  const secondary = createSecondaryApp();
  try {
    for (const seedUser of SEED_USERS) {
      nameByKey[seedUser.key] = seedUser.name;
      const found = byEmail.get(seedUser.email.toLowerCase());
      if (found) {
        uidByKey[seedUser.key] = found.id;
        say(`· user ${seedUser.email} already exists`);
        continue;
      }

      let uid = null;
      try {
        const cred = await createUserWithEmailAndPassword(secondary.auth, seedUser.email, password);
        uid = cred.user.uid;
        say(`✓ created auth account ${seedUser.email}`);
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
          /* Auth user exists but has no Firestore profile — sign in to learn its uid. */
          try {
            const cred = await signInWithEmailAndPassword(secondary.auth, seedUser.email, password);
            uid = cred.user.uid;
            say(`· linked existing auth account ${seedUser.email}`);
          } catch {
            say(`⚠ ${seedUser.email} exists in Auth with a different password — create users/{uid} by hand`);
            continue;
          }
        } else {
          say(`⚠ ${seedUser.email}: ${err.code || err.message}`);
          continue;
        }
      }

      await saveUserProfile(uid, {
        name: seedUser.name,
        email: seedUser.email,
        role: seedUser.role,
        teacherSlot: seedUser.teacherSlot,
        kind: seedUser.role === 'teacher' ? 'agent' : 'human',
        createdAt: new Date(),
      });
      uidByKey[seedUser.key] = uid;
      say(`✓ profile written for ${seedUser.name} (${seedUser.role})`);
    }
  } finally {
    await signOut(secondary.auth).catch(() => {});
    secondary.dispose();
  }

  const studentUid = uidByKey.student || existingUsers.find((u) => u.role === 'student')?.id || null;

  /* -------------------------------------------------------- 2. courses */
  const existingCourses = await listCourses();
  const courseIdByKey = {};
  const lessonIdsByKey = {};
  const sessionIdsByKey = {};

  for (const seed of SEED_COURSES) {
    const teacherUid = uidByKey[seed.teacherKey];
    const already = existingCourses.find((c) => c.title === seed.title || (teacherUid && c.teacherId === teacherUid && c.slot === seed.slot));
    if (already) {
      courseIdByKey[seed.key] = already.id;
      say(`· course “${seed.title}” already exists — skipping its content`);
      continue;
    }
    if (!teacherUid) {
      say(`⚠ no teacher account for “${seed.title}” — skipped`);
      continue;
    }

    const courseId = await createCourse({
      title: seed.title,
      teacherId: teacherUid,
      teacherName: nameByKey[seed.teacherKey] || '',
      slot: seed.slot,
      dayType: seed.dayType,
      sessionLengthMin: seed.sessionLengthMin,
      studentName: seed.studentName,
      studentId: studentUid,
      skillLevel: seed.skillLevel,
      goal: seed.goal,
    });
    courseIdByKey[seed.key] = courseId;
    say(`✓ course “${seed.title}” (slot ${seed.slot})`);

    const { lessons, sessions } = buildCourse(seed);

    /* lessons + materials */
    const lessonIds = [];
    for (const lesson of lessons) {
      const { materials, ...lessonDoc } = lesson;
      const lessonId = await createLesson(courseId, lessonDoc);
      lessonIds.push(lessonId);
      for (const material of materials) await createMaterial(courseId, lessonId, material);
    }
    lessonIdsByKey[seed.key] = lessonIds;
    say(`  ✓ ${lessons.length} lessons and their materials`);

    /* milestones */
    for (const milestone of seed.milestones) {
      await createMilestone(courseId, {
        description: milestone.description,
        targetWeek: milestone.targetWeek,
        status: milestone.status,
        achievedDate: milestone.status === 'achieved' ? new Date() : null,
        notes: milestone.notes || '',
      });
    }
    say(`  ✓ ${seed.milestones.length} milestones`);

    /* sessions */
    const sessionIds = [];
    for (const session of sessions) {
      const id = await createSession({
        courseId,
        lessonId: lessonIds[session.lessonIndex],
        scheduledDate: session.scheduledDate,
        scheduledTime: session.scheduledTime,
        status: session.status,
        teacherNotes: session.teacherNotes,
      });
      sessionIds.push(id);
    }
    sessionIdsByKey[seed.key] = sessionIds;
    say(`  ✓ ${sessions.length} sessions (${sessions.filter((s) => s.status === 'completed').length} completed)`);

    /* gap reports — filed on the day of their session */
    for (const report of seed.gapReports || []) {
      const session = sessions[report.sessionIndex];
      const filedAt = session ? parseYMD(session.scheduledDate) : new Date();
      filedAt.setHours(17, 30, 0, 0);
      await createGapReport({
        sessionId: sessionIds[report.sessionIndex],
        teacherId: teacherUid,
        courseId,
        warmupResults: report.warmupResults,
        applicationTask: report.applicationTask,
        applicationResult: report.applicationResult,
        applicationNotes: report.applicationNotes,
        identifiedGaps: report.identifiedGaps,
        remediationPlan: report.remediationPlan,
        filedAt,
      });
    }
    if (seed.gapReports?.length) say(`  ✓ ${seed.gapReports.length} gap reports`);

    /* quizzes */
    for (const quiz of seed.quizzes || []) {
      const lessonIndex = (quiz.week - 1) * 3;
      await createQuiz({
        courseId,
        lessonId: lessonIds[lessonIndex] || null,
        title: quiz.title,
        description: quiz.description,
        timeLimitMinutes: quiz.timeLimitMinutes,
        questions: quiz.questions,
      });
    }
    if (seed.quizzes?.length) say(`  ✓ ${seed.quizzes.length} quizzes`);
  }

  /* ------------------------------------------- 3. one student attempt */
  if (studentUid) {
    const targetCourseId = courseIdByKey[SEED_ATTEMPT.courseKey];
    if (targetCourseId) {
      const quizzes = await listQuizzes({ courseId: targetCourseId });
      const seedCourse = SEED_COURSES.find((c) => c.key === SEED_ATTEMPT.courseKey);
      const wanted = seedCourse?.quizzes.find((q) => q.week === SEED_ATTEMPT.quizWeek);
      const quiz = quizzes.find((q) => q.title === wanted?.title);
      const attempts = await listQuizAttempts({ userId: studentUid });
      if (quiz && !attempts.some((a) => a.quizId === quiz.id)) {
        const answers = SEED_ATTEMPT.selections.map((selectedIndex, questionIndex) => ({ questionIndex, selectedIndex }));
        const { score } = gradeAttempt(quiz, answers);
        const completedAt = new Date();
        completedAt.setDate(completedAt.getDate() - 3);
        await createQuizAttempt({
          quizId: quiz.id,
          userId: studentUid,
          answers,
          score,
          timeSpentSeconds: SEED_ATTEMPT.timeSpentSeconds,
          completedAt,
        });
        say(`✓ sample quiz attempt for the student (${score}%)`);
      }
    }

    /* ------------------------------------- 4. student self-assessments */
    const allSessions = await listSessions();
    for (const assessment of SEED_ASSESSMENTS) {
      const courseId = courseIdByKey[assessment.courseKey];
      const ids = sessionIdsByKey[assessment.courseKey];
      const sessionId = ids ? ids[assessment.sessionIndex] : null;
      if (!courseId || !sessionId) continue;
      if (!allSessions.some((s) => s.id === sessionId)) continue;
      await createStudentAssessment({
        sessionId,
        userId: studentUid,
        understandingRating: assessment.understandingRating,
        confidenceRating: assessment.confidenceRating,
        notes: assessment.notes,
      });
    }
    say('✓ sample self-assessments');
  } else {
    say('⚠ no student account found — skipped quiz attempt and self-assessments');
  }

  const reports = await listGapReports();
  say(`Done. ${(await listCourses()).length} courses and ${reports.length} gap reports in Firestore.`);
  say(`Sign-in password for seeded accounts: ${password}`);
}
