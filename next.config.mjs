/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export — Vercel will serve as static. Everything runs client-side.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
