/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    CI: 'false'
  },
  // Déplacer optimizeFonts à la racine
  optimizeFonts: true,
  experimental: {
    forceSwcTransforms: true,
    esmExternals: false
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
}

module.exports = nextConfig
