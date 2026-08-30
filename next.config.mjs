const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; base-uri 'self'; connect-src 'self' https://*.insforge.app https://cloudflareinsights.com https://*.cloudflareinsights.com https://www.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; frame-src 'self' https://www.googletagmanager.com https://www.google-analytics.com; img-src 'self' data: https://www.google-analytics.com https://*.analytics.google.com; object-src 'none'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/privacy", destination: "/privacy.html" },
        { source: "/cookie-policy", destination: "/cookie-policy.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
