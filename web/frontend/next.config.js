const backend = process.env.SOONISH_BACKEND_URL ?? "http://127.0.0.1:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app/ directory is an experimental feature in Next 13.1.
  experimental: { appDir: true },
  async rewrites() {
    // Django's URLs end with a slash; the frontend calls them without one.
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*/` }];
  },
};

module.exports = nextConfig;
