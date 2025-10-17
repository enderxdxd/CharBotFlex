/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Não usar módulos Node.js no cliente
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
        '@grpc/proto-loader': false,
        '@grpc/grpc-js': false,
        'google-gax': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
