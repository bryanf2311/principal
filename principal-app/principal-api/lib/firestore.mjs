/* Admin SDK init — same pattern as scripts/seed.mjs. Bypasses
   firestore.rules by design; that's the point of running server-side. */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ credential: applicationDefault() });
export const db = getFirestore();
