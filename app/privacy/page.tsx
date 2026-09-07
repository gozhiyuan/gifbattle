import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description: "How GIF Battles handles game, analytics, and AI feature data.",
  alternates: { canonical: "/privacy" },
};

const sectionStyle = { marginTop: 28 };
const headingStyle = { fontSize: 19, marginBottom: 8 };

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#07070e", color: "#eaeaff", fontFamily: "system-ui, sans-serif", padding: "40px 20px" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", lineHeight: 1.65 }}>
        <a href="/" style={{ color: "#00e5ff" }}>← GIF Battles</a>
        <h1 style={{ fontSize: 34, margin: "20px 0 8px" }}>Privacy Notice</h1>
        <p style={{ color: "#aaaac8", marginTop: 0 }}>Effective date: September 7, 2026</p>

        <p>
          GIF Battles is a browser-based multiplayer party game. This notice explains what information is processed when you use the game and the third-party services that help operate it.
        </p>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Information used to run a game</h2>
          <p>
            You choose a nickname and may create or join a room. We process the room code, an anonymous player identifier stored in your browser, game submissions, votes, and game settings so players in the same room can play together. Do not include sensitive personal information in nicknames, prompts, text answers, or AI-image requests.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>GIF search</h2>
          <p>
            When you search for a GIF, the search term and technical request data are sent directly from your browser to GIPHY. GIPHY processes that request under its own policies. GIF Battles displays GIPHY attribution where its content is used.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>AI features</h2>
          <p>
            If a room host enables AI features with a Gemini API key, question-generation and image-generation prompts are sent to Google&apos;s Gemini API. Generated images are stored in Vercel Blob so they can be displayed during the game. The host&apos;s Gemini key is stored server-side for the room and is not shown to other players.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Analytics and service providers</h2>
          <p>
            We use Vercel Web Analytics to understand aggregated site visits and page performance. Vercel states that this analytics product uses anonymized data and does not use cookies. We also use Vercel to host the app and images, and Upstash Redis to store temporary room state and rate-limit data.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Retention</h2>
          <p>
            Lobby data normally expires after 30 minutes of inactivity. Active-game state normally expires after four hours, and completed-game state after 15 minutes. Room Gemini keys expire within 24 hours and are cleared when a game ends. AI images are deleted at game end on a best-effort basis; a failed cleanup may require later administrative deletion.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>Your choices and contact</h2>
          <p>
            You can stop using the game at any time and clear your browser storage through your browser settings. For questions about this notice or a data request, please open an issue in the GIF Battles repository.
          </p>
          <p>
            <a href="https://github.com/gozhiyuan/gifbattle/issues" target="_blank" rel="noreferrer" style={{ color: "#00e5ff" }}>
              Contact GIF Battles on GitHub
            </a>
          </p>
        </section>
      </article>
    </main>
  );
}
