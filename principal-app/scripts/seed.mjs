#!/usr/bin/env node
/* ============================================================
   scripts/seed.mjs — seeds Firestore with the demo dataset using
   the Admin SDK. Creates the Auth accounts too, which the browser
   seeder can only do for accounts it is allowed to sign up.

   Usage:
     cd principal-app/scripts
     npm install
     export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
     export SEED_PASSWORD='Principal123!'        # optional
     npm run seed

   Re-running is safe: existing users, courses and their content
   are detected and skipped.
   ============================================================ */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

import {
  SEED_USERS, SEED_COURSES, SEED_ATTEMPT, SEED_ASSESSMENTS, buildCourse,
} from '../js/seed-content.js';

const PASSWORD = process.env.SEED_PASSWORD || 'Principal123!';
const say = (line) => console.log(line);

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

const newApiKey = () => `pk_${crypto.randomBytes(20).toString('hex')}`;

function gradeAttempt(quiz, answers) {
  const questions = quiz.questions || [];
  const correct = questions.reduce((sum, q, i) => {
    const picked = answers.find((a) => a.questionIndex === i);
    return sum + (picked && picked.selectedIndex === q.correctIndex ? 1 : 0);
  }, 0);
  return Math.round((correct / Math.max(1, questions.length)) * 100);
}

/* ------------------------------------------------------------- 1. users */

async function ensureUser(seedUser) {
  let record = null;
  try {
    record = await auth.getUserByEmail(seedUser.email);
    say(`· auth account exists: ${seedUser.email}`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    record = await auth.createUser({
      email: seedUser.email,
      password: PASSWORD,
      displayName: seedUser.name,
      emailVerified: true,
    });
    say(`✓ created auth account: ${seedUser.email}`);
  }

  const ref = db.collection('users').doc(record.uid);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({
      name: seedUser.name,
      email: seedUser.email,
      role: seedUser.role,
      teacherSlot: seedUser.teacherSlot,
      apiKey: seedUser.role === 'teacher' ? newApiKey() : '',
      createdAt: FieldValue.serverTimestamp(),
    });
    say(`✓ profile written: ${seedUser.name} (${seedUser.role})`);
  } else if (seedUser.role === 'teacher' && !existing.data().apiKey) {
    await ref.update({ apiKey: newApiKey() });
    say(`✓ issued API key for ${seedUser.name}`);
  }
  return record.uid;
}

/* ----------------------------------------------------------- 2. content */

async function seedCourse(seed, { teacherUid, teacherName, studentUid }) {
  const existing = await db.collection('courses').where('title', '==', seed.title).limit(1).get();
  if (!existing.empty) {
    say(`· course “${seed.title}” already exists — skipping`);
    return { courseId: existing.docs[0].id, created: false, sessionIds: [] };
  }

  const courseRef = await db.collection('courses').add({
    title: seed.title,
    teacherId: teacherUid,
    teacherName,
    slot: seed.slot,
    dayType: seed.dayType,
    sessionLengthMin: seed.sessionLengthMin,
    studentName: seed.studentName,
    studentId: studentUid || null,
    skillLevel: seed.skillLevel,
    goal: seed.goal,
    createdAt: FieldValue.serverTimestamp(),
  });
  say(`✓ course “${seed.title}” (slot ${seed.slot})`);

  const { lessons, sessions } = buildCourse(seed);

  const lessonIds = [];
  for (const lesson of lessons) {
    const { materials, ...lessonDoc } = lesson;
    const lessonRef = await courseRef.collection('lessons').add(lessonDoc);
    lessonIds.push(lessonRef.id);
    for (const material of materials) await lessonRef.collection('materials').add(material);
  }
  say(`  ✓ ${lessons.length} lessons + materials`);

  for (const milestone of seed.milestones) {
    await courseRef.collection('milestones').add({
      description: milestone.description,
      targetWeek: milestone.targetWeek,
      status: milestone.status,
      achievedDate: milestone.status === 'achieved' ? new Date() : null,
      notes: milestone.notes || '',
    });
  }
  say(`  ✓ ${seed.milestones.length} milestones`);

  const sessionIds = [];
  for (const session of sessions) {
    const ref = await db.collection('sessions').add({
      courseId: courseRef.id,
      lessonId: lessonIds[session.lessonIndex],
      scheduledDate: session.scheduledDate,
      scheduledTime: session.scheduledTime,
      status: session.status,
      teacherNotes: session.teacherNotes,
      createdAt: FieldValue.serverTimestamp(),
    });
    sessionIds.push(ref.id);
  }
  say(`  ✓ ${sessions.length} sessions`);

  for (const report of seed.gapReports || []) {
    const [y, m, d] = sessions[report.sessionIndex].scheduledDate.split('-').map(Number);
    const filedAt = new Date(y, m - 1, d, 17, 30);
    await db.collection('gapReports').add({
      sessionId: sessionIds[report.sessionIndex],
      teacherId: teacherUid,
      courseId: courseRef.id,
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

  const quizIds = [];
  for (const quiz of seed.quizzes || []) {
    const ref = await db.collection('quizzes').add({
      courseId: courseRef.id,
      lessonId: lessonIds[(quiz.week - 1) * 3] || null,
      title: quiz.title,
      description: quiz.description,
      timeLimitMinutes: quiz.timeLimitMinutes,
      questions: quiz.questions,
      createdAt: FieldValue.serverTimestamp(),
    });
    quizIds.push({ id: ref.id, week: quiz.week, questions: quiz.questions });
  }
  if (quizIds.length) say(`  ✓ ${quizIds.length} quizzes`);

  return { courseId: courseRef.id, created: true, sessionIds, quizIds };
}

/* --------------------------------------------------------------- main */

async function main() {
  say('Seeding Principal…\n');

  const uidByKey = {};
  const nameByKey = {};
  for (const seedUser of SEED_USERS) {
    nameByKey[seedUser.key] = seedUser.name;
    uidByKey[seedUser.key] = await ensureUser(seedUser);
  }

  const studentUid = uidByKey.student;
  const created = {};

  for (const seed of SEED_COURSES) {
    const teacherUid = uidByKey[seed.teacherKey];
    if (!teacherUid) {
      say(`⚠ no teacher for “${seed.title}” — skipped`);
      continue;
    }
    created[seed.key] = await seedCourse(seed, {
      teacherUid,
      teacherName: nameByKey[seed.teacherKey],
      studentUid,
    });
  }

  /* sample quiz attempt */
  const target = created[SEED_ATTEMPT.courseKey];
  if (target?.created && studentUid) {
    const quiz = (target.quizIds || []).find((q) => q.week === SEED_ATTEMPT.quizWeek);
    if (quiz) {
      const answers = SEED_ATTEMPT.selections.map((selectedIndex, questionIndex) => ({ questionIndex, selectedIndex }));
      const completedAt = new Date();
      completedAt.setDate(completedAt.getDate() - 3);
      await db.collection('quizAttempts').add({
        quizId: quiz.id,
        userId: studentUid,
        answers,
        score: gradeAttempt(quiz, answers),
        timeSpentSeconds: SEED_ATTEMPT.timeSpentSeconds,
        completedAt,
      });
      say(`✓ sample quiz attempt (${gradeAttempt(quiz, answers)}%)`);
    }
  }

  /* sample self-assessments */
  for (const assessment of SEED_ASSESSMENTS) {
    const course = created[assessment.courseKey];
    const sessionId = course?.sessionIds?.[assessment.sessionIndex];
    if (!sessionId || !studentUid) continue;
    await db.collection('studentAssessments').add({
      sessionId,
      userId: studentUid,
      understandingRating: assessment.understandingRating,
      confidenceRating: assessment.confidenceRating,
      notes: assessment.notes,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  say('✓ sample self-assessments');

  say(`\nDone. Sign in with any seeded email and the password: ${PASSWORD}`);
}

main().catch((err) => {
  console.error('\n✗ Seeding failed:', err);
  process.exit(1);
});
