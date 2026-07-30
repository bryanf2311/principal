# 🎓 Principal — Learning Dashboard

A personal learning platform for one **human student** (Bryan) and up to six **AI teachers** —
OpenClaw agents that read their course and write back their work over an API-key HTTP API.
Human teachers still work; they just sign in to the dashboard instead.
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
    firebase-config.js    project config (already filled in)
    app.js                router, auth listener, sidebar
    api.js                every Firestore read/write + derived metrics
    ui.js                 rendering helpers (escaping, cards, badges, toasts)
    seed-content.js       the demo dataset as plain data
    seed.js               in-browser seeder (Admin → Seed demo data)
    pages/
      login.js  studentDashboard.js  teacherDashboard.js
      adminDashboard.js  quiz.js
  functions/              the X-API-Key HTTP API the agents drive + key rotation
    api.js                every agent route (createApi, testable without deploying)
    lib.js                payload validation
  agent-skill/            OpenClaw skill an agent installs to use the API
    principal-teacher/SKILL.md
  scripts/seed.mjs        optional: Admin-SDK seeder (creates Auth users)
```

## 1. Firebase project

The app is already wired to the **`principal-990be`** project — its config lives in
`js/firebase-config.js`. Three things still need to be true in the Firebase console:

1. **Build → Authentication → Sign-in method**: enable **Email/Password**
   (and **Google**, if you want the "Sign in with Google" button to work).
2. **Build → Firestore Database**: create the database if it does not exist yet.
3. **Authentication → Settings → Authorized domains**: add the Netlify domain you deploy to,
   otherwise sign-in is rejected on the live URL. (`localhost` is authorized by default.)

Then publish the security rules:

```bash
npm install -g firebase-tools
firebase login
firebase use principal-990be
firebase deploy --only firestore:rules
```

(Or paste `firestore.rules` into **Firestore → Rules** in the console.)

To point the app at a different project, replace the values in `firebaseConfig` — nothing
else in the code refers to the project.

### Firebase SDK version

Every module imports bare specifiers (`firebase/app`, `firebase/auth`, `firebase/firestore`)
that resolve through the **import map in `index.html`**, so the SDK version is set in exactly
one place. It is currently pinned to **12.16.0**; to upgrade, change the three URLs in that
import map (and the `modulepreload` next to it) and reload. Import maps need a current
browser — Chrome/Edge 89+, Safari 16.4+, Firefox 108+.

## 2. Create the first admin account

Nobody can hand themselves `role: "admin"` — the rules only let an existing admin create
profiles. That leaves the chicken-and-egg problem of the *first* admin, which the
**bootstrap allowlist** solves:

* `BOOTSTRAP_ADMIN_EMAILS` in `js/firebase-config.js` decides what the app offers.
* `isBootstrapAdmin()` in `firestore.rules` is what actually enforces it.

Both currently list **`bryanf2311@gmail.com`**. So:

1. Deploy the rules (`firebase deploy --only firestore:rules`) — the app cannot write the
   profile until the allowlist is live in the rules.
2. Sign in as that address (Google, or Email/Password with a user you added in
   **Authentication → Users**).
3. You land on **Almost there** with a **Create my admin profile** button. Enter your name,
   press it, and you are in.

An address that is *not* on the list gets no button — it sees the field-by-field values to
enter in the Firestore console instead (the console has no JSON paste), which is the manual
escape hatch if you would rather not touch the allowlist.

**Once your admin account exists, empty `BOOTSTRAP_ADMIN_EMAILS`, remove the address from
`isBootstrapAdmin()`, and redeploy the rules.** After that, every account is provisioned
by an admin through **Admin → Add Teacher**, and self-provisioning is closed entirely.

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

## 5. Deploy the Cloud Functions

Required when teachers are AI agents — the HTTP API is how they connect. See
**[Teachers are AI agents](#teachers-are-ai-agents)** below for the full setup, endpoint table and
key handout. In short:

```bash
cd principal-app/functions
npm install
firebase deploy --only functions
```

Then set `API_BASE_URL` in `js/firebase-config.js` to the deployed `api` URL.

A `rotateApiKey` callable ships alongside it; the dashboard rotates keys directly through Firestore,
so the callable is only needed if you want rotation from outside the app.

## Teachers are AI agents

The student is a person who signs in. Each teacher is an OpenClaw agent that never opens a browser,
so the dashboard's job is to **connect** them: provision the teacher, hand over a key, and expose
the whole teacher surface over HTTP.

### 1. Deploy the API

The Cloud Functions are required in this setup — they are the agents' only way in.

```bash
cd principal-app/functions
npm install
firebase deploy --only functions
```

Put the deployed URL in `API_BASE_URL` in `js/firebase-config.js` so the dashboard shows the agents'
exact env block instead of a placeholder.

### 2. Create each agent teacher

**Admin → Add Teacher → Teacher type: 🤖 AI agent.** That writes a `users` profile with
`role: "teacher"`, `kind: "agent"` and a fresh key, and **no Firebase Auth account** — an agent has
no password to manage. The dashboard then shows the key with a ready-to-paste env block:

```
PRINCIPAL_API_URL=https://REGION-PROJECT.cloudfunctions.net/api
PRINCIPAL_API_KEY=pk_…
```

Copy it again later, or rotate it, from **All Teachers** (📋 copies the key, 🔌 reopens the env
block). Assign the agent a course with **Add Course**.

Students and admins are always human accounts with a password — only teachers can be agents, and
**a student never gets an API key**: the API refuses any key whose role is not teacher or admin.

### 3. Point the agent at it

Install `agent-skill/principal-teacher/` into the agent's workspace (or publish it to ClawHub) and
set the two env vars. The skill documents the teaching loop, the fixed vocabularies, and the rules
of engagement. The agent can also discover the surface itself:

```bash
curl -H "X-API-Key: pk_…" https://REGION-PROJECT.cloudfunctions.net/api/
```

`GET /` returns the teacher's identity, their course, today's date and every endpoint — which suits
OpenClaw's heartbeat: wake, ask what is on today, teach, file the report.

### Endpoints

Every request needs `X-API-Key: pk_…`. Everything is scoped to the key's own course; anything
outside it is `403`.

| method | route | purpose |
| --- | --- | --- |
| `GET` | `/` | identity, course, today, endpoint index |
| `GET` | `/course` | course(s) with lessons, materials and milestones nested |
| `GET` | `/sessions` | sessions; `?date=YYYY-MM-DD\|today`, `?status=` |
| `GET` | `/sessions/today` | today's sessions with the lesson and materials inlined |
| `GET` | `/sessions/{id}` | one session |
| `PATCH` | `/sessions/{id}` | `status`, `teacherNotes`, `scheduledDate`, `scheduledTime` |
| `POST` | `/lessons` | add a lesson, optionally with a `materials` array |
| `POST` | `/materials` | attach a material to a lesson |
| `GET` | `/milestones` | course milestones |
| `PATCH` | `/milestones/{id}` | `status` (stamps `achievedDate`), `notes` |
| `GET` | `/gap-reports` | reports this key filed, newest first |
| `POST` | `/gap-reports` | file a report; `markSessionCompleted` closes the session too |
| `GET` | `/quizzes` | quizzes on the course |
| `POST` | `/quizzes` | create an auto-graded multiple-choice quiz |
| `GET` | `/quiz-attempts` | the student's graded attempts; `?quizId=` |
| `GET` | `/assessments` | the student's self-assessments for this course |

A teacher with exactly one course may omit `courseId` everywhere — the usual case for one agent per
slot. With more than one, requests that need it return `400` naming the course ids.

Writes made this way are tagged `source: "api"`, and the admin's gap report table shows a **Via**
column — `agent` or `dashboard` — so you can always tell who filed what.

### What the dashboards are for now

Nothing about the human UI is wasted: it is the observation layer. Bryan sees today's classes,
materials, progress and quizzes; the admin sees course health, every gap report the agents filed,
quiz results and the key management above. The teacher dashboard still works if you ever add a
human teacher, and admins can open it read-only to see what an agent has been doing.

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
* Nobody can create or promote their own profile: `users` `create` is admin-only apart from the
  bootstrap allowlist, and self-`update` cannot change `role` or `teacherSlot`. This matters most
  when Google sign-in is enabled, since anyone with a Google account can reach the sign-in step —
  without a profile they see "Almost there" and can do nothing else.
* All Firestore text is HTML-escaped before rendering (`esc()` in `js/ui.js`).
