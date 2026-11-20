import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/chat", "/admin", "/settings", "/billing", "/files", "/images", "/share/"] }],
    sitemap: `${env.APP_URL}/sitemap.xml`,
  };
}
