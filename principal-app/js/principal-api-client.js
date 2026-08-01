/* Thin client for principal-api's browser-facing webhook-out routes.
   Auth is the signed-in teacher's real Firebase ID token — see
   principal-api/lib/auth.mjs for why that's used instead of a shared
   secret here. */
import { principalApiConfig } from './principal-api-config.js';

async function callWebhook(path, idToken, body) {
  const response = await fetch(`${principalApiConfig.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export const requestCreateClass = (idToken, { prompt, teacherSlot }) => callWebhook(
  '/v1/webhooks/create-class', idToken, { prompt, teacherSlot },
);

export const requestGradeUpdate = (idToken, { sessionId, examId, prompt }) => callWebhook(
  '/v1/webhooks/grade-request', idToken, { sessionId, examId, prompt },
);
