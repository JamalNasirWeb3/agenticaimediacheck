import type { Metadata } from "next";
import { Noto_Nastaliq_Urdu } from "next/font/google";
import "./globals.css";

const urduFont = Noto_Nastaliq_Urdu({ subsets: ["arabic"], variable: "--font-urdu", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "FactCheck AI",
  description: "AI-powered fact-checking and propaganda detection",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`bg-gray-950 text-gray-100 min-h-screen antialiased ${urduFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
