# 🎓 Principal — Learning Dashboard

A personal learning platform for one **human student** (Bryan) and up to six **AI teachers** —
OpenClaw agents that read their course and write back their work straight to Firestore.
Human teachers still work; they just sign in to the dashboard instead.
Static frontend on Netlify, Firebase Auth + Firestore as the backend. **Everything runs on the free
Spark plan** — there are no Cloud Functions and nothing that requires billing.
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
      adminDashboard.js  quiz.js  lecture.js
  agent-skill/            what an OpenClaw teacher agent needs
    principal-teacher/principal.mjs  the agent's tool (zero deps, Node 18+)
    principal-teacher/SKILL.md       installable skill (full reference)
    principal-teacher/PROMPT.md      short prompt to paste into an agent
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

Live at **https://tourmaline-bavarois-a0a452.netlify.app** — no build step, the folder *is* the site.

```bash
npm install -g netlify-cli
cd principal-app
netlify deploy            # draft URL
netlify deploy --prod     # production
```

Then add the domain to **Firebase → Authentication → Settings → Authorized domains**:

```
tourmaline-bavarois-a0a452.netlify.app
```

Without it, Firebase rejects sign-in on the live site with `auth/unauthorized-domain` (the app
surfaces that as a readable message on the login form).

There is only one URL in this setup: the Netlify site above, for people. The agents do not use a URL
you have to configure — they talk to Firebase's own endpoints using the four environment variables
below.

## 5. Teachers are AI agents

The student is a person who signs in to the dashboard. Each teacher is an OpenClaw agent that never
opens a browser — it **signs in as its own Firebase Auth user and writes straight to Firestore**, with
the security rules confining it to its own course. Nothing sits in between, so there is **nothing to
deploy and no paid plan**.

There are two ways to get an agent teacher going. Either works; the agent's own instructions
(`PROMPT.md`) default to provisioning itself, which is the point of talking to it in natural language
instead of clicking through the dashboard yourself.

### Option A — the agent provisions itself

**Admin → Agent Setup Key** — press **✨ Generate**, then hand the agent that key plus a project id and
web API key (see the block below). Tell it what course to set up in plain language; it runs
`node principal.mjs setup '{"name": "..."}'` to create its own login and `role: "teacher"` profile
(never admin, never student, never another teacher's data — the key only proves the admin issued it),
then `course-create`, `lesson`, `session-create`, `milestone-create` and `homework-create` to build
out the class itself.
Rotate the key any time from the same panel; that invalidates it for anyone who hasn't used it yet
without touching agents that already provisioned themselves.

### Option B — the admin creates the account first

**Admin → Add Teacher or Student → Role: Teacher → Teacher type: 🤖 AI agent.** That creates the Auth
account the agent signs in as (with a generated password) plus its profile, then shows the four
variables to hand over:

```
PRINCIPAL_PROJECT_ID=principal-990be
PRINCIPAL_WEB_API_KEY=AIzaSyC65If2W4dD8xIiYEVBJoX-xZCCKNQpphY
PRINCIPAL_AGENT_EMAIL=algebra-agent@agents.local
PRINCIPAL_AGENT_PASSWORD=…
```

**Copy the password then** — Firebase stores only a hash. Reopen the other three any time with
**🔌 Connect** in All Teachers; replace a lost password in **Firebase console → Authentication →
Users → Reset password**. **🗑️** in the same row removes the teacher's profile (revokes access
immediately) without touching the underlying Auth login, which you clean up from the console if needed.

**If the agent already signed itself up outside of `setup`**, it has a login with no profile, which is
why every write comes back `PERMISSION_DENIED`. Open **"The account already exists"** in the same form,
paste the UID the agent reports, and it attaches a teacher profile to that account — no new login, and
the agent keeps the password it already has.

Either way, make sure the agent owns a course: **All Courses** has a teacher dropdown on every row, so
you can reassign a course that was created against the wrong account (agents that used `course-create`
already own theirs). The same row has a **🗑️ delete** button — it removes the course *and* everything
filed under it (lessons, materials, milestones, sessions, quizzes, quiz attempts, gap reports, homework,
self-assessments), asks for confirmation first, and cannot be undone.

### Point the agent at the tool

Install `agent-skill/principal-teacher/` into the agent's workspace (both `SKILL.md` and
`principal.mjs`), or paste the condensed prompt from `PROMPT.md` into its instructions. Then:

```bash
node principal.mjs whoami     # confirms the connection and prints the course
node principal.mjs help       # every command
```

`principal.mjs` has **no dependencies** (Node 18+). It signs in through the Firebase Auth REST API,
caches the ID token in the temp directory, refreshes it automatically, and speaks the Firestore REST
API so the agent never handles typed Firestore JSON.

### Commands

| command | what it does |
| --- | --- |
| `setup <json>` | one-time: provision this account as a new teacher (needs `PRINCIPAL_SETUP_KEY`) |
| `whoami` | account, role, course(s), today's date |
| `course [--course=]` | course with lessons, materials and milestones |
| `today` | today's sessions, lesson and materials inlined |
| `sessions [--date=YMD\|today] [--status=]` | filtered sessions |
| `complete <id> [--notes=]` / `cancel <id>` | close a session |
| `gap-report <json\|@file\|->` | file a report; `markSessionCompleted` closes the session |
| `reports [--limit=N]` | reports this agent filed |
| `milestones` / `milestone <id> <status> [--notes=]` | read and update milestones |
| `course-create <json>` | create a course naming yourself as its teacher |
| `session-create <json>` | schedule a session against one of your lessons |
| `milestone-create <json>` | add a milestone to one of your courses |
| `homework-create <json>` | assign reading, a video, or practice — shows up in the student's Homework tab |
| `lesson <json>` / `material <lessonId> <json>` | build curriculum, including `type: "slides"` lectures |
| `quiz <json>` | create an auto-graded multiple-choice quiz |
| `attempts [--quizId=]` | the student's graded quiz attempts |
| `assessments` | the student's self-assessments |

Every command prints JSON, or `{"error":"…"}` with a non-zero exit code. Writes are tagged
`source: "agent"`, and the admin's gap report table has a **Via** column so you can tell agent-filed
reports from dashboard-filed ones.

### What enforces the boundaries

The security rules, not the tool. An agent's account can read the course content it teaches, write its
own course's lessons, materials, milestones and sessions, file gap reports under its own teacher id,
and create quizzes for its own course. A signed-in account holding the *current* admin-issued setup key
may create exactly one thing for itself: a `users/{uid}` profile with `role: "teacher"` — never
`admin`, never `student`, and it can never touch another uid. Anything else — another teacher's course,
promoting itself, writing the student's quiz answers — is refused by Firestore. Covered by 109 rules
assertions and 56 end-to-end CLI assertions against the emulator.

Note that anyone can *create* a Firebase Auth login (that is how email/password sign-up works), but a
login with no `users/{uid}` profile can do nothing at all: the setup key is what turns that login into
a teacher, and without a current key the `setup` command fails the same way self-signup always has.

### What the dashboards are for

The human UI is the observation layer. Bryan sees today's classes, materials, progress and quizzes; the
admin sees course health, every gap report the agents filed, quiz results and the credential management
above. The teacher dashboard still works for a human teacher, and admins can open it to see what an
agent has been doing.

## Navigation — a real tab per sidebar item

Each dashboard's sidebar is grouped (Classes / Coursework / Progress, and so on — Canva-style labeled
clusters) and every item is a genuine tab: only one section is visible in the content area at a time,
picked up from `js/app.js`'s `NAV` config, not a long page you scroll through with anchor links. A tab
only appears once its content actually applies — e.g. **Reflect** stays out of the student's sidebar
until there is a completed session to reflect on, and reappears the moment one exists.

Because several dashboards re-render themselves in place after a save (`reload()` inside their own
`wire()` function, not a page navigation), `app.js` watches the content area with a `MutationObserver`
and re-hides every other tab whenever that happens, so the tab you were on stays the one you see —
mutating data never resets you back to a wall of every section at once. If you add a new section to a
dashboard, give it an `id` via `section(..., { id })` and add a matching entry (`{ icon, label, href,
tab }`) to that role's group in `NAV`; leaving a section out of `NAV` just means it is never picked up
by the tab system and stays permanently visible, which is a real state to avoid.

## Lectures — an actual slide deck, not just links

Videos and readings point Bryan somewhere else; a lecture is real content he clicks through in the
dashboard itself, one slide at a time — a title, a few bullet points, optional speaker notes he can
expand. It is a `materials` entry like video/reading/quiz, with `type: "slides"` and a `slides` array.

**A human teacher** builds one from the teacher dashboard's **Lectures** section: title, pick the
lesson, add slides (bullet points are one per line in a textarea — no separate add-bullet UI to fight
with).

**An agent** does the same over `principal.mjs`:

```bash
node principal.mjs material LESSON_ID '{
  "type": "slides",
  "title": "Systems of Equations: Elimination",
  "slides": [
    {"title": "Why elimination?", "bullets": ["Cancels a variable by adding or subtracting the equations"]},
    {"title": "Step 1", "bullets": ["Match a coefficient, then add"], "notes": "Show the sign-flip if he asks why."}
  ]
}'
```

Either way, it shows up right where the other materials do — **Today's Classes** for the student,
**Today's Class** and the lesson plan for the teacher — with a 📽️ icon and a slide count instead of
an outbound link. Opening it goes to `#/lecture/:courseId/:lessonId/:materialId`: previous/next,
click-any-dot navigation, arrow-key support, a progress bar, and a **Finish** button on the last slide.
Nothing about viewing it is graded or recorded — it is instructional content, not an assessment.

## My Classes — a tab per course, past dates included

The student dashboard's **My Classes** section is a tab strip, one tab per course. Each tab lists
every session for that class, newest first — not just today's or what's upcoming — so a past date is
always one click away. Opening a date lazily loads its lesson, materials, teacher notes, and (for a
completed session) the gap report filed for it.

## Homework — reading, videos, and practice, checked off by hand

Homework is separate from a lecture or gap report: it is work assigned for outside class time, and it
lives in its own top-level `homework` collection so it does not need a session to exist. Three types —
`reading` (book chapters), `video` (a lecture or clip to watch), `practice` (a skill to drill: chord
transitions, scales, a vocal warm-up, anything hands-on).

**A human teacher** assigns it from the teacher dashboard's **Homework** section: type, title, details,
an optional link, optionally tied to a lesson.

**An agent** does the same over `principal.mjs`:

```bash
node principal.mjs homework-create '{
  "type": "practice", "title": "Practice G-C-D chord transitions",
  "details": "15 minutes daily, metronome at 60 bpm."
}'
```

The student's **Homework** tab lists everything pending, grouped from what is already done (collapsed
under a "Completed" disclosure), with a **Mark done** / **Mark not done** toggle the student controls
themselves — the security rules let a student flip only `status`/`completedAt` on a homework doc,
nothing else about the assignment. Only the owning teacher (or an admin) can create, edit or delete
homework.

## Taking classes as the admin

An admin is also a student here: **My Classes** in the sidebar opens the student dashboard, and quizzes
taken from an admin account are graded and recorded exactly like a student's (teachers still get a
read-only preview). Self-assessments work the same way. So one account can run the system and take the
course.

## Routes

| hash | who | what |
| --- | --- | --- |
| `#/login` | everyone | email/password + Google, password reset |
| `#/dashboard` | student, admin | today's classes, a tabbed My Classes view (every past/upcoming date per course), homework, stats, upcoming timeline, progress, quizzes, activity, reflection |
| `#/teacher` | teacher, admin | today's class, lesson plan, progress, gap report form, quiz/lecture authoring, homework assignment, results, history, agent access |
| `#/admin` | admin | courses, teachers, all gap reports (searchable), quiz results, system health, add course/teacher, seeding |
| `#/quiz/:quizId` | everyone signed in | timed quiz; teachers and admins see it in preview mode (attempts are not saved) |
| `#/lecture/:courseId/:lessonId/:materialId` | everyone signed in | click-through slide deck for a `slides`-type material |

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
* Admin "Add Teacher or Student" signs the new account up on a secondary Firebase app instance, so
  your own session is never replaced. Change the initial password after first sign-in.
* No Cloud Functions, no Blaze plan, no server: the dashboard and the agents both talk to Firestore
  directly, and the rules are the only thing standing between a role and someone else's data. That
  makes `firestore.rules` the most important file in the repo — deploy it before anything else.
* Nobody can create or promote their own profile: `users` `create` is admin-only apart from the
  bootstrap allowlist and the setup-key path (which only ever grants `role: "teacher"`), and
  self-`update` cannot change `role` or `teacherSlot`. This matters most when Google sign-in is
  enabled, since anyone with a Google account can reach the sign-in step — without a profile, and
  without the setup key, they see "Almost there" and can do nothing else.
* The setup key (`config/setupKey`, managed from **Admin → Agent Setup Key**) is a shared secret, not
  a per-agent invite — anyone who has it can provision one teacher account. Treat it like a password:
  generate it fresh, hand it only to agents you are actively provisioning, and rotate it after.
* All Firestore text is HTML-escaped before rendering (`esc()` in `js/ui.js`).
