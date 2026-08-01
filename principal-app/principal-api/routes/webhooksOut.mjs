/* Browser-facing routes: the "Create Class" button (student dashboard —
   Bryan is the student in this single-family app, so he's the one
   asking for new content, not a human teacher) and the "Grade & update"
   button (teacher dashboard) hit these, which relay to the
   Teaching/Grading agents (see lib/agentRelay.mjs). Real Firebase ID
   tokens, not a shared secret — see lib/auth.mjs. Each route picks its
   own allowed roles rather than one router-wide check. */
import { Router } from 'express';
import { requireTeacherToken, requireAnySignedInToken } from '../lib/auth.mjs';
import { notifyTeachingAgent, notifyGradingAgent } from '../lib/agentRelay.mjs';

export const webhooksOutRouter = Router();

webhooksOutRouter.post('/create-class', requireAnySignedInToken, async (req, res) => {
  const { prompt, teacherSlot } = req.body || {};
  try {
    const result = await notifyTeachingAgent({ prompt, teacherSlot });
    res.status(202).json({ status: 'relayed', agentReply: result.stdout || null });
  } catch (err) {
    console.error('create-class relay failed:', err);
    res.status(502).json({ error: `Could not reach the Teaching agent: ${err.message}` });
  }
});

webhooksOutRouter.post('/grade-request', requireTeacherToken, async (req, res) => {
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
