/* ============================================================
   Firebase project configuration
   ------------------------------------------------------------
   Wired to the "principal-990be" project. To point the app at a
   different project, replace the values below with the config from
   Firebase console -> Project settings -> Your apps -> Web app.

   Checklist for whichever project this points at:
   1. Authentication -> Sign-in method: enable Email/Password
      (and Google, for the "Sign in with Google" button).
   2. Authentication -> Settings -> Authorized domains: add the
      Netlify domain the app is served from.
   3. Create a Cloud Firestore database.
   4. Deploy the rules in ../firestore.rules

   The SDK version lives in the import map in ../index.html.
   Nothing else in the app needs editing — every course, lesson,
   user and quiz is loaded from Firestore at runtime.
   ============================================================ */

export const firebaseConfig = {
  apiKey: 'AIzaSyC65If2W4dD8xIiYEVBJoX-xZCCKNQpphY',
  authDomain: 'principal-990be.firebaseapp.com',
  projectId: 'principal-990be',
  storageBucket: 'principal-990be.firebasestorage.app',
  messagingSenderId: '241769166266',
  appId: '1:241769166266:web:3b349abb509cace2cad983',
};

/* Default password assigned to accounts created by the in-app seeder /
   "Add Teacher" form. Users should change it after first sign-in. */
export const DEFAULT_NEW_ACCOUNT_PASSWORD = 'Principal123!';

/* Bootstrap allowlist. Someone has to create the first admin profile before any
   admin exists to create it, so these addresses — and only these — may create
   their own users/{uid} document with role "admin", straight from the app.
   Everyone else must be provisioned by an admin.

   This list is mirrored in ../firestore.rules (isBootstrapAdmin) — the rules are
   what actually enforce it, so change both together. Once the admin accounts
   exist you can empty this list and redeploy the rules. */
export const BOOTSTRAP_ADMIN_EMAILS = [
  'bryanf2311@gmail.com',
];

import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/** True once real values have replaced the YOUR_… placeholders above. */
export const isConfigured = !JSON.stringify(firebaseConfig).includes('YOUR_');


export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

/**
 * Creates a throwaway secondary Firebase app. Used when an admin creates
 * accounts for other people: signing up on the primary app would replace the
 * admin's own session, so the sign-up happens on this isolated instance.
 * Call `dispose()` when finished.
 */
export function createSecondaryApp() {
  const secondary = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  return {
    auth: getAuth(secondary),
    dispose: () => deleteApp(secondary).catch(() => {}),
  };
}
