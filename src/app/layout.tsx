import type { Metadata } from "next";
import { Figtree, Syne, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./globals-nle-extra.css";
/* CapCut visual system supersedes studio-pro chrome */
import "./globals-capcut.css";

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Clippers — AI clips with no watermarks",
  description:
    "Paste a video link. Short clips export in full; longer videos get 40–60s viral cuts with colorful captions — watermark free.",
  verification: {
    google: "8DpI0ETmTvSubIR8L8jcgjOn0uwzphJutGha3mg17AU",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${syne.variable} ${figtree.variable} ${jetbrains.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
