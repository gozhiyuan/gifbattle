import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://gifbattles.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GIF Battles | Virtual Team Building Game for Remote Happy Hours",
    template: "%s | GIF Battles",
  },
  description:
    "GIF Battles is a free online party game for coworkers and friends. Create a room, submit funny GIFs, and vote head-to-head in minutes.",
  keywords: [
    "virtual team building game",
    "remote happy hour game",
    "coworker icebreaker",
    "online party game",
    "zoom game",
    "gif game",
    "multiplayer browser game",
  ],
  applicationName: "GIF Battles",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "GIF Battles",
    title: "GIF Battles | Virtual Team Building Game for Remote Happy Hours",
    description:
      "A fast online party game for remote teams, coworker happy hours, and friends: join a room, pick GIF answers, and vote for the funniest one.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "GIF Battles multiplayer game",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GIF Battles | Virtual Team Building Game",
    description:
      "Free remote happy hour game for coworkers and friends. Join a room, pick funny GIFs, and vote through bracket matchups.",
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
