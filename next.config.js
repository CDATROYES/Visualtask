/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    CI: 'false',
    NEXT_TELEMETRY_DISABLED: '1'
  },
  experimental: {
    optimizeFonts: true,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    // Ajout de la configuration pour gérer les modules problématiques
    config.module = {
      ...config.module,
      exprContextCritical: false,
      rules: [
        ...config.module.rules,
        {
          test: /\.m?js$/,
          resolve: {
            fullySpecified: false,
          },
        },
      ],
    };

    return config;
  },
  transpilePackages: ['lucide-react', 'papaparse'],
  // Optimisations pour la production
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
}

module.exports = nextConfig
