/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  // react-konva pulls in konva's node build which requires the native `canvas`
  // package during SSR/bundling. We only render Konva client-side, so stub it out.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://backend:8000"}/api/:path*`,
      },
      {
        source: "/media/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://backend:8000"}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
