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
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), '@radix-ui/react-progress'];
    }
    return config;
  },
};

module.exports = nextConfig;
