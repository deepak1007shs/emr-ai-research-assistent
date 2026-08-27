import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/theme-toggle";

// Only the monospaced face is fetched. The app itself is Times New Roman, which
// every machine already has, so the sans family was a download nothing used.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SAP Builder — Protocol Review",
  description:
    "Understand and review a medical research protocol: design, objectives, outcomes, sample size, and the issues to fix.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
      // The script below stamps data-theme before React hydrates, which is the
      // whole point of it: the alternative is a flash of the wrong theme. React
      // sees an attribute the server did not render and would warn every load.
      suppressHydrationWarning
    >
      <head>
        {/*
          Applies the remembered theme before the first paint. Without it the
          page renders light and then flips, which reads as a fault.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
