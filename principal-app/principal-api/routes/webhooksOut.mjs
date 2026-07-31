/* Browser-facing routes: the "Create Class" and "Grade & update"
   buttons in the teacher dashboard hit these, which relay to the
   Teaching/Grading agents (see lib/agentRelay.mjs). Behind
   requireTeacherToken, not a shared secret — see lib/auth.mjs. */
import { Router } from 'express';
import { requireTeacherToken } from '../lib/auth.mjs';
import { notifyTeachingAgent, notifyGradingAgent } from '../lib/agentRelay.mjs';

export const webhooksOutRouter = Router();
webhooksOutRouter.use(requireTeacherToken);

webhooksOutRouter.post('/create-class', async (req, res) => {
  const { prompt, teacherSlot } = req.body || {};
  try {
    const result = await notifyTeachingAgent({ prompt, teacherSlot });
    res.status(202).json({ status: 'relayed', agentReply: result.stdout || null });
  } catch (err) {
    console.error('create-class relay failed:', err);
    res.status(502).json({ error: `Could not reach the Teaching agent: ${err.message}` });
  }
});

webhooksOutRouter.post('/grade-request', async (req, res) => {
  const { sessionId, examId, prompt } = req.body || {};
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required.' });
    return;
  }
  try {
    const result = await notifyGradingAgent({ sessionId, examId, prompt });
    res.status(202).json({ status: 'relayed', agentReply: result.stdout || null });
  } catch (err) {
    console.error('grade-request relay failed:', err);
    res.status(502).json({ error: `Could not reach the Grading agent: ${err.message}` });
  }
});
