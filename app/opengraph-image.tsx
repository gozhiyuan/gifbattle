import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "72px",
          background:
            "linear-gradient(135deg, rgb(10, 10, 22) 0%, rgb(33, 11, 46) 45%, rgb(17, 48, 79) 100%)",
          color: "white",
        }}
      >
        <div style={{ fontSize: 82, fontWeight: 800, lineHeight: 1 }}>
          GIF Battles
        </div>
        <div
          style={{
            marginTop: 20,
            fontSize: 36,
            maxWidth: 900,
            lineHeight: 1.3,
            color: "rgb(223, 229, 255)",
          }}
        >
          Multiplayer party game: pick GIFs, vote for the funniest, win the
          room.
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 28,
            color: "rgb(0, 229, 255)",
            letterSpacing: 1.2,
          }}
        >
          gifbattles.com
        </div>
      </div>
    ),
    size
  );
}
