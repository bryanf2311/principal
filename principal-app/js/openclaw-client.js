/* ============================================================
   openclaw-client.js — talks to the OpenClaw Gateway directly from
   the browser (Option 1: direct client connection, not a webhook
   channel — see openclaw-config.js for why).
   ------------------------------------------------------------
   Uses the REST streaming endpoint (`/v1/chat/completions`) rather
   than the raw WebSocket. Both are offered by the Gateway, but this
   one follows the OpenAI-compatible chat-completions wire format,
   which is a documented, well-known shape — the WebSocket envelope
   (`ws://host:18789/ws`) is not something this codebase has any
   record of, so code written against it would be a guess. If you'd
   rather use the WebSocket transport, this file is the one place
   that needs replacing; nothing else in the app talks to the network
   directly.

   CONFIRM AGAINST YOUR ACTUAL GATEWAY: the endpoint path, the field
   names inside each streamed chunk, and the auth header are all
   implemented to the OpenAI-compatible convention. If your Gateway
   deviates, adjust parseSSELine() and the request body below —
   everything else (the chat UI, message state) does not need to
   change.
   ============================================================ */

import { openclawConfig } from './openclaw-config.js';

/**
 * Streams one assistant reply for `messages` (an array of
 * {role: 'user'|'assistant', content: string}, oldest first).
 * Calls onToken(text) as chunks arrive, onDone() once the stream ends,
 * onError(err) on any failure. Returns an AbortController-like handle
 * with .abort() to cancel an in-flight stream (e.g. on tab switch).
 */
export function streamChat({ sessionKey, messages, onToken, onDone, onError }) {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(`${openclawConfig.gatewayBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openclawConfig.sessionKey}`,
        },
        body: JSON.stringify({
          session: sessionKey,   // which agent/thread this belongs to
          messages,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Gateway ${response.status}: ${text.slice(0, 200) || response.statusText}`);
      }
      if (!response.body) throw new Error('Gateway response had no stream body.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';   // keep the last, possibly-incomplete line for next time

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') { onDone?.(); return; }
          let parsed;
          try { parsed = JSON.parse(payload); } catch { continue; }
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) onToken?.(delta);
        }
      }
      onDone?.();
    } catch (err) {
      if (err.name === 'AbortError') return;   // caller cancelled — not a failure
      onError?.(err);
    }
  })();

  return controller;
}
