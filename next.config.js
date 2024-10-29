/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    CI: 'false'
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
  experimental: {
    // Désactivez temporairement optimizeFonts si nécessaire
    optimizeFonts: false,
    // Ajoutez ces options si nécessaire
    forceSwcTransforms: true,
    esmExternals: false
  }
}

module.exports = nextConfig
