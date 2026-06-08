import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.COZE_PROJECT_DOMAIN_DEFAULT
      ? `https://${process.env.COZE_PROJECT_DOMAIN_DEFAULT}`
      : 'http://localhost:5000',
  },
};

export default nextConfig;
