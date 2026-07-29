/* ============================================================
   Firebase project configuration
   ------------------------------------------------------------
   1. Create a Firebase project: https://console.firebase.google.com
   2. Add a Web app, then copy its config values below.
   3. Enable Authentication -> Sign-in method -> Email/Password
      (and Google, if you want the "Sign in with Google" button).
   4. Create a Cloud Firestore database.
   5. Deploy the rules in ../firestore.rules

   Nothing else in the app needs editing — every course, lesson,
   user and quiz is loaded from Firestore at runtime.
   ============================================================ */

export const FIREBASE_SDK = '10.12.2';

export const firebaseConfig = {
  apiKey: 'YOUR_FIREBASE_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

/* Optional: base URL of the deployed Cloud Functions API, used only by the
   "API Key" panel to show teachers their exact curl commands. Example:
   https://us-central1-your-project.cloudfunctions.net/api  */
export const API_BASE_URL = '';

/* Default password assigned to accounts created by the in-app seeder /
   "Add Teacher" form. Users should change it after first sign-in. */
export const DEFAULT_NEW_ACCOUNT_PASSWORD = 'Principal123!';

import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
