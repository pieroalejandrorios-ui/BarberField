import type { MetadataRoute } from "next";
import { deploymentEnvironment } from "@/lib/deployment";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", ...(deploymentEnvironment(process.env) === "production"
    ? { allow: "/", disallow: ["/panel", "/login", "/registro"] }
    : { disallow: "/" }) } };
}
