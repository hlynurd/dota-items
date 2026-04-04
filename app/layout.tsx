import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dota 2 Itemization Advisor",
  description: "See which items win more when a hero is on your team or the enemy team — backed by 150K+ ranked matches",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Dota 2 Itemization Advisor",
    description: "See which items win more when a hero is on your team or the enemy team — backed by 150K+ ranked matches",
    type: "website",
    siteName: "Dota 2 Itemization Advisor",
  },
  twitter: {
    card: "summary",
    title: "Dota 2 Itemization Advisor",
    description: "See which items win more when a hero is on your team or the enemy team — backed by 150K+ ranked matches",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
