import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // `pg` opens TCP sockets and must stay a real Node dependency rather than
  // being traced into the bundle.
  serverExternalPackages: ['pg'],

  // Pin the workspace root: without it Turbopack walks up past C:\ and warns
  // about lockfiles outside the project.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;