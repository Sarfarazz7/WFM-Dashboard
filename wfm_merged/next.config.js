/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Excel parsing (xlsx) runs inside API routes on Node runtime by default.
};

module.exports = nextConfig;
