import type { NextConfig } from "next";

// Las fotos de la página pública se sirven desde el bucket público de Supabase.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
  images: {
    remotePatterns: supabaseUrl
      ? [new URL("/storage/v1/object/public/business-media/**", supabaseUrl)]
      : [],
  },
};

export default nextConfig;
