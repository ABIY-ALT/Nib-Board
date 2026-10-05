import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // `pg` opens TCP sockets and must stay a real Node dependency rather than
  // being traced into the bundle.
  serverExternalPackages: ['pg'],

  // Do not advertise the framework in an `X-Powered-By` header.
  poweredByHeader: false,

  experimental: {
    // With a proxy present, Next.js buffers each request body so both the
    // proxy and the route can read it — and silently truncates anything past
    // this limit (10 MB by default). Board papers may be up to 25 MB
    // (MAX_UPLOAD_BYTES in src/lib/storage.ts), so the limit sits just above
    // that plus multipart overhead. It also caps how much of any request body
    // is ever held in memory.
    proxyClientMaxBodySize: '26mb',
  },

  // Pin the workspace root: without it Turbopack walks up past C:\ and warns
  // about lockfiles outside the project.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;