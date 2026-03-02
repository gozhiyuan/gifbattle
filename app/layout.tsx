import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GIF Battles",
  description: "Pick GIFs. Vote for the funniest. Win eternal glory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
