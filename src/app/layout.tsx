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
export const metadata: Metadata = {
  title: {
    template: "%s | Foundry App",
    default: "Foundry App",
  },
  description: "A Foundry boilerplate application.",
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
