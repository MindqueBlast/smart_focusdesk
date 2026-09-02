import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "SmartFocus — AI Focus Tracking",
  description:
    "Privacy-first focus tracking through your webcam. All analysis runs locally in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jakarta.variable} h-full`}>
      <body className="grain min-h-full bg-page text-text antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
