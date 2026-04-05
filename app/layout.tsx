import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dota 2 Itemisation Stats",
  description: "See which items win more against each enemy hero — backed by 400K+ ranked matches",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Dota 2 Itemisation Stats",
    description: "See which items win more against each enemy hero — backed by 400K+ ranked matches",
    type: "website",
    siteName: "Dota 2 Itemisation Stats",
  },
  twitter: {
    card: "summary",
    title: "Dota 2 Itemisation Stats",
    description: "See which items win more against each enemy hero — backed by 400K+ ranked matches",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 antialiased">{children}<Analytics /></body>
    </html>
  );
}
