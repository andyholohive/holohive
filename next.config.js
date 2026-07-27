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
    const allowed = (process.env.BRIEF_PAGE_REF_ALLOWED_HOSTS || '.vercel.app,.holohive.io')
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
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), '@radix-ui/react-progress'];
    }
    return config;
  },
};

module.exports = nextConfig;
