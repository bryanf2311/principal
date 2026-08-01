/* ============================================================
   Config for principal-api — the VPS-hosted backend that lets the
   dashboard ask the Teaching/Grading agents to go do something (see
   principal-api/README.md for the full picture; the Firebase-only
   parts of this app work fine without this ever being filled in).

   Fill in apiBaseUrl once principal-api is deployed and reachable over
   HTTPS from wherever this dashboard is served — same mixed-content
   rule that applied to the abandoned live-chat attempt: a bare
   http://host:8787 will not work from an https:// page.
   ============================================================ */

export const principalApiConfig = {
  apiBaseUrl: '',   // e.g. 'https://principal-api.your-domain.com'
};

export const isPrincipalApiConfigured = () => Boolean(principalApiConfig.apiBaseUrl);
