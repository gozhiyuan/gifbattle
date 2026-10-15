import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

// Matches the in-app fight-card palette: red corner vs blue corner, poster yellow, warm ink.
const RED = "#E2402F";
const BLUE = "#2E6BE6";
const YELLOW = "#FFC93C";
const INK = "#14120F";
const PAPER = "#F2EDE4";
const TAGLINE = "Find funny GIFs, create your own memes, and vote for the funniest answer.";
const SITE = "gifbattles.com";

// The in-app faces (Big Shoulders Display for headings, DM Sans for body), subset to the
// characters drawn here. Falls back to the default font if Google Fonts is unreachable at build.
async function loadFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`
    )).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [display, body, bodyBold] = await Promise.all([
    loadFont("Big Shoulders Display", 800, "GIFBATTLESVS"),
    loadFont("DM Sans", 400, TAGLINE),
    loadFont("DM Sans", 700, SITE),
  ]);
  const displayFamily = display ? "Big Shoulders Display" : undefined;
  const bodyFamily = body && bodyBold ? "DM Sans" : undefined;
  const fonts = [
    ...(display ? [{ name: "Big Shoulders Display", data: display, weight: 800 as const, style: "normal" as const }] : []),
    ...(bodyFamily ? [
      { name: "DM Sans", data: body!, weight: 400 as const, style: "normal" as const },
      { name: "DM Sans", data: bodyBold!, weight: 700 as const, style: "normal" as const },
    ] : []),
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: `linear-gradient(100deg, ${RED} 0%, ${RED} 50%, ${BLUE} 50%, ${BLUE} 100%)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 72,
            right: 72,
            bottom: 72,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 64px",
            background: INK,
            color: PAPER,
          }}
        >
          <div style={{ display: "flex", fontFamily: displayFamily, fontSize: display ? 150 : 112, fontWeight: 800, lineHeight: 1 }}>
            <span style={{ color: RED }}>GIF</span>
            <span style={{ marginLeft: 28 }}>BATTLES</span>
          </div>
          <div style={{ marginTop: 24, fontFamily: bodyFamily, fontSize: 36, lineHeight: 1.3, maxWidth: 820 }}>
            {TAGLINE}
          </div>
          <div style={{ display: "flex", marginTop: 36 }}>
            <div
              style={{
                background: YELLOW,
                color: INK,
                fontFamily: bodyFamily,
                fontSize: 28,
                fontWeight: 700,
                padding: "8px 18px",
                letterSpacing: 1,
              }}
            >
              {SITE}
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 40,
            top: 40,
            display: "flex",
            background: YELLOW,
            color: INK,
            fontFamily: displayFamily,
            fontSize: 64,
            fontWeight: 800,
            padding: "6px 22px",
            border: `5px solid ${INK}`,
            transform: "rotate(-6deg)",
          }}
        >
          VS
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length ? fonts : undefined,
    }
  );
}
