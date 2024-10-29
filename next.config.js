/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    CI: 'false'
  },
  experimental: {
    forceSwcTransforms: true,
    esmExternals: false
  }
}

module.exports = nextConfig
