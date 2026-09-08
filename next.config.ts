import type { NextConfig } from 'next';
const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Allow the configured reverse-proxy hostname to load development assets and HMR.
  allowedDevOrigins: process.env.APP_ORIGIN ? [new URL(process.env.APP_ORIGIN).hostname] : [],
};
export default config;
