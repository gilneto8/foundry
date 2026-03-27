import { MetadataRoute } from 'next'

// We provide a standard robots.txt setup that allows everything by default
// but optimizes for search and AI crawlers.
export default function robots(): MetadataRoute.Robots {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://foundry-app.dev";

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/api/'], // Private routes
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
