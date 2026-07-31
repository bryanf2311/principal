/* The one seam for "tell an agent to go do something." Swappable
   without touching routes/webhooksOut.mjs: if the top-level
   `openclaw-native agent --deliver` CLI path ever proves insufficient,
   replace deliverToAgent()'s body with a Gateway RPC call instead —
   scripts/openclaw-pair-device.mjs has the working device-signing
   groundwork for that, and a same-machine relay is a far simpler trust
   context than the browser attempt it was originally built for. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || 'openclaw-native';
const OPENCLAW_HOME_OVERRIDE = process.env.OPENCLAW_HOME_OVERRIDE || '';

export async function deliverToAgent(agentId, message) {
  if (!agentId) throw new Error('No agent id configured for this relay target.');
  const env = OPENCLAW_HOME_OVERRIDE ? { ...process.env, OPENCLAW_HOME: OPENCLAW_HOME_OVERRIDE } : process.env;
  const { stdout, stderr } = await execFileAsync(
    OPENCLAW_BIN,
    ['agent', '--to', agentId, '--message', message, '--deliver'],
    { env },
  );
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

function formatCreateClassPrompt({ prompt, teacherSlot }) {
  return [
    'A teacher just asked the Principal dashboard to create a new class.',
    teacherSlot ? `Teacher slot: ${teacherSlot}.` : null,
    prompt ? `Their request: ${prompt}` : 'No extra details were given — use your judgement.',
    'When ready, push the class via POST /v1/agent/teaching/push-class on the Principal API.',
  ].filter(Boolean).join('\n');
}

function formatGradeRequestPrompt({ sessionId, examId, prompt }) {
  return [
    'A teacher just asked the Principal dashboard to grade/update an exam.',
    `sessionId: ${sessionId}`,
    examId ? `examId: ${examId}` : null,
    prompt ? `Their request: ${prompt}` : null,
    'When ready, push the grade via POST /v1/agent/grading/push-grades on the Principal API.',
  ].filter(Boolean).join('\n');
}

export const notifyTeachingAgent = (payload) => deliverToAgent(process.env.TEACHING_AGENT_ID, formatCreateClassPrompt(payload));
export const notifyGradingAgent = (payload) => deliverToAgent(process.env.GRADING_AGENT_ID, formatGradeRequestPrompt(payload));
