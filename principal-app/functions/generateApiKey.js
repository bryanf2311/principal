/* ============================================================
   generateApiKey.js — key generation + X-API-Key resolution.
   ============================================================ */

const crypto = require('crypto');

/** 40 hex characters, prefixed so keys are recognisable in logs. */
function newApiKey() {
  return `pk_${crypto.randomBytes(20).toString('hex')}`;
}

/**
 * Resolves an X-API-Key header to the teacher that owns it.
 * @returns {Promise<{ uid: string, data: object } | null>}
 */
async function resolveApiKey(db, key) {
  if (!key || typeof key !== 'string' || key.length < 12) return null;
  const snap = await db.collection('users')
    .where('apiKey', '==', key)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  if (data.role !== 'teacher' && data.role !== 'admin') return null;
  return { uid: doc.id, data };
}

module.exports = { newApiKey, resolveApiKey };
