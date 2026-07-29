/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export', // Removed to enable dynamic routing
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: { unoptimized: true },
  // [2026-07-27] CSP for the public brief page. The page iframes a creative
  // card published by the kr-kol-comms generator; frame-src pins which origins
  // that iframe may load, so the browser enforces the allowlist even if a bad
  // page_ref ever reaches the database past the write-side check in
  // lib/briefPageRef.ts. Kept scoped to this route rather than applied
  // globally — a site-wide CSP is a much larger change and would need every
  // existing embed (X, Telegram, Vercel analytics) audited first.
  async headers() {
    // [2026-07-27] Default list comes from lib/briefPageRefHosts.js so this CSP
    // and the write-side check in lib/briefPageRef.ts can never disagree. They
    // used to hold separate copies; a host added to one and not the other fails
    // silently as a blank iframe.
    const { DEFAULT_ALLOWED_BRIEF_HOSTS } = require('./lib/briefPageRefHosts');
    const allowed = (process.env.BRIEF_PAGE_REF_ALLOWED_HOSTS || DEFAULT_ALLOWED_BRIEF_HOSTS.join(','))
      .split(',').map(h => h.trim()).filter(Boolean)
      .map(h => (h.startsWith('.') ? `https://*${h}` : `https://${h}`))
      .join(' ');
    return [
      {
        source: '/public/brief/:token*',
        headers: [
          { key: 'Content-Security-Policy', value: `frame-src ${allowed};` },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
  // [2026-07-29] Branded short links: `tria.holohive.io/fitcheck`.
  //
  // DNS can't do this — a path never reaches the resolver, so GoDaddy has
  // no record type that could route it. This rule is the substitute: any
  // *.holohive.io host that isn't the app itself has its whole path handed
  // to app/l/[sub]/[...slug], which resolves (subdomain, slug) in the DB.
  //
  // The regex is ANCHORED, and that is load-bearing. Unanchored, the host
  // pattern matches a *substring* of `app.holohive.io` ("pp.holohive.io"),
  // which would rewrite every request to the real app into the link handler
  // and take the whole portal down. The `^`, the `$`, and the leading
  // negative lookahead are all required — keep RESERVED_SUBDOMAINS in
  // lib/shortLinkService.ts in step with the lookahead list.
  //
  // Optional `(:\d+)?` so a host carrying an explicit port still matches.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/:slug*',
          has: [
            {
              type: 'host',
              value: '^(?!app\\.|www\\.|portal\\.|api\\.)(?<sub>[a-z0-9][a-z0-9-]*)\\.holohive\\.io(:\\d+)?$',
            },
          ],
          destination: '/l/:sub/:slug*',
        },
      ],
    };
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), '@radix-ui/react-progress'];
    }
    // [2026-07-27] Load lib/templates/*.html as raw strings so the coverage
    // leave-behind renders the canonical template file itself rather than a
    // copy pasted into a .ts literal. coverage-rules.md makes HHP a mirror of
    // that template; keeping it a real .html file is what lets it be diffed
    // against the source of truth. Scoped to the folder so Next's own HTML
    // handling is untouched.
    config.module.rules.push({
      test: /\.html$/,
      include: [require('path').resolve(__dirname, 'lib/templates')],
      type: 'asset/source',
    });
    return config;
  },
};

module.exports = nextConfig;
