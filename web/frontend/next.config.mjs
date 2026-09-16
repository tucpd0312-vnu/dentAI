/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
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
        // DRF router của backend dùng trailing slash. Next bỏ slash cuối khỏi
        // tham số `:path*`, vì vậy cần thêm lại ở destination; nếu không các
        // endpoint ViewSet như /qa/sessions/teachers/ sẽ thành URL 404.
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://backend:8000"}/api/:path*/`,
      },
      {
        source: "/media/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://backend:8000"}/media/:path*`,
      },
    ];
  },
};

export default nextConfig;
