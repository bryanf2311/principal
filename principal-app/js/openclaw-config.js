/* ============================================================
   OpenClaw Gateway connection config — mirrors firebase-config.js.
   ------------------------------------------------------------
   This app has no server (Netlify static hosting + Firebase Spark,
   the same "no Cloud Functions" constraint that shaped the rest of
   this project), so live chat talks to the Gateway directly from
   the browser — Option 1 (direct client connection), not Option 2
   (webhook channel), which would need a server we deliberately don't
   have. See README.md's "Chat with a teacher agent" section.

   Two things only you can fill in:

   1. gatewayBaseUrl must be reachable over HTTPS from the public
      internet. The dashboard is served over https:// (Netlify), and
      browsers refuse to call an insecure http:// endpoint from an
      https:// page (mixed content) — a bare "http://localhost:18789"
      or LAN address will not work for a visitor's browser regardless.
      If the Gateway currently only listens locally, put a TLS-
      terminating reverse proxy in front of it (Caddy, nginx, or a
      Cloudflare Tunnel all work) and point this at that public URL.

   2. sessionKey is a shared secret, the same trust model already used
      for PRINCIPAL_SETUP_KEY elsewhere in this app: fine for a single-
      family app where the only people who can reach the dashboard at
      all are the ones you already trust, not something to reuse for a
      multi-tenant product. If OpenClaw supports minting a short-lived,
      per-user token instead, prefer that and swap it in here — ask
      before shipping the shared-key version if that matters to you.
   ============================================================ */

export const openclawConfig = {
  gatewayBaseUrl: 'https://YOUR-GATEWAY-HOST',   // e.g. https://gateway.example.com — must be TLS
  sessionKey: 'YOUR_OPENCLAW_SESSION_KEY',
};

export const isOpenClawConfigured = () => Boolean(
  openclawConfig.gatewayBaseUrl && !openclawConfig.gatewayBaseUrl.includes('YOUR-GATEWAY-HOST')
  && openclawConfig.sessionKey && !openclawConfig.sessionKey.includes('YOUR_OPENCLAW'),
);
