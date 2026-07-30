#!/usr/bin/env node
/* One-time bootstrap: mint one Ed25519 device identity for the student
 * dashboard's chat feature, and do the real signed connect handshake
 * against your OpenClaw Gateway. Run this ONCE, on the VPS itself
 * (loopback is simplest and most trusted — see README's "Chat with a
 * teacher agent" section for why this is a one-time step rather than
 * something the browser does itself). It will very likely land as a
 * *pending* device the first time — that's expected. Steps:
 *
 *   cd scripts && npm install
 *   node openclaw-pair-device.mjs
 *
 * If it prints "PENDING", go approve it on the VPS:
 *   openclaw-native devices list
 *   openclaw-native devices approve <requestId>
 *   openclaw-native devices rotate --device <deviceId printed below> \
 *     --role operator --scope operator.talk
 * Then run this script again — it should print "CONNECTED" and a
 * deviceToken. Everything it prints (deviceId/publicKey/privateKey/
 * deviceToken) goes into openclaw-config.js — nothing here is sent
 * anywhere except to your own Gateway.
 *
 * Needs the `ws` package (not the native WebSocket global) because the
 * Gateway checks the WebSocket handshake's Origin header, and only `ws`
 * lets a plain Node script set one.
 */
import * as ed from '@noble/ed25519';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';   // shared gateway password/token, if you want to try it
const ORIGIN = process.env.GATEWAY_ORIGIN || 'http://127.0.0.1:18789';

// Persisted next to this script so re-running it (e.g. after approving the
// pending request) reuses the SAME device identity instead of minting a new
// one every time — a fresh identity each run would mean each run's pending
// pairing request is abandoned, and approving an earlier one does nothing.
const IDENTITY_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'device-identity.json');

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}
function b64urlDecode(s) {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

async function generateIdentity() {
  const privateKey = ed.utils.randomSecretKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);
  const deviceId = crypto.createHash('sha256').update(Buffer.from(publicKey)).digest('hex');
  return { deviceId, publicKey: b64url(publicKey), privateKey: b64url(privateKey) };
}

async function loadOrCreateIdentity() {
  if (fs.existsSync(IDENTITY_PATH)) {
    const stored = JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8'));
    console.log(`(reusing saved identity from ${IDENTITY_PATH})`);
    return stored;
  }
  const identity = await generateIdentity();
  fs.writeFileSync(IDENTITY_PATH, JSON.stringify(identity, null, 2), { mode: 0o600 });
  console.log(`(generated a new identity, saved to ${IDENTITY_PATH})`);
  return identity;
}

function buildDeviceAuthPayloadV2({ deviceId, clientId, clientMode, role, scopes, signedAtMs, token, nonce }) {
  return ['v2', deviceId, clientId, clientMode, role, scopes.join(','), String(signedAtMs), token ?? '', nonce].join('|');
}

/** One connect attempt. Resolves to {outcome: 'connected', helloOk} |
 * {outcome: 'not-paired', requestId} | {outcome: 'rejected', error} |
 * {outcome: 'no-response'}. Never throws for ordinary protocol outcomes.
 *
 * IMPORTANT: on NOT_PAIRED we do NOT close the socket. The pending
 * pairing request appears to be tied to this specific live connection —
 * closing it (even to "retry" a moment later) destroys the pending
 * request instantly, so `devices approve` never has anything to find.
 * Instead we hold the connection open and wait for the Gateway to push
 * something once it's approved. */
function attemptConnect(identity, { verbose, onPending, waitMs }) {
  return new Promise((resolve) => {
    const log = (...args) => { if (verbose) console.log(...args); };
    const ws = new WebSocket(GATEWAY_URL, [], { headers: { Origin: ORIGIN } });
    let settled = false;
    let deadline = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      try { ws.close(); } catch { /* already closed */ }
      resolve(result);
    };

    deadline = setTimeout(() => finish({ outcome: 'no-response' }), 10_000);

    ws.addEventListener('open', () => log('socket open, waiting for connect.challenge...'));

    ws.addEventListener('message', async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      log('recv:', JSON.stringify(msg).slice(0, 300));

      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        const nonce = msg.payload.nonce;
        const signedAtMs = Date.now();
        const role = 'operator';
        const scopes = ['operator.talk'];
        const payload = buildDeviceAuthPayloadV2({
          deviceId: identity.deviceId,
          clientId: 'webchat-ui',
          clientMode: 'webchat',
          role,
          scopes,
          signedAtMs,
          token: GATEWAY_TOKEN || null,
          nonce,
        });
        const sigBytes = await ed.signAsync(new TextEncoder().encode(payload), b64urlDecode(identity.privateKey));
        const signature = b64url(sigBytes);

        const connectReq = {
          type: 'req',
          id: crypto.randomUUID(),
          method: 'connect',
          params: {
            minProtocol: 4,
            maxProtocol: 4,
            client: { id: 'webchat-ui', version: '1.0.0', platform: 'web', mode: 'webchat' },
            role,
            scopes,
            caps: [],
            commands: [],
            permissions: {},
            ...(GATEWAY_TOKEN ? { auth: { token: GATEWAY_TOKEN } } : {}),
            device: {
              id: identity.deviceId,
              publicKey: identity.publicKey,
              signature,
              signedAt: signedAtMs,
              nonce,
            },
          },
        };
        log('sending connect request...');
        ws.send(JSON.stringify(connectReq));
        return;
      }

      if (msg.type === 'res' && msg.payload?.type === 'hello-ok') {
        finish({ outcome: 'connected', helloOk: msg.payload });
        return;
      }

      if (msg.type === 'res' && msg.ok === false) {
        const details = msg.error?.details;
        if (details?.code === 'PAIRING_REQUIRED') {
          if (onPending && !settled) {
            // Do not finish() — keep the socket open and extend how long
            // we're willing to wait, instead of tearing the connection
            // (and the pending request with it) down.
            onPending(details.requestId);
            clearTimeout(deadline);
            deadline = setTimeout(() => finish({ outcome: 'still-pending', requestId: details.requestId }), waitMs ?? 10_000);
            const heartbeat = setInterval(() => {
              if (settled) { clearInterval(heartbeat); return; }
              console.log('... still waiting for approval (socket held open)');
            }, 15_000);
            return;
          }
          finish({ outcome: 'not-paired', requestId: details.requestId });
        } else {
          finish({ outcome: 'rejected', error: msg.error });
        }
      }
    });

    ws.addEventListener('close', (event) => finish({ outcome: 'no-response', closeCode: event.code, closeReason: event.reason }));
    ws.addEventListener('error', (event) => log('socket error:', event.message || event));
  });
}

async function main() {
  const identity = await loadOrCreateIdentity();
  console.log('Device identity (save all three — they go in openclaw-config.js):');
  console.log('  deviceId:  ', identity.deviceId);
  console.log('  publicKey: ', identity.publicKey);
  console.log('  privateKey:', identity.privateKey);

  console.log(`\nConnecting to ${GATEWAY_URL} ...`);

  // Single connection, held open the whole time. If it comes back
  // PAIRING_REQUIRED we do NOT reconnect — we just keep this same socket
  // alive and wait, since the pending request lives only as long as the
  // connection that created it does.
  const result = await attemptConnect(identity, {
    verbose: true,
    waitMs: 3 * 60_000,
    onPending: (requestId) => {
      console.log(`\nPENDING — requestId: ${requestId}`);
      console.log('Approve it now, in another terminal on this VPS (this script will keep');
      console.log('the connection open and wait — do not re-run it):');
      console.log(`  openclaw-native devices approve ${requestId}`);
      console.log('Waiting up to 3 minutes...\n');
    },
  });

  if (result.outcome === 'connected') {
    printConnected(result.helloOk);
    process.exit(0);
  }
  if (result.outcome === 'rejected') {
    console.log('\nREJECTED:', JSON.stringify(result.error));
    process.exit(1);
  }
  if (result.outcome === 'still-pending') {
    console.log('\nGave up after 3 minutes without approval.');
    console.log(`Check: openclaw-native devices list  (look for requestId ${result.requestId})`);
    console.log('Then run this script again once you can see it pending and approve it quickly.');
    process.exit(2);
  }
  console.log('\nNo response from the Gateway (closeCode:', result.closeCode, result.closeReason, '). Check GATEWAY_URL/connectivity.');
  process.exit(2);
}

function printConnected(helloOk) {
  console.log('\nCONNECTED. hello-ok.auth:', JSON.stringify(helloOk.auth, null, 2));
  if (helloOk.auth?.deviceToken) {
    console.log('\ndeviceToken (put this in openclaw-config.js too):');
    console.log(' ', helloOk.auth.deviceToken);
  }
}

main();
