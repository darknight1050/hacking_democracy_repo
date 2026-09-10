import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingIncludes: { '/api/account/impact/pdf': ['./src/server/pdf-assets/*'] },
  poweredByHeader: false,
  // Separate verification output from the running development server.
  distDir: process.env.NEXT_OUTPUT_DIR ?? '.next',
  // Allow the configured reverse-proxy hostname to load development assets and HMR.
  allowedDevOrigins: process.env.APP_ORIGIN ? [new URL(process.env.APP_ORIGIN).hostname] : [],
};
export default config;
