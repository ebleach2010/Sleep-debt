/** @type {import('next').NextConfig} */
// When deploying to GitHub Pages the site lives under /<repo-name>/. The
// workflow sets NEXT_PUBLIC_BASE_PATH; Vercel deployments leave it unset.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
};

export default nextConfig;
