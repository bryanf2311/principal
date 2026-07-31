/* Two different trust boundaries, two different middlewares:
   - requireAgentKey: server-to-server (Teaching/Grading agent -> this
     server). A shared secret, same pattern as PRINCIPAL_SETUP_KEY
     elsewhere in this app, checked with a constant-time compare.
   - requireTeacherToken: browser-to-server (the "Create Class" /
     "Grade & update" buttons). A shared secret here would just repeat
     the exact "secret embedded in client-shipped JS" mistake the
     earlier chat feature was abandoned over — this app already has
     Firebase Auth wired up everywhere, so reuse it: verify the
     signed-in teacher's real ID token instead. */
import crypto from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { db } from './firestore.mjs';

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function requireAgentKey(req, res, next) {
  const expected = process.env.PRINCIPAL_INGEST_KEY;
  if (!expected) {
    res.status(500).json({ error: 'PRINCIPAL_INGEST_KEY is not configured on this server.' });
    return;
  }
  const provided = req.header('X-Principal-Ingest-Key');
  if (!provided || !timingSafeEqualStrings(provided, expected)) {
    res.status(401).json({ error: 'Missing or invalid X-Principal-Ingest-Key.' });
    return;
  }
  next();
}

export async function requireTeacherToken(req, res, next) {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing Authorization: Bearer <Firebase ID token>.' });
    return;
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const profileSnap = await db.doc(`users/${decoded.uid}`).get();
    const role = profileSnap.exists ? profileSnap.data().role : null;
    if (role !== 'teacher' && role !== 'admin') {
      res.status(403).json({ error: 'This action requires a teacher or admin account.' });
      return;
    }
    req.principal = { uid: decoded.uid, role };
    next();
  } catch (err) {
    res.status(401).json({ error: `Invalid or expired token: ${err.message}` });
  }
}
