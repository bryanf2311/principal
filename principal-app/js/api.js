/* ============================================================
   api.js — every Firestore read/write the app performs.
   ------------------------------------------------------------
   Queries deliberately use a single `where` clause and sort in
   memory: the data volumes here are tiny and it means the app
   never needs composite indexes to be deployed first.
   ============================================================ */

import {
  collection, collectionGroup, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, serverTimestamp, writeBatch, limit as fsLimit,
} from 'firebase/firestore';
import { db } from './firebase-config.js';
import { todayYMD, toDate } from './ui.js';

const withId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const byField = (field, dir = 'asc') => (a, b) => {
  const x = a[field] ?? 0, y = b[field] ?? 0;
  return dir === 'asc' ? (x > y ? 1 : x < y ? -1 : 0) : (x < y ? 1 : x > y ? -1 : 0);
};
const byTimeDesc = (field) => (a, b) => (toDate(b[field])?.getTime() || 0) - (toDate(a[field])?.getTime() || 0);

/* ---------------------------------------------------------------- users */

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function saveUserProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), data, { merge: true });
}

export async function listUsers(role = null) {
  const ref = collection(db, 'users');
  const snap = await getDocs(role ? query(ref, where('role', '==', role)) : ref);
  return withId(snap).sort((a, b) => (a.teacherSlot ?? 99) - (b.teacherSlot ?? 99)
    || String(a.name || '').localeCompare(String(b.name || '')));
}

export async function touchLastActive(uid) {
  try { await updateDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }); } catch { /* non-critical */ }
}

/**
 * Removes a user's profile document. This does NOT delete the underlying
 * Firebase Auth account (the client SDK cannot delete another user's login)
 * — it revokes access, since every rule keys off this document existing.
 * The Auth account itself is cleaned up from the Firebase console if needed.
 */
export async function deleteUserProfile(uid) {
  await deleteDoc(doc(db, 'users', uid));
}

/* ------------------------------------------------------- agent setup key */

/**
 * The one secret that lets an agent provision its own teacher account
 * (see firestore.rules: claimedCurrentSetupKey). Admin-only to read or set.
 */
export async function getSetupKey() {
  const snap = await getDoc(doc(db, 'config', 'setupKey'));
  return snap.exists() ? snap.data().value || '' : '';
}

export function generateSetupKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `sk_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function rotateSetupKey() {
  const value = generateSetupKey();
  await setDoc(doc(db, 'config', 'setupKey'), { value, rotatedAt: serverTimestamp() });
  return value;
}

/* -------------------------------------------------------------- courses */

export async function listCourses({ teacherId = null } = {}) {
  const ref = collection(db, 'courses');
  const snap = await getDocs(teacherId ? query(ref, where('teacherId', '==', teacherId)) : ref);
  return withId(snap).sort(byField('slot'));
}

export async function getCourse(courseId) {
  const snap = await getDoc(doc(db, 'courses', courseId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createCourse(data) {
  const ref = await addDoc(collection(db, 'courses'), { createdAt: serverTimestamp(), ...data });
  return ref.id;
}

export const updateCourse = (courseId, data) => updateDoc(doc(db, 'courses', courseId), data);

/* -------------------------------------------------------------- lessons */

export async function listLessons(courseId) {
  const snap = await getDocs(collection(db, 'courses', courseId, 'lessons'));
  return withId(snap).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
    || (a.weekNumber ?? 0) - (b.weekNumber ?? 0) || (a.sessionNumber ?? 0) - (b.sessionNumber ?? 0));
}

export async function getLesson(courseId, lessonId) {
  const snap = await getDoc(doc(db, 'courses', courseId, 'lessons', lessonId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createLesson(courseId, data) {
  const ref = await addDoc(collection(db, 'courses', courseId, 'lessons'), data);
  return ref.id;
}

/* ------------------------------------------------------------ materials */

export async function listMaterials(courseId, lessonId) {
  const snap = await getDocs(collection(db, 'courses', courseId, 'lessons', lessonId, 'materials'));
  return withId(snap).sort(byField('order'));
}

export async function createMaterial(courseId, lessonId, data) {
  const ref = await addDoc(collection(db, 'courses', courseId, 'lessons', lessonId, 'materials'), data);
  return ref.id;
}

export async function getMaterial(courseId, lessonId, materialId) {
  const snap = await getDoc(doc(db, 'courses', courseId, 'lessons', lessonId, 'materials', materialId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Materials for many lessons at once -> { [lessonId]: Material[] } */
export async function listMaterialsForLessons(pairs) {
  const entries = await Promise.all(pairs.map(async ({ courseId, lessonId }) => (
    [lessonId, await listMaterials(courseId, lessonId)]
  )));
  return Object.fromEntries(entries);
}

/* ----------------------------------------------------------- milestones */

export async function listMilestones(courseId) {
  const snap = await getDocs(collection(db, 'courses', courseId, 'milestones'));
  return withId(snap).sort(byField('targetWeek'));
}

export async function createMilestone(courseId, data) {
  const ref = await addDoc(collection(db, 'courses', courseId, 'milestones'), data);
  return ref.id;
}

export const updateMilestone = (courseId, milestoneId, data) =>
  updateDoc(doc(db, 'courses', courseId, 'milestones', milestoneId), data);

/* ------------------------------------------------------------- sessions */

export async function listSessions({ courseId = null, status = null, date = null } = {}) {
  const ref = collection(db, 'sessions');
  let q = ref;
  if (courseId) q = query(ref, where('courseId', '==', courseId));
  else if (date) q = query(ref, where('scheduledDate', '==', date));
  else if (status) q = query(ref, where('status', '==', status));
  const rows = withId(await getDocs(q));
  return rows
    .filter((s) => (status ? s.status === status : true))
    .filter((s) => (date ? s.scheduledDate === date : true))
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate))
      || String(a.scheduledTime || '').localeCompare(String(b.scheduledTime || '')));
}

export async function getSession(sessionId) {
  const snap = await getDoc(doc(db, 'sessions', sessionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createSession(data) {
  const ref = await addDoc(collection(db, 'sessions'), { createdAt: serverTimestamp(), ...data });
  return ref.id;
}

export const updateSession = (sessionId, data) => updateDoc(doc(db, 'sessions', sessionId), data);

export const todaysSessions = () => listSessions({ date: todayYMD() });

/* ---------------------------------------------------------- gap reports */

export async function listGapReports({ teacherId = null, sessionId = null } = {}) {
  const ref = collection(db, 'gapReports');
  let q = ref;
  if (teacherId) q = query(ref, where('teacherId', '==', teacherId));
  else if (sessionId) q = query(ref, where('sessionId', '==', sessionId));
  return withId(await getDocs(q)).sort(byTimeDesc('filedAt'));
}

export async function createGapReport(data) {
  const ref = await addDoc(collection(db, 'gapReports'), { filedAt: serverTimestamp(), ...data });
  return ref.id;
}

/* -------------------------------------------------------------- homework */

export const HOMEWORK_TYPES = ['reading', 'video', 'practice'];

export async function listHomework({ courseId = null } = {}) {
  const ref = collection(db, 'homework');
  const rows = withId(await getDocs(courseId ? query(ref, where('courseId', '==', courseId)) : ref));
  return rows.sort(byTimeDesc('createdAt'));
}

export async function createHomework(data) {
  const ref = await addDoc(collection(db, 'homework'), {
    status: 'assigned', completedAt: null, createdAt: serverTimestamp(), ...data,
  });
  return ref.id;
}

export async function setHomeworkStatus(homeworkId, done) {
  await updateDoc(doc(db, 'homework', homeworkId), {
    status: done ? 'done' : 'assigned',
    completedAt: done ? serverTimestamp() : null,
  });
}

export async function deleteHomework(homeworkId) {
  await deleteDoc(doc(db, 'homework', homeworkId));
}

/* -------------------------------------------------------------- quizzes */

export async function listQuizzes({ courseId = null } = {}) {
  const ref = collection(db, 'quizzes');
  const snap = await getDocs(courseId ? query(ref, where('courseId', '==', courseId)) : ref);
  return withId(snap).sort(byTimeDesc('createdAt'));
}

export async function getQuiz(quizId) {
  const snap = await getDoc(doc(db, 'quizzes', quizId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createQuiz(data) {
  const ref = await addDoc(collection(db, 'quizzes'), { createdAt: serverTimestamp(), ...data });
  return ref.id;
}

export async function listQuizAttempts({ quizId = null, userId = null } = {}) {
  const ref = collection(db, 'quizAttempts');
  let q = ref;
  if (quizId) q = query(ref, where('quizId', '==', quizId));
  else if (userId) q = query(ref, where('userId', '==', userId));
  return withId(await getDocs(q)).sort(byTimeDesc('completedAt'));
}

export async function createQuizAttempt(data) {
  const ref = await addDoc(collection(db, 'quizAttempts'), { completedAt: serverTimestamp(), ...data });
  return ref.id;
}

/* -------------------------------------------------- student assessments */

export async function createStudentAssessment(data) {
  const ref = await addDoc(collection(db, 'studentAssessments'), { createdAt: serverTimestamp(), ...data });
  return ref.id;
}

export async function listStudentAssessments({ userId = null, sessionId = null } = {}) {
  const ref = collection(db, 'studentAssessments');
  let q = ref;
  if (userId) q = query(ref, where('userId', '==', userId));
  else if (sessionId) q = query(ref, where('sessionId', '==', sessionId));
  return withId(await getDocs(q)).sort(byTimeDesc('createdAt'));
}

/* =================================================================
   Derived metrics — pure functions over the documents above.
   ================================================================= */

/** Warm-up score for one gap report: correct = 1, hesitant = 0.5. */
export function warmupScore(report) {
  const results = Array.isArray(report?.warmupResults) ? report.warmupResults : [];
  if (!results.length) return null;
  const earned = results.reduce((sum, r) => sum + (r.result === 'correct' ? 1 : r.result === 'hesitant' ? 0.5 : 0), 0);
  return earned / results.length;
}

export function averageWarmup(reports) {
  const scores = (reports || []).map(warmupScore).filter(Number.isFinite);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function milestoneProgress(milestones) {
  const list = milestones || [];
  if (!list.length) return { pct: 0, achieved: 0, total: 0, behind: 0 };
  const achieved = list.filter((m) => m.status === 'achieved').length;
  const inProgress = list.filter((m) => m.status === 'in_progress').length;
  const behind = list.filter((m) => m.status === 'behind').length;
  return {
    pct: ((achieved + inProgress * 0.5) / list.length) * 100,
    achieved,
    total: list.length,
    behind,
  };
}

/**
 * Course health: red when work is actively off-track, yellow when it is
 * drifting, green otherwise.
 *   red    — a milestone marked behind, a critical gap in the last 14 days,
 *            or an average warm-up score below 50%
 *   yellow — an open major gap, or warm-up between 50% and 75%
 */
export function courseHealth({ milestones = [], reports = [] } = {}) {
  const recent = reports.filter((r) => {
    const filed = toDate(r.filedAt);
    return filed ? (Date.now() - filed.getTime()) / 86400000 <= 14 : true;
  });
  const gapsOf = (rows) => rows.flatMap((r) => (Array.isArray(r.identifiedGaps) ? r.identifiedGaps : []));
  const avg = averageWarmup(reports);
  const behind = milestones.some((m) => m.status === 'behind');
  const critical = gapsOf(recent).some((g) => g.severity === 'critical');
  const major = gapsOf(recent).some((g) => g.severity === 'major');

  if (behind || critical || (Number.isFinite(avg) && avg < 0.5)) return 'red';
  if (major || (Number.isFinite(avg) && avg < 0.75)) return 'yellow';
  return 'green';
}

export const HEALTH_LABEL = { green: 'On track', yellow: 'Needs attention', red: 'Off track' };

/**
 * Streak = consecutive class days (most recent first) where every scheduled
 * session was completed. A cancelled session on a day breaks the streak.
 */
export function currentStreak(sessions) {
  const past = (sessions || [])
    .filter((s) => s.scheduledDate && s.scheduledDate <= todayYMD() && s.status !== 'upcoming');
  const byDate = new Map();
  past.forEach((s) => {
    const list = byDate.get(s.scheduledDate) || [];
    list.push(s);
    byDate.set(s.scheduledDate, list);
  });
  const dates = [...byDate.keys()].sort().reverse();
  let streak = 0;
  for (const date of dates) {
    const all = byDate.get(date);
    if (all.length && all.every((s) => s.status === 'completed')) streak += 1;
    else break;
  }
  return streak;
}

/** Compares the newer half of a report series with the older half. */
export function trendOf(reportsNewestFirst) {
  const scores = (reportsNewestFirst || []).map(warmupScore).filter(Number.isFinite);
  if (scores.length < 3) return { label: 'steady', delta: 0, kind: 'gray', series: scores.slice().reverse() };
  const half = Math.floor(scores.length / 2);
  const newer = scores.slice(0, half);
  const older = scores.slice(scores.length - half);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const delta = mean(newer) - mean(older);
  const label = delta > 0.07 ? 'improving' : delta < -0.07 ? 'declining' : 'steady';
  return {
    label,
    delta,
    kind: label === 'improving' ? 'green' : label === 'declining' ? 'red' : 'gray',
    series: scores.slice().reverse(),
  };
}

export function quizAverage(attempts) {
  const scores = (attempts || []).map((a) => a.score).filter(Number.isFinite);
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function gradeAttempt(quiz, answers) {
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  if (!questions.length) return { score: 0, correctCount: 0, total: 0 };
  const correctCount = questions.reduce((sum, q, i) => {
    const picked = answers.find((a) => a.questionIndex === i);
    return sum + (picked && picked.selectedIndex === q.correctIndex ? 1 : 0);
  }, 0);
  return {
    score: Math.round((correctCount / questions.length) * 100),
    correctCount,
    total: questions.length,
  };
}

/* Batched writes, used by the seeder. */
export function newBatch() { return writeBatch(db); }
export { serverTimestamp, doc, collection, fsLimit, collectionGroup };
