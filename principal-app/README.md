# 🎓 Principal — Learning Dashboard

A personal learning platform for one student (Bryan) and up to six teachers.
Static frontend on Netlify, Firebase (Auth + Firestore, optional Functions) as the backend.
Everything — users, courses, lessons, materials, quizzes — lives in Firestore. Nothing is hardcoded:
add a sixth teacher and a course document and the UI picks them up on the next load.

```
principal-app/
  netlify.toml            Netlify config (publish ".", SPA redirect)
  index.html              the whole SPA shell (hash routing)
  firebase.json           Firestore rules/indexes + functions wiring
  firestore.rules         role-based security rules
  firestore.indexes.json  optional indexes (the web app needs none)
  css/style.css
  js/
    firebase-config.js    ← the only file you must edit
    app.js                router, auth listener, sidebar
    api.js                every Firestore read/write + derived metrics
    ui.js                 rendering helpers (escaping, cards, badges, toasts)
    seed-content.js       the demo dataset as plain data
    seed.js               in-browser seeder (Admin → Seed demo data)
    pages/
      login.js  studentDashboard.js  teacherDashboard.js
      adminDashboard.js  quiz.js
  functions/              optional: X-API-Key HTTP API + key rotation
  scripts/seed.mjs        optional: Admin-SDK seeder (creates Auth users)
```

## 1. Set up Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. **Build → Authentication → Get started → Email/Password**: enable it.
   Enable **Google** too if you want the "Sign in with Google" button to work.
3. **Build → Firestore Database → Create database** (production mode is fine — the rules below lock it down).
4. **Project settings → Your apps → Web app**: register one, copy the config object.
5. Paste those values into `js/firebase-config.js`:

```js
export const firebaseConfig = {
  apiKey: 'AIza…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123',
};
```

Until you do this, the app shows a setup screen instead of the login page.

6. Publish the security rules:

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy --only firestore:rules
```

(Or paste `firestore.rules` into **Firestore → Rules** in the console.)

## 2. Create the first admin account

Rules deliberately prevent anyone from self-promoting to admin, so bootstrap one account by hand:

1. **Authentication → Users → Add user**: `principal@example.com` with a password.
2. Copy that user's **UID**.
3. **Firestore → Start collection** `users` → document ID = that UID, with fields:

| field | type | value |
| --- | --- | --- |
| `name` | string | `Principal` |
| `email` | string | `principal@example.com` |
| `role` | string | `admin` |
| `teacherSlot` | null | — |
| `apiKey` | string | (leave empty) |

Sign in as that account and you land on the Admin dashboard.

## 3. Seed the demo data

**Option A — from the app (no tooling):** Admin dashboard → *System Health* → **🌱 Seed demo data**.
It creates Bryan, the four teachers, all four courses with full lesson plans, materials,
milestones, sessions (including classes scheduled *today*), gap reports, two quizzes per course,
a sample attempt and sample self-assessments. New accounts get the password from
`DEFAULT_NEW_ACCOUNT_PASSWORD` in `firebase-config.js` (`Principal123!` by default).
Running it twice is safe — anything that already exists is skipped.

**Option B — Admin SDK script:**

```bash
cd principal-app/scripts
npm install
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   # Project settings → Service accounts
export SEED_PASSWORD='Principal123!'
npm run seed
```

Seeded accounts:

| email | role | slot |
| --- | --- | --- |
| `bryan@example.com` | student | — |
| `principal@example.com` | admin | — |
| `teacher1@example.com` | teacher | 1 |
| `teacher2@example.com` | teacher | 2 |
| `teacher4@example.com` | teacher | 4 |
| `teacher5@example.com` | teacher | 5 |

## 4. Deploy to Netlify

No build step — the folder *is* the site.

```bash
npm install -g netlify-cli
cd principal-app
netlify deploy            # draft URL
netlify deploy --prod     # production
```

Then add your Netlify domain to **Firebase → Authentication → Settings → Authorized domains**,
otherwise sign-in is rejected on the deployed URL.

## 5. Optional: Cloud Functions (X-API-Key API)

```bash
cd principal-app/functions
npm install
firebase deploy --only functions
```

Then set `API_BASE_URL` in `js/firebase-config.js` to the deployed `api` URL so the teacher
dashboard shows ready-to-paste curl commands.

| method | route | purpose |
| --- | --- | --- |
| `GET` | `/course` | the caller's course(s) with lessons, materials, milestones |
| `GET` | `/sessions` | sessions for the caller's course(s) |
| `GET` | `/gap-reports` | the 50 most recent reports the caller filed |
| `POST` | `/gap-reports` | file a gap report |

Every request needs `X-API-Key: pk_…` — a teacher's key from their dashboard.

```bash
curl -H "X-API-Key: pk_…" https://REGION-PROJECT.cloudfunctions.net/api/course

curl -X POST https://REGION-PROJECT.cloudfunctions.net/api/gap-reports \
  -H "X-API-Key: pk_…" -H "Content-Type: application/json" \
  -d '{"sessionId":"…","applicationTask":"Solve 3x+7=22",
       "applicationResult":"partially_correct",
       "warmupResults":[{"question":"2x=10","result":"correct"}],
       "identifiedGaps":[{"description":"sign errors","severity":"major"}],
       "remediationPlan":"Sign-change drills"}'
```

A `rotateApiKey` callable is included too; the web app rotates keys directly through Firestore,
so Functions are genuinely optional.

## Routes

| hash | who | what |
| --- | --- | --- |
| `#/login` | everyone | email/password + Google, password reset |
| `#/dashboard` | student, admin | today's classes, stats, upcoming timeline, progress, quizzes, activity, reflection |
| `#/teacher` | teacher, admin | today's class, lesson plan, progress, gap report form, quiz authoring/results, history, API key |
| `#/admin` | admin | courses, teachers, all gap reports (searchable), quiz results, system health, add course/teacher, seeding |
| `#/quiz/:quizId` | everyone signed in | timed quiz; teachers and admins see it in preview mode (attempts are not saved) |

## How the derived numbers work

* **Warm-up score** — per gap report: `correct = 1`, `hesitant = 0.5`, `incorrect = 0`, averaged.
* **Milestone progress** — `achieved = 1`, `in_progress = 0.5`, over the total.
* **Course health** — 🔴 a milestone marked *behind*, a *critical* gap in the last 14 days, or
  average warm-up under 50%; 🟡 an open *major* gap or warm-up 50–75%; 🟢 otherwise.
* **Streak** — consecutive class days (most recent first) where every scheduled session was
  completed; a cancelled session breaks it.
* **Trend** — mean warm-up score of the newer half of the reports versus the older half
  (±0.07 to count as improving/declining).

## Notes and limits

* Queries use one `where` clause and sort in memory, so **no composite indexes are needed** to run
  the app; `firestore.indexes.json` only serves the Functions API, which sorts server-side.
* This is built for one student, so students may read all courses, sessions, gap reports and
  quizzes. Add a `studentId` filter to the rules (courses already carry the field after seeding)
  if you ever onboard a second student.
* Admin "Add Teacher" signs the new account up on a secondary Firebase app instance, so your own
  session is never replaced. Change the initial password after first sign-in.
* All Firestore text is HTML-escaped before rendering (`esc()` in `js/ui.js`).
