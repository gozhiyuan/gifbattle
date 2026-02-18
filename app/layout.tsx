import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GIF Battle",
  description: "Pick GIFs. Vote for the funniest. Win eternal glory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
