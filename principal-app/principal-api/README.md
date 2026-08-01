# principal-api

The backend `principal-app` never had: a small server, meant to run on the same VPS as
OpenClaw, that gives the Teaching and Grading agents a way to push content into Firestore,
and gives the dashboard a way to ask those agents to go do something.

Not Firebase Cloud Functions — that needs the paid Blaze plan, already ruled out earlier in
this project. This is a plain Node/Express process you run yourself.

## Two trust boundaries, two auth schemes

- **`/v1/agent/*`** (agents → this server): a shared secret (`X-Principal-Ingest-Key`), same
  pattern as `PRINCIPAL_SETUP_KEY` elsewhere in this app. Not behind CORS at all — a browser
  should never be able to reach these regardless of whether it has the key.
- **`/v1/webhooks/*`** (browser → this server, the dashboard's "Create Class"/"Grade & update"
  buttons): the signed-in user's real Firebase ID token, verified server-side. A shared secret
  here would mean embedding it in client-shipped JS — the exact mistake the earlier live-chat
  feature was abandoned over. "Create Class" allows student/teacher/admin (Bryan, the student,
  is the one asking for new content in this single-family app); "Grade & update" stays
  teacher/admin only.

## Setup

```bash
cd principal-api
npm install
cp .env.example .env   # fill in every value, see comments in the file
node --env-file=.env server.mjs
```

Run it under whatever process manager you already use for OpenClaw itself (`systemd`, `pm2`)
so it survives a reboot. A minimal systemd unit:

```ini
[Unit]
Description=principal-api
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/principal-api
EnvironmentFile=/home/ubuntu/principal-api/.env
ExecStart=/usr/bin/node server.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## HTTPS is required, same as the abandoned chat attempt

The dashboard is served over `https://`. Browsers refuse to call a plain `http://` endpoint
from an `https://` page (mixed content) — this blocks `/v1/webhooks/*` specifically (the
agent-ingest routes are server-to-server and don't hit this). Put a TLS-terminating reverse
proxy in front of this process (Caddy, nginx, a Cloudflare Tunnel — whatever you already used
for the OpenClaw Gateway) and point the dashboard's config at that public URL, not a bare
`http://host:8787`.

## Testing without the frontend

```bash
curl -X POST https://your-api-host/v1/agent/teaching/push-class \
  -H "X-Principal-Ingest-Key: $PRINCIPAL_INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "course": { "title": "Algebra II", "teacherId": "TEACHER_UID", "slot": 1 },
    "lessons": [{
      "ref": "week1-lesson1",
      "topic": "Solving linear equations",
      "objective": "Isolate x on one side",
      "materials": [{ "type": "slides", "slides": [{ "title": "Intro", "bullets": ["Balance both sides"] }] }]
    }],
    "sessions": [{ "lessonRef": "week1-lesson1", "scheduledDate": "2026-08-03", "scheduledTime": "16:00" }],
    "homework": [{ "type": "practice", "title": "Worksheet 1" }]
  }'

curl -X POST https://your-api-host/v1/agent/grading/push-grades \
  -H "X-Principal-Ingest-Key: $PRINCIPAL_INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "examId": "EXAM_ID", "studentId": "STUDENT_UID", "score": 8, "maxScore": 10 }'

curl https://your-api-host/v1/agent/grading/pending \
  -H "X-Principal-Ingest-Key: $PRINCIPAL_INGEST_KEY"
```

`GET /v1/agent/grading/pending` is how the Grading agent finds work: it returns every
`examSubmissions` doc that has no matching `examAttempts` doc yet (same `examId`+`studentId`),
with each exam's `questions` already joined in — one call gets everything needed to grade,
no second lookup per submission. Response shape:
`{ pending: [{ submissionId, examId, examTitle, questions, courseId, sessionId, studentId,
answers, submittedAt }] }`.

`push-class` accepts either `course` (create a new one) or `courseId` (append lessons/
sessions/homework to an existing course) — never both. Lessons can be referenced by sessions
before they have a real Firestore id: give a lesson a `ref` string and point a session's
`lessonRef` at it instead of a real `lessonId`.

Not transactional — a failure partway through leaves earlier lessons/sessions already written.
Re-run with `courseId` set to the partially-created course to finish it; there's no automatic
rollback (same tradeoff `agent-skill/principal-teacher/principal.mjs`'s own sequential writes
already make).

## Agent relay

`lib/agentRelay.mjs` is the one place that knows how to reach an agent — everything else calls
`notifyTeachingAgent()`/`notifyGradingAgent()` and doesn't care how the message actually gets
there. The first implementation shells out to `openclaw-native agent --to <id> --message ...
--deliver`, reusing the PATH-independent binary resolution and `OPENCLAW_HOME` override already
proven in `../scripts/openclaw-pair-device.mjs`. If that CLI path ever proves insufficient,
that same script has the working Ed25519 device-signing groundwork for a Gateway RPC relay
instead — a same-machine relay is a far simpler trust context than the browser attempt it was
originally built for.
