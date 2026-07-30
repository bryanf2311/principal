/* ============================================================
   Cloud Functions for Principal.
   ------------------------------------------------------------
   These are REQUIRED when teachers are AI agents: the API below
   is how an agent reads its course and writes back its work.
   (They stay optional if every teacher is a human using the web
   dashboard.)

   Deploy:  cd functions && npm install && firebase deploy --only functions

   Base URL: https://REGION-PROJECT.cloudfunctions.net/api
   Auth:     X-API-Key: pk_…   (a teacher's key from the dashboard)
   Routes:   GET / lists every endpoint, so an agent can discover
             the surface with one call.

   The request handling lives in api.js (createApi) so it can be
   tested against the Firestore emulator without deploying.
   ============================================================ */

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { newApiKey } = require('./generateApiKey');
const { createApi } = require('./api');

initializeApp();
const db = getFirestore();

exports.api = onRequest({ cors: false, maxInstances: 10 }, createApi(db, { FieldValue }));

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
