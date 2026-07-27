/**
 * Default page_ref host allowlist — the ONE definition.
 *
 * [2026-07-27] This list previously existed twice: as a TS array in
 * lib/briefPageRef.ts (gating writes) and as a hardcoded string in
 * next.config.js (building the CSP frame-src). Those two have to agree or the
 * failure is silent and confusing — a host added only to the TS side saves
 * fine, then the browser refuses to frame it and the KOL sees a blank box with
 * nothing in the console to explain why.
 *
 * Plain CommonJS on purpose: next.config.js is CJS and is evaluated before any
 * TS compilation, so it cannot import the .ts module. Both sides require this.
 *
 * Entry format: a leading dot means "this domain and its subdomains"
 * (".vercel.app" matches vercel.app and foo.vercel.app but NOT notvercel.app).
 * No leading dot means an exact host match.
 */

const DEFAULT_ALLOWED_BRIEF_HOSTS = [
  // The generator's published pages (spec §6: "Published Vercel page").
  '.vercel.app',
  '.holohive.io',
  // [2026-07-27] Google Docs / Drive, so a brief can be a plain document while
  // the kr-kol-comms generator render is still outstanding. Exact hosts, not
  // ".google.com" — we do not want every Google property to qualify.
  //
  // NOTE the access-model consequence, which is not fixable from this side: a
  // doc a KOL can open anonymously is a doc shared "anyone with the link". HHP
  // can expire its own wrapper page, but it cannot revoke that document. Anyone
  // who lifts the URL keeps access indefinitely. Use per-angle docs and treat
  // them as semi-public.
  'docs.google.com',
  'drive.google.com',
];

/**
 * Hosts we deliberately render as a LINK rather than an iframe.
 *
 * Google sends X-Frame-Options on the normal /edit view, so framing a shared
 * doc yields a blank rectangle. /preview and published /pub URLs are
 * embeddable, but relying on the operator to paste exactly the right one of
 * three URL shapes is a trap: the wrong shape fails silently and looks like our
 * bug. Linking out works for every shape.
 */
const LINK_ONLY_BRIEF_HOSTS = ['docs.google.com', 'drive.google.com'];

module.exports = { DEFAULT_ALLOWED_BRIEF_HOSTS, LINK_ONLY_BRIEF_HOSTS };
