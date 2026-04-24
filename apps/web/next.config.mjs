/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@premura/db", "@premura/shared", "@premura/agents"],
};

export default nextConfig;
