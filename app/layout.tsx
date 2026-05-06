import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  themeColor: "#0a1f44",
  appleWebApp: {
    capable: true,
    title: "Beyond Don",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/brand/logo.png",
    apple: "/brand/logo.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a1f44",
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
      <body className="min-h-full bg-cream-50 text-navy-900">{children}</body>
    </html>
  );
}
