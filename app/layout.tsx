import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SplashScreen } from "@/components/splash-screen";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BEYOND DON LLC — Operations Dashboard",
  description:
    "Maximize Your Property's Potential. Unified property management dashboard for the BEYOND DON LLC Airbnb portfolio.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Beyond Don",
    statusBarStyle: "black-translucent",
  },
  // Icons are auto-detected from app/icon.svg (favicon) and
  // app/apple-icon.tsx (iOS home-screen tile, rendered to PNG via next/og).
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a1f44",
  // Required for env(safe-area-inset-*) to be non-zero on notched iPhones —
  // without it the bottom nav sits inside the home-indicator swipe zone and
  // the PWA header slides under the status bar.
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-navy-950 text-cream-50">
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
