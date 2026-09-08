import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/theme-toggle";

// Two faces are fetched and they do different jobs. The document keeps Times
// New Roman, which every machine already has, because a preview of a .docx
// should look like the .docx. Everything around it - the rail, the toolbar, the
// buttons - is Inter: chrome is not a proof of the page and gains nothing from
// pretending to be one.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EMR AI Research Assistant — Protocol Review",
  description:
    "Understand and review a medical research protocol: design, objectives, outcomes, sample size, and the issues to fix.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} ${inter.variable} h-full antialiased`}
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
