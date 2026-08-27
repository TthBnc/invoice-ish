import type { Metadata } from "next";
import { Geist } from "next/font/google";

import { InteractiveBackground } from "@/components/interactive-background";

import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Invoice-ish",
  description: "Playful invoices for people you know.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable}>
        <InteractiveBackground />
        {children}
      </body>
    </html>
  );
}
