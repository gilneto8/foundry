import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist Sans is mapped to --font-sans (the shadcn Nova preset token)
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Root Metadata — override per-app in the individual app's layout or page.
 * These are factory defaults.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://foundry-app.dev";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    template: "%s | Foundry Boilerplate",
    default: "Foundry — High Performance SaaS Factory",
  },
  description: "A production-ready Next.js boilerplate optimized for resource-constrained VPS environments. Built for performance, SEO, and AI-engine visibility.",
  keywords: ["saas boilerplate", "next.js template", "performance optimization", "foundry"],
  authors: [{ name: "Foundry Engineer" }],
  creator: "Foundry Factory",
  
  // SEO — Search Engine Optimization
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // AEO — AI Engine Optimization
  // We explicitly signal content structure for LLM scrapers via clean semantic metadata
  alternates: {
    canonical: "/",
  },

  // OpenGraph (Facebook, LinkedIn, Discord)
  openGraph: {
    type: "website",
    locale: "pt_PT",
    url: APP_URL,
    title: "Foundry Boilerplate",
    description: "SaaS manufacturing line for the modern engineer.",
    siteName: "Foundry",
    images: [
      {
        url: "/og-image.png", // Ensure this exists in /public or add a manifest route
        width: 1200,
        height: 630,
        alt: "Foundry App Preview",
      },
    ],
  },

  // Twitter
  twitter: {
    card: "summary_large_image",
    title: "Foundry Boilerplate",
    description: "SaaS manufacturing line for the modern engineer.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt" // Default to Portuguese — override per-app
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
