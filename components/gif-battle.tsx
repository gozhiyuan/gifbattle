"use client";

import { useState, useEffect, useRef, useCallback, CSSProperties } from "react";

const POLL_MS = 2000;
const DEFAULT_ROUNDS = 3;    // prompts each player submits for
const DEFAULT_NAME_PROMPT_ROUNDS = 1;
const VOTE_SECS = 12;        // seconds per voting matchup
const SUBMIT_SECS = 60;      // seconds per GIF question (total = SUBMIT_SECS * rounds)
const RESULTS_SECS = 5;      // seconds to show round results before auto-advancing

const PROMPTS = [
  "When you realize it's Monday tomorrow",
  "Me explaining my life choices to my parents",
  "When the WiFi suddenly cuts out",
  "That moment when you see your ex in public",
  "When someone says 'we need to talk'",
  "Me trying to adult",
  "When the food finally arrives",
  "My reaction when someone spoils the ending",
  "Finding $20 in old pants",
  "How I feel every Friday afternoon",
  "Me pretending to work on Zoom",
  "When someone asks if I'm really okay",
  "After sending a risky text",
  "Me after one cup of coffee",
  "How I walk into the weekend",
  "When someone takes the last slice of pizza",
  "When someone says 'just a quick question'",
  "Me on a diet vs. smelling pizza",
  "When the meeting could've been an email",
  "My face during awkward silences",
  "Me trying to explain my sense of humor",
  "When autocorrect betrays me",
  "Me five minutes before a deadline",
  "When the plan actually works",
  "How I look vs. how I feel",
  "Me opening my bank app after brunch",
  "That moment the group chat goes silent",
  "When my package says delivered but isn't",
  "Me acting normal after tripping in public",
  "When your camera turns on unexpectedly",
  "Me hearing my own voice in a recording",
  "When someone replies 'k' to a paragraph",
  "Me checking if the door is locked again",
  "When the elevator stops on every floor",
  "Me trying to fold a fitted sheet",
  "When the playlist ruins your gym momentum",
  "Me pretending I know wine flavors",
  "When the password needs one more symbol",
  "Me joining a call exactly on time",
  "When your pet judges all your decisions",
  "Me reading terms and conditions like",
  "When someone starts clapping on airplane landing",
  "Me trying to remember why I entered",
  "When a recipe says 'prep 10 minutes'",
  "Me after saying 'one more episode'",
  "When your alarm rings from a dream",
  "Me trying to take a group selfie",
  "When your phone battery hits one percent",
  "Me seeing my old tweets resurface",
  "When someone says 'this won't hurt'",
  "Me discovering autocorrect changed my boss message",
  "When the QR menu won't load",
  "Me pretending the spicy food is fine",
  "When your coffee order is wrong again",
  "Me in winter before the shower",
  "When someone takes forever at the ATM",
  "Me opening LinkedIn after one bad day",
  "When the app asks for another update",
  "Me trying to stay awake after lunch",
  "When your food arrives and no utensils",
  "Me hearing 'let's go around and share'",
  "When your joke doesn't land at all",
  "Me searching symptoms at two a.m.",
  "When my cart total doubles at checkout",
  "Me trying to assemble IKEA furniture",
  "When your ride share is two minutes away",
  "Me accidentally liking a post from 2018",
  "When someone says 'be yourself' in interviews",
  "Me when the waiter says 'enjoy'",
  "When your sock gets wet unexpectedly",
  "Me trying to parallel park under pressure",
  "When the fire alarm tests during nap",
  "Me introducing two friends with same name",
  "When your boss says 'quick sync?'",
  "Me watching someone type with one finger",
  "When the chip bag is mostly air",
  "Me pretending I understand crypto",
  "When your text says delivered not read",
  "Me preparing to cancel a free trial",
  "When the printer starts making new noises",
  "Me trying to leave without saying goodbye",
  "When your mom starts with 'no offense'",
  "Me hearing footsteps behind me at night",
  "When the weather app lies again",
  "Me opening the fridge repeatedly for ideas",
  "When someone takes credit for team work",
  "Me trying to avoid eye contact salespeople",
  "When your airport gate changes last minute",
  "Me finding a typo after sending",
  "When your phone autocorrects your own name",
  "Me trying to remember where I parked",
  "When your laptop fan sounds like takeoff",
  "Me answering unknown numbers by mistake",
  "When someone says 'trust me' nervously",
  "Me realizing I forgot my headphones",
  "When you wave back at no one",
  "Me checking if that email sounded rude",
  "When the waiter asks 'sparkling or still?'",
  "Me trying to split the bill evenly",
  "When your friend says they're five minutes away",
  "Me holding in a sneeze in silence",
  "When your screen share shows wrong tab",
  "Me trying to carry every grocery bag",
  "When your smartwatch says 'time to stand'",
  "Me reading old messages and cringing",
  "When my haircut looked better at salon",
  "Me waiting for microwave at one second",
  "When your package needs a signature",
  "Me trying to meditate but thinking groceries",
  "When your dad discovers voice notes",
  "Me opening fifteen tabs to compare one item",
  "When your train arrives already full",
  "Me trying to leave bed in winter",
  "When your contact lens disappears mid-blink",
  "Me saying 'on my way' from home",
  "When someone forwards an email chain novel",
  "Me pretending to know where north is",
  "When your photos app reminds old memories",
  "Me trying not to laugh in serious meeting",
  "When your landlord says 'easy fix'",
  "Me starting healthy on Monday again",
  "When the restroom has hand dryer tornado",
  "Me choosing a profile picture for an hour",
  "When someone tags you in unflattering photo",
  "Me hearing my name in another conversation",
  "When your to-do list adds itself",
  "Me finding one fry at bottom of bag",
  "When someone eats your labeled office lunch",
  "Me trying to stay calm on hold",
  "When your coffee spills right after brewing",
  "Me pretending the buffering wheel is fine",
  "That moment when you send to wrong chat",
  "When your umbrella flips inside out",
  "Me refreshing tracking updates every hour",
  "When your keyboard suddenly types in caps",
  "That moment when your password finally works",
  "Me deciding what to watch for 40 minutes",
  "When your call drops at the important part",
  "Me trying to pronounce menu items confidently",
  "That moment when your shoelace breaks outside",
  "When your online order misses one item",
  "Me turning the pillow to the cold side",
  "That moment when the ice cream falls",
  "When your friend says bring cash only",
  "Me pretending I saw the movie too",
  "That moment when your tab closes itself",
  "When your charger only works at one angle",
  "Me trying not to cry during onions",
  "That moment when your joke gets explained",
  "When your playlist repeats the same song",
  "Me reading recipe comments before cooking",
  "That moment when your phone falls face down",
  "When the cashier says card machine down",
  "Me acting calm during software updates",
  "That moment when the calendar alert jumpscare",
  "When your socks don't match but too late",
  "Me trying to open a childproof cap",
  "That moment when you forget your own number",
  "When your camera mirrors you unexpectedly",
  "Me checking weather then ignoring it",
  "That moment when your seat reclines into snacks",
  "When your food delivery takes a scenic route",
  "Me overthinking a one-word reply",
  "That moment when the autocorrect wins again",
  "When your landlord schedules surprise inspection",
  "Me searching for a file I renamed",
  "That moment when your laptop updates at shutdown",
  "When your online meeting starts with silence",
  "Me trying to look busy near manager",
  "That moment when your package gets rerouted",
  "When your haircut reveals ears you forgot",
  "Me opening fridge like it changed",
  "That moment when everyone says let's split",
  "When your friend spoils the surprise accidentally",
  "Me trying to carry coffee and keys",
  "That moment when the app logs you out",
  "When your socks vanish in laundry",
  "Me nodding like I understand finance",
  "That moment when your phone rings in quiet room",
  "When your GPS says turn then recalculates",
  "Me pretending I can hear in loud bar",
  "That moment when your alarm is PM",
  "When your hand slips opening soda",
  "Me trying to write an out-of-office",
  "That moment when your pet steals your seat",
  "When your stream quality drops during finale",
  "Me realizing I muted myself five minutes",
  "That moment when the elevator mirror humbles you",
  "When your card gets declined and then works",
  "Me responding all to company email by mistake",
  "That moment when your bag zipper breaks",
  "When your tiny typo changes the meaning",
  "Me trying to stay awake in webinar",
  "That moment when your ride says arriving now",
  "When your shoes squeak in a quiet hallway",
  "Me ignoring low storage warnings until panic",
  "That moment when your pen leaks in pocket",
  "When your neighbor starts drilling on Sunday",
  "Me pretending to enjoy networking events",
  "That moment when your desk snack is gone",
  "When your friend says don't be mad",
  "Me opening map app just for confidence",
  "That moment when your email bounces back",
  "When your pizza arrives with no ranch",
  "Me trying to look natural in candid photo",
  "That moment when your room key stops working",
  "When your train platform changes at last second",
  "Me trying to understand parking signs",
  "That moment when your call is on speaker",
  "When your tea gets cold twice",
  "Me pretending to remember everyone's names",
  "That moment when your groceries bag rips",
  "When your browser has 67 open tabs",
  "Me trying to keep plants alive",
  "That moment when your timer was never started",
  "When your sink dishes multiply overnight",
  "Me saying yes then checking calendar",
  "That moment when your old playlist slaps",
  "When your phone brightness goes full sun",
  "Me looking for sunglasses already on head",
  "That moment when your boss replies instantly",
  "When your app asks to enable notifications again",
  "Me trying to open a sticky jar",
  "That moment when your party outfit is too much",
  "When your table order goes to wrong seat",
  "Me calculating tip under pressure",
  "That moment when your roast goes too far",
  "When your headphone battery dies at gym",
  "Me waiting for typo correction in text bubble",
  "That moment when your code works unexpectedly",
  "When your microwave beeps like emergency alarm",
  "Me trying not to laugh during serious email",
  "That moment when your calendar double-books itself",
  "When your raincoat leaks anyway",
  "Me opening camera accidentally with flashlight on",
  "That moment when your food is too hot",
  "When your browser autofills old address",
  "Me trying to stay chill in customer support queue",
  "That moment when your alarm snooze becomes an hour",
  "When your friend asks for your Netflix password",
  "Me reading one-star reviews for fun",
  "That moment when your jeans stop fitting",
  "When your tiny scratch sounds catastrophic",
  "Me trying to remember where I set my phone",
  "That moment when your lunch reheats unevenly",
  "When your alarm and dream sync perfectly",
  "Me pretending I didn't see the typo",
  "That moment when your weekend disappears instantly",
  "When your hoodie string escapes forever",
  "Me trying to choose one snack at store",
  "That moment when your printer works first try",
  "When your notes app saves your chaos",
  "Me checking lock screen every two minutes",
  "That moment when your group photo has eyes closed",
  "When your tiny task takes all day",
  "Me trying to leave voice note in public",
  "That moment when your checkout line stops moving",
  "When your friend says this will be quick",
  "Me staring at loading bar for motivation",
  "That moment when your AC sounds haunted",
  "When your smoothie separates instantly",
  "Me trying to be productive on Friday afternoon",
  "That moment when your app crashes before submit",
];

const getRounds = (state?: { rounds?: number }) => Math.max(1, Number(state?.rounds) || DEFAULT_ROUNDS);
const getNamePromptRounds = (state) => {
  const rounds = getRounds(state);
  const raw = Number(state?.namePromptRounds);
  if (!Number.isFinite(raw)) return Math.min(rounds, DEFAULT_NAME_PROMPT_ROUNDS);
  return Math.max(0, Math.min(rounds, Math.floor(raw)));
};
const getEligibleCompetitors = (playerCount: number, maxCompetitors: number) => {
  const capped = Math.min(playerCount, maxCompetitors);
  return capped % 2 === 0 ? capped : capped - 1;
};

const pickPrompts = (pool: string[], count: number) => {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  if (count <= shuffled.length) return shuffled.slice(0, count);
  const picked = [...shuffled];
  while (picked.length < count) picked.push(pool[Math.floor(Math.random() * pool.length)]);
  return picked;
};

const pickCycles = (rounds: number, namePromptRounds: number) => {
  const all = Array.from({ length: rounds }, (_, i) => i).sort(() => Math.random() - 0.5);
  return new Set(all.slice(0, Math.min(rounds, Math.max(0, namePromptRounds))));
};

const buildNamePrompt = (names: string[]) => {
  const uniq = Array.from(new Set(names.filter(Boolean))).slice(0, 3);
  const [a = "someone", b = "someone else", c = "the whole crew"] = uniq;
  const trio = uniq.length >= 3 ? `${a}, ${b}, and ${c}` : `${a} and ${b}`;
  const templates = [
    `When ${a} says "just one game"`,
    `Me watching ${a} and ${b} choose chaos`,
    `That moment when ${trio} share one brain cell`,
    `When ${a} and ${b} both think they're right`,
    `Me trying to keep up with ${trio}`,
    `That moment when ${a} starts and ${b} escalates`,
    `When ${trio} act like this was a good idea`,
    `Me after trusting ${a}'s "perfect" plan`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
};

const buildPromptsForPlan = (pool: string[], plan, rounds: number, namePromptRounds: number, playerNameById: Map<string, string>) => {
  const nameCycles = pickCycles(rounds, namePromptRounds);
  const nameSlots = plan.filter(p => nameCycles.has(p.cycle)).length;
  const standardPrompts = pickPrompts(pool, Math.max(0, plan.length - nameSlots));
  let standardIdx = 0;

  return plan.map((entry) => {
    if (!nameCycles.has(entry.cycle)) {
      const picked = standardPrompts[standardIdx];
      standardIdx += 1;
      return picked;
    }
    const names = (entry.participants || [])
      .map((id) => playerNameById.get(id) || "")
      .filter(Boolean);
    return buildNamePrompt(names);
  });
};

const buildRoundPlan = (playerIds: string[], rounds: number, maxCompetitors: number) => {
  const plan: Array<{ participants: string[]; cycle: number; heat: number; heatsInCycle: number }> = [];
  const cap = Math.max(2, getEligibleCompetitors(playerIds.length, maxCompetitors));

  for (let cycle = 0; cycle < rounds; cycle++) {
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    const groups: string[][] = [];
    for (let i = 0; i < shuffled.length; i += cap) groups.push(shuffled.slice(i, i + cap));

    const valid = groups
      .map(g => (g.length % 2 === 0 ? g : g.slice(0, -1)))
      .filter(g => g.length >= 2);

    const heatsInCycle = valid.length;
    valid.forEach((participants, heat) => {
      plan.push({ participants, cycle, heat, heatsInCycle });
    });
  }

  return plan;
};

const getRoundPlan = (state) =>
  Array.isArray(state?.roundPlan) ? state.roundPlan : [];

const getTotalVotingRounds = (state) =>
  Array.isArray(state?.prompts) ? state.prompts.length : 0;

const getAssignedRoundIndexes = (state, playerId: string) => {
  const plan = getRoundPlan(state);
  if (!plan.length) {
    const rounds = getRounds(state);
    return Array.from({ length: rounds }, (_, i) => i);
  }
  const idx: number[] = [];
  for (let i = 0; i < plan.length; i++) {
    if ((plan[i]?.participants || []).includes(playerId)) idx.push(i);
  }
  return idx;
};

const countSubmittedRounds = (arr: Array<{url:string, preview:string}> | undefined, indexes: number[]) =>
  indexes.reduce((sum, ri) => sum + (arr?.[ri] ? 1 : 0), 0);

const getEligibleForRound = (state, roundIndex: number) => {
  const subs = (state?.submissions || {}) as Record<string, Array<{url:string, preview:string}>>;
  return Object.entries(subs)
    .filter(([, arr]) => arr?.[roundIndex] != null)
    .map(([id]) => id);
};

const findNextVotableRound = (state, startIndex: number) => {
  const total = getTotalVotingRounds(state);
  for (let i = Math.max(0, startIndex); i < total; i++) {
    if (getEligibleForRound(state, i).length >= 2) return i;
  }
  return null;
};

const buildMatchupsFromEligible = (eligible: string[]) => {
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const matchups: [string, string][] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) matchups.push([shuffled[i], shuffled[i+1]]);
  return matchups;
};

// Each browser tab gets a unique ID (module-level, not React state)
const TAB_ID = Math.random().toString(36).slice(2, 10);

const genCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const rKey = c => `gifbattle:room:${c}`;
const vKey = (c, round, mi, pid) => `gifbattle:vote:${c}:${round}:${mi}:${pid}`;

// ── KV storage shim — calls /api/store instead of window.storage ──────────────
const storage = {
  get: async (key: string) => {
    const r = await fetch(`/api/store?key=${encodeURIComponent(key)}`);
    if (!r.ok) return null;
    return r.json(); // { value: string } | null
  },
  set: async (key: string, value: string) => {
    await fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  },
  del: async (key: string) => {
    await fetch(`/api/store?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  },
  delPrefix: async (prefix: string) => {
    await fetch(`/api/store?prefix=${encodeURIComponent(prefix)}`, { method: "DELETE" });
  },
};

// ── Giphy search ───────────────────────────────────────────────────────────────
async function searchGifs(q, apiKey, offset = 0) {
  if (!q.trim() || !apiKey) return [];
  try {
    const r = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=12&offset=${offset}&rating=pg-13`
    );
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).map(g => ({
      id: g.id,
      url: g.images?.fixed_height?.url || "",
      preview: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url || "",
    })).filter(g => g.url);
  } catch(e) { console.error(e); return []; }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const C = { bg:"#0d0d1a", card:"#16162a", card2:"#1e1e38", accent:"#f72585", text:"#e0e0ff", muted:"#6060a0", green:"#06d6a0", yellow:"#ffd166" };
const g: Record<string, CSSProperties> = {
  page: { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px", boxSizing:"border-box" },
  pageTop: { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Segoe UI',system-ui,sans-serif", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", padding:"20px 20px 40px", boxSizing:"border-box" },
  card: { background:C.card, borderRadius:20, padding:"24px 28px", width:"100%", maxWidth:500, boxShadow:"0 8px 40px rgba(0,0,0,0.5)" },
  wCard: { background:C.card, borderRadius:20, padding:"24px 28px", width:"100%", maxWidth:820, boxShadow:"0 8px 40px rgba(0,0,0,0.5)" },
  h1: { fontSize:34, fontWeight:900, margin:"0 0 6px", background:"linear-gradient(135deg,#f72585,#7209b7)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
  h2: { fontSize:22, fontWeight:800, margin:"0 0 14px" },
  sub: { color:C.muted, marginBottom:20, fontSize:14 },
  inp: { width:"100%", padding:"12px 16px", borderRadius:10, border:`1px solid ${C.muted}44`, background:C.card2, color:C.text, fontSize:15, boxSizing:"border-box", marginBottom:10, outline:"none" },
  btn: { padding:"13px 24px", borderRadius:10, border:"none", cursor:"pointer", fontSize:15, fontWeight:700, display:"block", width:"100%", marginBottom:10 },
  btnP: { background:"linear-gradient(135deg,#f72585,#7209b7)", color:"#fff" },
  btnS: { background:C.card2, color:C.text, border:`1px solid ${C.muted}55` },
  btnSm: { padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:700 },
  err: { color:"#f72585", fontSize:13, marginBottom:10, padding:"8px 12px", background:"#f7258511", borderRadius:8 },
  info: { color:C.muted, fontSize:13, marginBottom:10, padding:"8px 12px", background:C.card2, borderRadius:8 },
  divider: { textAlign:"center", color:C.muted, margin:"10px 0", fontSize:13 },
  row: { display:"flex", gap:10, alignItems:"center" },
  timer: { fontWeight:900, textAlign:"center", lineHeight:1 },
  prompt: { fontSize:20, fontWeight:700, textAlign:"center", lineHeight:1.4, padding:"14px 0", color:"#fff" },
  badge: { display:"inline-block", padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700 },
  pRow: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", background:C.card2, borderRadius:10, marginBottom:8 },
};

// ── GIF image with loading/error state ────────────────────────────────────────
function GifImg({ url, style={}, fit="cover" }) {
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState(false);
  return (
    <div style={{ position:"relative", background:C.card2, overflow:"hidden", ...style }}>
      {!ok && !err && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:12}}>Loading…</div>}
      {err && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:12}}>GIF unavailable</div>}
      <img src={url} alt="" onLoad={()=>setOk(true)} onError={()=>setErr(true)}
        style={{width:"100%",height:"100%",objectFit:fit as "cover"|"contain",display:ok?"block":"none"}} />
    </div>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const pid = TAB_ID;
  const envKey = typeof process !== "undefined" && process.env?.NEXT_PUBLIC_GIPHY_KEY || "";
  const [apiKey, setApiKey] = useState(envKey);
  const [view, setView] = useState(envKey ? "home" : "apikey");
  const [nick, setNick] = useState("");
  const [code, setCode] = useState("");
  const [joinIn, setJoinIn] = useState("");
  const [gs, setGs] = useState(null);
  const [err, setErr] = useState("");
  const pollRef = useRef(null);
  const transitioning = useRef(false);
  const lastGsJson = useRef<string | null>(null);

  const fetchGs = useCallback(async (c?: string) => {
    try {
      const r = await storage.get(rKey(c || code));
      if (r) {
        const s = JSON.parse(r.value);
        // Only call setGs when the state actually changed — avoids flicker during voting
        if (r.value !== lastGsJson.current) {
          lastGsJson.current = r.value;
          setGs(s);
        }
        return s;
      }
    } catch {}
    return null;
  }, [code]);

  const writeGs = useCallback(async (state, c?: string) => {
    try {
      const json = JSON.stringify(state);
      await storage.set(rKey(c || code), json);
      lastGsJson.current = json;
      setGs(state); return state;
    } catch { return null; }
  }, [code]);

  useEffect(() => {
    if (view === "game" && code) {
      pollRef.current = setInterval(() => fetchGs(), POLL_MS);
      return () => clearInterval(pollRef.current);
    }
  }, [view, code, fetchGs]);

  // Detect when this player has been kicked from the lobby
  useEffect(() => {
    if (gs && view === "game" && gs.phase === "lobby" && !gs.players.find(p => p.id === pid)) {
      leave();
    }
  }, [gs]);

  const leave = () => { clearInterval(pollRef.current); setView("home"); setGs(null); setCode(""); setErr(""); };

  if (view === "apikey") return (
    <ApiKeyScreen onSave={k => { setApiKey(k); setView("home"); }} />
  );

  if (view === "home") return (
    <HomeScreen nick={nick} setNick={setNick} joinIn={joinIn} setJoinIn={setJoinIn} err={err} setErr={setErr}
      onSettings={envKey ? null : () => setView("apikey")}
      onCreate={async () => {
        if (!nick.trim()) return setErr("Enter a nickname");
        const c = genCode();
        const s = {
          phase:"lobby", host:pid, code:c,
          players:[{id:pid,nickname:nick.trim(),score:0}],
          prompts:[], submissions:{}, doneSubmitting:[], votingRound:0,
          matchups:[], currentMatchup:0, roundMatchupWins:{},
          submitDeadline:null, voteDeadline:null, usedPrompts:[], roundPlan:[], maxCompetitors:4,
          submitSecs:SUBMIT_SECS, voteSecs:VOTE_SECS, rounds:DEFAULT_ROUNDS, namePromptRounds:DEFAULT_NAME_PROMPT_ROUNDS, customPrompts:[]
        };
        if (await writeGs(s, c)) { setCode(c); setView("game"); }
      }}
      onJoin={async () => {
        if (!nick.trim()) return setErr("Enter a nickname");
        const c = joinIn.trim().toUpperCase();
        if (c.length < 4) return setErr("Enter a valid room code");
        try {
          const r = await storage.get(rKey(c));
          if (!r) return setErr("Room not found");
          const s = JSON.parse(r.value);
          if (s.phase !== "lobby") return setErr("Game already in progress");
          if (s.players.length >= 12) return setErr("Room is full");
          if (!s.players.find(p => p.id === pid)) {
            s.players.push({ id:pid, nickname:nick.trim(), score:0 });
            await storage.set(rKey(c), JSON.stringify(s));
          }
          setCode(c); setGs(s); setView("game");
        } catch { setErr("Failed to join — check the code"); }
      }}
    />
  );

  if (!gs) return <div style={g.page}><div style={{color:C.muted}}>Loading…</div></div>;

  const isHost = gs.host === pid;

  const startGame = async () => {
    if (gs.players.length < 2) return alert("Need at least 2 players");
    const fresh = await fetchGs() || gs;
    const rounds = getRounds(fresh);
    const namePromptRounds = getNamePromptRounds(fresh);
    const pool = [...PROMPTS, ...(fresh.customPrompts || [])];
    if (pool.length === 0) return alert("No prompts available");
    const maxC = fresh.maxCompetitors ?? 4;
    const players = (fresh.players || []) as Array<{ id: string; nickname: string }>;
    const plan = buildRoundPlan(players.map(p => p.id), rounds, maxC);
    if (plan.length === 0) return alert("Not enough players to build matchups");
    const playerNameById = new Map(players.map(p => [p.id, p.nickname]));
    const prompts = buildPromptsForPlan(pool, plan, rounds, namePromptRounds, playerNameById);
    await writeGs({
      ...fresh, phase:"submitting", prompts, submissions:{}, doneSubmitting:[], votingRound:0,
      matchups:[], currentMatchup:0, roundMatchupWins:{}, voteDeadline:null, usedPrompts:[], roundPlan:plan,
      submitDeadline: Date.now() + (fresh.submitSecs ?? SUBMIT_SECS) * rounds * 1000
    });
  };

  const transitionToVoting = async (state) => {
    const vRound = findNextVotableRound(state, state.votingRound ?? 0);
    if (vRound == null) {
      await writeGs({ ...state, phase:"game_over" });
      return;
    }
    const eligible = getEligibleForRound(state, vRound);

    // 2-player game — everyone is a contestant, auto-tie
    if (state.players.length <= 2) {
      const rwins: Record<string, number> = {};
      eligible.forEach(id => { rwins[id] = 1; });
      const players = state.players.map(p => ({ ...p, score: p.score + (eligible.includes(p.id) ? 1 : 0) }));
      await writeGs({ ...state, votingRound:vRound, phase:"round_results", players, matchups:[[eligible[0], eligible[1]]], roundMatchupWins:rwins });
      return;
    }

    const matchups = buildMatchupsFromEligible(eligible);
    await writeGs({ ...state, votingRound:vRound, phase:"voting", matchups, currentMatchup:0, roundMatchupWins:{}, voteDeadline:Date.now()+(state.voteSecs??VOTE_SECS)*1000 });
  };

  const advanceMatchup = async (state) => {
    const mi = state.currentMatchup;
    const [lId, rId] = state.matchups[mi];
    let lv=0, rv=0;
    for (const p of state.players) {
      try { const r=await storage.get(vKey(state.code, state.votingRound, mi, p.id)); if(r){if(r.value==="left")lv++;else rv++;} } catch {}
    }
    const rwins: Record<string, number> = { ...state.roundMatchupWins };
    if (lv>rv) rwins[lId]=(rwins[lId]||0)+1;
    else if (rv>lv) rwins[rId]=(rwins[rId]||0)+1;
    else { rwins[lId]=(rwins[lId]||0)+1; rwins[rId]=(rwins[rId]||0)+1; }
    const next = mi+1;
    if (next >= state.matchups.length) {
      const maxW = Math.max(0,...(Object.values(rwins) as number[]));
      const winners = Object.entries(rwins).filter(([,w])=>w===maxW).map(([id])=>id);
      const players = state.players.map(p=>({...p,score:p.score+(rwins[p.id]||0)+(winners.includes(p.id)?3:0)}));
      await writeGs({...state,phase:"round_results",players,roundMatchupWins:rwins,currentMatchup:next});
    } else {
      await writeGs({...state,roundMatchupWins:rwins,currentMatchup:next,voteDeadline:Date.now()+(state.voteSecs??VOTE_SECS)*1000});
    }
  };

  const nextVotingRound = async () => {
    const fresh = await fetchGs() || gs;
    const nextVR = findNextVotableRound(fresh, (fresh.votingRound ?? 0) + 1);
    if (nextVR == null) return writeGs({ ...fresh, phase:"game_over" });
    const eligible = getEligibleForRound(fresh, nextVR);

    if (fresh.players.length <= 2) {
      const rwins: Record<string, number> = {};
      eligible.forEach(id => { rwins[id] = 1; });
      const players = fresh.players.map(p => ({ ...p, score: p.score + (eligible.includes(p.id) ? 1 : 0) }));
      await writeGs({ ...fresh, votingRound:nextVR, phase:"round_results", players, matchups:[[eligible[0], eligible[1]]], roundMatchupWins:rwins });
      return;
    }

    const matchups = buildMatchupsFromEligible(eligible);
    await writeGs({ ...fresh, votingRound:nextVR, phase:"voting", matchups, currentMatchup:0, roundMatchupWins:{}, voteDeadline:Date.now()+(fresh.voteSecs??VOTE_SECS)*1000 });
  };

  const sp = { gs, pid, code, isHost, apiKey, writeGs, fetchGs, transitioning, transitionToVoting, advanceMatchup, startGame, nextVotingRound, leave };
  return gs.phase==="lobby"?<Lobby {...sp}/>:gs.phase==="submitting"?<Submit {...sp}/>:gs.phase==="voting"?<Voting {...sp}/>:gs.phase==="round_results"?<RoundResults {...sp}/>:gs.phase==="game_over"?<GameOver {...sp}/>:null;
}

// ── API Key Screen ────────────────────────────────────────────────────────────
function ApiKeyScreen({ onSave }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const save = () => {
    if (!key.trim() || key.trim().length < 10) return setErr("Paste a valid Giphy API key");
    onSave(key.trim());
  };
  return (
    <div style={g.page}>
      <div style={g.card}>
        <div style={g.h1}>GIF Battle 🎭</div>
        <div style={g.sub}>A free Giphy API key is required to search GIFs</div>
        <div style={{background:C.card2,borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,lineHeight:1.8,color:C.muted}}>
          <div style={{color:C.text,fontWeight:700,marginBottom:4}}>Get your free key:</div>
          1. Go to <a href="https://developers.giphy.com" target="_blank" rel="noreferrer" style={{color:"#f72585"}}>developers.giphy.com</a><br/>
          2. Log in → <b style={{color:C.text}}>Create an App</b><br/>
          3. Choose <b style={{color:C.text}}>SDK</b> → fill in app name<br/>
          4. Copy the <b style={{color:C.text}}>API Key</b> from your dashboard<br/>
          <div style={{marginTop:8,fontSize:12,color:C.muted}}>💡 On Vercel, set <code style={{background:"#ffffff11",padding:"1px 5px",borderRadius:4}}>NEXT_PUBLIC_GIPHY_KEY</code> env var to skip this screen.</div>
        </div>
        {err && <div style={g.err}>⚠ {err}</div>}
        <input style={g.inp} placeholder="Paste Giphy API key…" value={key}
          onChange={e=>{setKey(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&save()} />
        <button style={{...g.btn,...g.btnP,marginBottom:0}} onClick={save}>✅ Save & Play</button>
      </div>
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
function HomeScreen({ nick, setNick, joinIn, setJoinIn, err, setErr, onCreate, onJoin, onSettings }) {
  return (
    <div style={g.page}>
      <div style={g.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={g.h1}>GIF Battle 🎭</div>
          {onSettings && <button onClick={onSettings} style={{...g.btnSm,background:"transparent",color:C.muted,fontSize:18}} title="Settings">⚙️</button>}
        </div>
        <div style={g.sub}>Pick GIFs. Vote for the funniest. Win eternal glory.</div>
        {err && <div style={g.err}>⚠ {err}</div>}
        <input style={g.inp} placeholder="Your nickname" value={nick} maxLength={20}
          onChange={e=>{setNick(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&onCreate()} />
        <button style={{...g.btn,...g.btnP}} onClick={onCreate}>🎲 Create Room</button>
        <div style={g.divider}>— or join with a code —</div>
        <input style={g.inp} placeholder="Room code (e.g. AB12)" value={joinIn} maxLength={6}
          onChange={e=>{setJoinIn(e.target.value.toUpperCase());setErr("");}} onKeyDown={e=>e.key==="Enter"&&onJoin()} />
        <button style={{...g.btn,...g.btnS,marginBottom:0}} onClick={onJoin}>🚪 Join Room</button>
      </div>
    </div>
  );
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function Lobby({ gs, pid, code, isHost, startGame, leave, writeGs }) {
  const [copied, setCopied] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [genError, setGenError] = useState("");

  // Anthropic key — stored in localStorage, host-only
  const [anthropicKey, setAnthropicKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("gifbattle_anthropic_key") || "";
    setAnthropicKey(saved);
    setKeyInput(saved);
  }, []);
  const saveKey = () => {
    const k = keyInput.trim();
    localStorage.setItem("gifbattle_anthropic_key", k);
    setAnthropicKey(k);
    setEditingKey(false);
    setGenError("");
  };
  const clearKey = () => {
    localStorage.removeItem("gifbattle_anthropic_key");
    setAnthropicKey("");
    setKeyInput("");
    setEditingKey(false);
  };
  const maskKey = (k: string) => k.length > 8 ? k.slice(0, 7) + "…" + k.slice(-4) : "••••••••";

  const copy = () => { try{navigator.clipboard.writeText(code);}catch{} setCopied(true); setTimeout(()=>setCopied(false),2000); };
  const maxC = gs.maxCompetitors ?? 4;
  const rounds = getRounds(gs);
  const namePromptRounds = getNamePromptRounds(gs);
  const playersInRound = getEligibleCompetitors(gs.players.length, gs.players.length);
  const heatsPerRound = playersInRound > 0 ? Math.ceil(playersInRound / maxC) : 0;
  const matchupsPerRound = Math.floor(playersInRound / 2);
  const nameRoundOptions = Array.from(new Set([0, 1, 2, 3, 5, 7, 10, rounds, namePromptRounds]))
    .filter(n => n >= 0 && n <= rounds)
    .sort((a, b) => a - b);
  const customPrompts: string[] = gs.customPrompts || [];

  const setMaxComp = async (n: number) => {
    if (!isHost) return;
    await writeGs({ ...gs, maxCompetitors: n });
  };

  const setSubmitSecs = async (n: number) => {
    if (!isHost) return;
    await writeGs({ ...gs, submitSecs: n });
  };

  const setVoteSecs = async (n: number) => {
    if (!isHost) return;
    await writeGs({ ...gs, voteSecs: n });
  };

  const setRounds = async (n: number) => {
    if (!isHost) return;
    await writeGs({ ...gs, rounds: n, namePromptRounds: Math.min(getNamePromptRounds(gs), n) });
  };

  const setNamePromptRounds = async (n: number) => {
    if (!isHost) return;
    await writeGs({ ...gs, namePromptRounds: Math.max(0, Math.min(rounds, n)) });
  };

  const kickPlayer = async (targetId: string) => {
    await writeGs({ ...gs, players: gs.players.filter(p => p.id !== targetId) });
  };

  const addPrompt = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || customPrompts.includes(trimmed)) return;
    await writeGs({ ...gs, customPrompts: [...customPrompts, trimmed] });
  };

  const removePrompt = async (text: string) => {
    await writeGs({ ...gs, customPrompts: customPrompts.filter(p => p !== text) });
  };

  const generatePrompts = async () => {
    setGenerating(true);
    setGenError("");
    setSuggestions([]);
    try {
      const res = await fetch("/api/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerNames: gs.players.map(p => p.nickname), apiKey: anthropicKey || undefined }),
      });
      const data = await res.json();
      if (data.error === "not configured") {
        setGenError("No API key set — enter your Anthropic key below");
        setEditingKey(true);
      } else if (data.error === "invalid key") {
        setGenError("Invalid API key — check and re-enter it below");
        setEditingKey(true);
      } else {
        setSuggestions(data.prompts || []);
      }
    } catch {
      setGenError("Failed to generate — check your connection");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={g.page}>
      <div style={g.card}>
        <div style={{...g.h1,marginBottom:4}}>Lobby</div>
        <div style={g.sub}>Share the code & wait for friends</div>
        <div style={{background:C.card2,borderRadius:12,padding:"12px 18px",marginBottom:18,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:2}}>ROOM CODE</div>
            <div style={{fontSize:36,fontWeight:900,letterSpacing:8,color:"#fff"}}>{code}</div>
          </div>
          <button style={{...g.btnSm,background:copied?C.green:C.accent,color:"#fff"}} onClick={copy}>{copied?"✓ Copied":"📋 Copy"}</button>
        </div>

        {/* Settings grid */}
        {(() => {
          const sSecs = gs.submitSecs ?? SUBMIT_SECS;
          const vSecs = gs.voteSecs ?? VOTE_SECS;
          const settingRow = (label: string, hint: string, options: number[], current: number, onPick: (n:number)=>void) => (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:6}}>
                {label}
                {!isHost && <span style={{marginLeft:6,color:C.text,fontWeight:700}}>{current}{hint}</span>}
              </div>
              {isHost && (
                <div style={{display:"flex",gap:6,marginBottom:4}}>
                  {options.map(n=>(
                    <button key={n} onClick={()=>onPick(n)} style={{
                      ...g.btnSm, flex:1,
                      background:current===n?"linear-gradient(135deg,#f72585,#7209b7)":C.card2,
                      color:current===n?"#fff":C.text,
                      border:current===n?"none":`1px solid ${C.muted}44`
                    }}>{n}{hint}</button>
                  ))}
                </div>
              )}
            </div>
          );
          return (
            <div style={{background:C.card2,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
              <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>GAME SETTINGS</div>
              {settingRow("ROUNDS", "", [3,5,7,10], rounds, setRounds)}
              {settingRow("NAME-BASED ROUNDS", "", nameRoundOptions, namePromptRounds, setNamePromptRounds)}
              {settingRow("GIFs PER HEAT", "", [2,4,6,8], maxC, setMaxComp)}
              <div style={{fontSize:12,color:C.muted,marginBottom:12,marginTop:-8}}>
                {`${heatsPerRound} heat${heatsPerRound!==1?"s":""}/round · ${matchupsPerRound} matchup${matchupsPerRound!==1?"s":""}/round · ${rounds} rounds`}
              </div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12,marginTop:-8}}>
                {`${matchupsPerRound*rounds} total voting screens`}
              </div>
              <div style={{fontSize:12,color:C.muted,marginBottom:12,marginTop:-8}}>
                {`${namePromptRounds} round${namePromptRounds!==1?"s":""} use player-name prompts (~${namePromptRounds*heatsPerRound} heat prompts)`}
              </div>
              {settingRow("SELECT TIME", "s", [30,60,90,120], sSecs, setSubmitSecs)}
              <div style={{fontSize:12,color:C.muted,marginBottom:12,marginTop:-8}}>
                {`${sSecs}s × ${rounds} questions = ${sSecs*rounds}s total to pick GIFs`}
              </div>
              {settingRow("VOTE TIME", "s", [8,12,20,30], vSecs, setVoteSecs)}
              <div style={{fontSize:12,color:C.muted,marginTop:-8}}>
                {`${vSecs}s per matchup`}
              </div>
              <div style={{fontSize:12,color:C.muted,marginTop:8}}>
                {`${PROMPTS.length} built-in questions + ${customPrompts.length} custom`}
              </div>
            </div>
          );
        })()}

        {/* Custom prompts section */}
        <div style={{background:C.card2,borderRadius:12,padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:12}}>
            CUSTOM PROMPTS {customPrompts.length > 0 ? `(${customPrompts.length})` : ""}
          </div>

          {/* Host controls */}
          {isHost && (
            <>
              <div style={{display:"flex",gap:8,marginBottom:10}}>
                <input
                  style={{...g.inp,marginBottom:0,flex:1}}
                  placeholder="Type your own prompt here…"
                  value={promptInput}
                  maxLength={120}
                  onChange={e => setPromptInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { addPrompt(promptInput); setPromptInput(""); } }}
                />
                <button
                  style={{...g.btnSm,background:C.accent,color:"#fff",whiteSpace:"nowrap"}}
                  onClick={() => { addPrompt(promptInput); setPromptInput(""); }}
                >
                  + Add
                </button>
              </div>

              {/* Anthropic key config */}
              <div style={{background:`${C.bg}88`,borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:6}}>ANTHROPIC API KEY</div>
                {!editingKey ? (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13,flex:1,color:anthropicKey?C.green:C.muted}}>
                      {anthropicKey ? "✓ " + maskKey(anthropicKey) : "Not set"}
                    </span>
                    <button onClick={()=>{setKeyInput(anthropicKey);setEditingKey(true);}}
                      style={{...g.btnSm,background:C.card2,color:C.text,border:`1px solid ${C.muted}44`}}>
                      {anthropicKey ? "Change" : "Set Key"}
                    </button>
                    {anthropicKey && (
                      <button onClick={clearKey}
                        style={{...g.btnSm,background:"#f7258518",color:C.accent,border:"none"}}>
                        Clear
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      style={{...g.inp,marginBottom:8,fontFamily:"monospace",fontSize:13}}
                      type="password"
                      placeholder="sk-ant-…"
                      value={keyInput}
                      onChange={e=>setKeyInput(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter")saveKey();if(e.key==="Escape"){setEditingKey(false);setKeyInput(anthropicKey);}}}
                      autoFocus
                    />
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={saveKey}
                        style={{...g.btnSm,flex:1,background:"linear-gradient(135deg,#f72585,#7209b7)",color:"#fff"}}>
                        Save
                      </button>
                      <button onClick={()=>{setEditingKey(false);setKeyInput(anthropicKey);}}
                        style={{...g.btnSm,background:C.card2,color:C.text,border:`1px solid ${C.muted}44`}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                style={{...g.btn,...g.btnS,marginBottom:8,opacity:generating?0.6:1}}
                onClick={generatePrompts}
                disabled={generating}
              >
                {generating ? "✨ Generating…" : "✨ Generate ideas from player names"}
              </button>

              {genError && <div style={g.err}>⚠ {genError}</div>}

              {suggestions.length > 0 && (
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8}}>AI SUGGESTIONS — click + to add:</div>
                  {suggestions.map((s, i) => {
                    const already = customPrompts.includes(s);
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                        <button
                          onClick={() => !already && addPrompt(s)}
                          disabled={already}
                          style={{
                            ...g.btnSm,
                            background:already?C.card2:"linear-gradient(135deg,#f72585,#7209b7)",
                            color:already?C.muted:"#fff",
                            border:already?`1px solid ${C.muted}44`:"none",
                            minWidth:32,
                          }}
                        >
                          {already ? "✓" : "+"}
                        </button>
                        <span style={{fontSize:13,color:already?C.muted:C.text}}>{s}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Added prompts list */}
          {customPrompts.length === 0 && !isHost && (
            <div style={{color:C.muted,fontSize:13}}>No custom prompts yet</div>
          )}
          {customPrompts.map((p, i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{color:C.muted,fontSize:13}}>•</span>
              <span style={{fontSize:13,flex:1,color:C.text}}>{p}</span>
              {isHost && (
                <button
                  onClick={() => removePrompt(p)}
                  style={{...g.btnSm,background:"#f7258518",color:C.accent,fontSize:11,padding:"3px 8px"}}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>PLAYERS ({gs.players.length}/12)</div>
        {gs.players.map(p=>(
          <div key={p.id} style={g.pRow}>
            <span style={{fontWeight:600}}>{p.nickname}</span>
            <div style={{...g.row,gap:6}}>
              {p.id===gs.host&&<span style={{...g.badge,background:"#f7258522",color:C.accent}}>HOST</span>}
              {p.id===pid&&<span style={{...g.badge,background:"#7209b722",color:"#b060ff"}}>YOU</span>}
              {isHost&&p.id!==pid&&(
                <button onClick={()=>kickPlayer(p.id)}
                  style={{...g.btnSm,background:"#f7258518",color:C.accent,fontSize:11,padding:"4px 10px"}}>
                  ✕ Kick
                </button>
              )}
            </div>
          </div>
        ))}
        <div style={{marginTop:16}}>
          {isHost
            ?<button style={{...g.btn,...g.btnP}} onClick={startGame}>{gs.players.length<2?"⏳ Need more players…":"🚀 Start Game"}</button>
            :<div style={{textAlign:"center",color:C.muted,padding:12,background:C.card2,borderRadius:10,marginBottom:10}}>⏳ Waiting for host to start…</div>}
          <button style={{...g.btn,...g.btnS,marginBottom:0}} onClick={leave}>← Leave</button>
        </div>
      </div>
    </div>
  );
}

// ── Submit ────────────────────────────────────────────────────────────────────
function Submit({ gs, pid, apiKey, writeGs, fetchGs, transitioning, transitionToVoting, isHost }) {
  const rounds = getRounds(gs);
  const subs = (gs.submissions || {}) as Record<string, Array<{url:string, preview:string}>>;
  const myAssignedRounds = getAssignedRoundIndexes(gs, pid);
  const mySubmissions = subs[pid];
  const myDoneCount = countSubmittedRounds(mySubmissions, myAssignedRounds);
  const myTargetCount = myAssignedRounds.length;
  const currentRoundIndex = myAssignedRounds.find(ri => mySubmissions?.[ri] == null) ?? null;
  const isDone = currentRoundIndex == null || myDoneCount >= myTargetCount;
  const currentMeta = currentRoundIndex == null ? null : getRoundPlan(gs)[currentRoundIndex];

  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Array<{id:string,url:string,preview:string}>>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [sel, setSel] = useState<{id:string,url:string,preview:string}|null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const searchQ = useRef<ReturnType<typeof setTimeout>|null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const advanced = useRef(false);

  // Shared countdown timer — runs in both active and waiting views
  const [t, setT] = useState(Math.max(0, Math.ceil(((gs.submitDeadline ?? 0) - Date.now()) / 1000)));
  const tc = t <= 15 ? C.accent : t <= 30 ? C.yellow : C.green;

  useEffect(() => {
    advanced.current = false;
    timerRef.current = setInterval(() => {
      const v = Math.max(0, Math.ceil(((gs.submitDeadline ?? 0) - Date.now()) / 1000));
      setT(v);
      if (v <= 0 && isHost && !advanced.current && !transitioning.current) {
        advanced.current = true;
        transitioning.current = true;
        clearInterval(timerRef.current!);
        fetchGs().then(f => transitionToVoting(f || gs).finally(() => { transitioning.current = false; }));
      }
    }, 400);
    return () => clearInterval(timerRef.current!);
  }, [gs.submitDeadline]);

  // Reset search state whenever the player advances to the next prompt
  useEffect(() => {
    setQuery("");
    setGifs([]);
    setOffset(0);
    setHasMore(false);
    setSel(null);
    setSearchErr("");
  }, [currentRoundIndex]);

  const doSearch = async (q: string) => {
    setGifs([]);
    setOffset(0);
    setHasMore(false);
    setSearching(true);
    setSearchErr("");
    const r = await searchGifs(q, apiKey, 0);
    if (!r.length) setSearchErr("No results — try different keywords");
    setGifs(r);
    setHasMore(r.length === 12);
    setSearching(false);
  };

  const loadMore = useCallback(async () => {
    if (searching || !hasMore || !query.trim()) return;
    const newOffset = offset + 12;
    setSearching(true);
    const r = await searchGifs(query, apiKey, newOffset);
    setGifs(prev => [...prev, ...r]);
    setOffset(newOffset);
    setHasMore(r.length === 12);
    setSearching(false);
  }, [searching, hasMore, offset, query, apiKey]);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  // Infinite scroll via IntersectionObserver on the sentinel element
  useEffect(() => {
    if (!sentinelRef.current || !scrollRef.current || !hasMore || searching) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMoreRef.current(); },
      { root: scrollRef.current, threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, searching, gifs.length]);

  const onQ = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(searchQ.current!);
    if (v.trim().length > 1) searchQ.current = setTimeout(() => doSearch(v), 500);
    else { setGifs([]); setHasMore(false); setOffset(0); }
  };

  const submit = async () => {
    if (!sel || currentRoundIndex == null) return;
    const fresh = await fetchGs() || gs;
    const existing = ((fresh.submissions || {}) as Record<string, Array<{url:string,preview:string}>>)[pid] || [];
    const freshAssignedRounds = getAssignedRoundIndexes(fresh, pid);
    const submitAt = freshAssignedRounds.find(ri => existing?.[ri] == null);
    if (submitAt == null) return;
    const newArr = [...existing];
    newArr[submitAt] = { url: sel.url, preview: sel.preview };
    const newSubmissions = { ...fresh.submissions, [pid]: newArr };
    const prevDone: string[] = fresh.doneSubmitting || [];
    const nowDone = countSubmittedRounds(newArr, freshAssignedRounds) >= freshAssignedRounds.length;
    const newDone = nowDone
      ? [...prevDone.filter(id => id !== pid), pid]
      : prevDone.filter(id => id !== pid);
    const newState = { ...fresh, submissions: newSubmissions, doneSubmitting: newDone };
    const requiredDone = fresh.players
      .filter(p => getAssignedRoundIndexes(fresh, p.id).length > 0)
      .every(p => (p.id === pid ? nowDone : newDone.includes(p.id)));

    if (requiredDone && !transitioning.current) {
      transitioning.current = true;
      try { await transitionToVoting(newState); }
      finally { transitioning.current = false; }
    } else {
      await writeGs(newState);
    }
  };

  const forceStart = async () => {
    if (transitioning.current) return;
    transitioning.current = true;
    try {
      const fresh = await fetchGs() || gs;
      await transitionToVoting(fresh);
    } finally { transitioning.current = false; }
  };

  // Waiting screen — this player finished all their submissions
  if (isDone) {
    return (
      <div style={g.page}>
        <div style={g.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:13,color:C.muted}}>Time remaining</div>
            <div style={{...g.timer,fontSize:28,color:tc}}>{t}s</div>
          </div>
          <div style={{textAlign:"center",marginBottom:18}}>
            <div style={{fontSize:40}}>✅</div>
            <div style={g.h2}>All done! Waiting for others…</div>
            <div style={{color:C.muted,fontSize:13}}>Voting starts when everyone finishes or time runs out</div>
          </div>
          {gs.players.map(p => {
            const pSubs = subs[p.id];
            const pAssigned = getAssignedRoundIndexes(gs, p.id);
            const count = countSubmittedRounds(pSubs, pAssigned);
            const done = count >= pAssigned.length && pAssigned.length > 0;
            return (
              <div key={p.id} style={g.pRow}>
                <span style={{fontWeight:600}}>{p.nickname}{p.id===pid?" (you)":""}</span>
                <span style={{color:done?C.green:C.muted,fontSize:13,fontWeight:600}}>
                  {done?"✅ Done":`⏳ ${count}/${pAssigned.length || rounds}`}
                </span>
              </div>
            );
          })}
          {isHost && (
            <button style={{...g.btn,...g.btnP,marginTop:8,marginBottom:0}} onClick={forceStart}>
              ⚡ Force Start Voting
            </button>
          )}
        </div>
      </div>
    );
  }

  // Active submission screen
  const currentPrompt = currentRoundIndex == null ? "" : (gs.prompts as string[])?.[currentRoundIndex] ?? "";
  return (
    <div style={g.pageTop}>
      <div style={{...g.wCard,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:13,color:C.muted}}>
            {`Question ${myDoneCount+1} / ${myTargetCount}`}
            {currentMeta ? ` · Round ${currentMeta.cycle + 1}/${rounds} · Heat ${currentMeta.heat + 1}/${currentMeta.heatsInCycle}` : ""}
          </div>
          <div style={{...g.timer,fontSize:28,color:tc}}>{t}s</div>
        </div>
        <div style={g.prompt}>"{currentPrompt}"</div>
        <input style={g.inp} placeholder="🔍 Search for a GIF…" value={query} onChange={onQ} autoFocus/>
        {gifs.length > 0 && (
          <div ref={scrollRef} style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,maxHeight:300,overflowY:"auto",marginBottom:12}}>
            {gifs.map(gif => (
              <div key={gif.id} onClick={() => setSel(gif)}
                style={{position:"relative",paddingBottom:"100%",borderRadius:8,overflow:"hidden",
                  border:sel?.id===gif.id?`3px solid ${C.accent}`:"3px solid transparent",cursor:"pointer"}}>
                <div style={{position:"absolute",inset:0}}>
                  <GifImg url={gif.preview} style={{width:"100%",height:"100%"}} fit="contain"/>
                </div>
              </div>
            ))}
            {hasMore && !searching && (
              <div ref={sentinelRef} style={{height:20,gridColumn:"1 / -1"}}/>
            )}
          </div>
        )}
        {searching && <div style={g.info}>🔍 Searching…</div>}
        {searchErr && !searching && <div style={g.err}>⚠ {searchErr}</div>}
        {sel && (
          <div style={{textAlign:"center",marginBottom:12}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:6}}>SELECTED</div>
            <GifImg url={sel.preview} style={{width:200,height:150,borderRadius:8,margin:"0 auto",border:`2px solid ${C.accent}`}}/>
          </div>
        )}
        <button style={{...g.btn,...(sel?g.btnP:{background:C.card2,color:C.muted}),cursor:sel?"pointer":"not-allowed",marginBottom:0}}
          onClick={submit} disabled={!sel}>
          {sel?"✅ Submit GIF":"Select a GIF first"}
        </button>
      </div>
    </div>
  );
}

// ── Voting ────────────────────────────────────────────────────────────────────
function Voting({ gs, pid, code, isHost, fetchGs, writeGs, transitioning, advanceMatchup }) {
  const rounds = getRounds(gs);
  const meta = getRoundPlan(gs)[gs.votingRound];
  const mi = gs.currentMatchup;
  const matchup = gs.matchups?.[mi];
  const [t, setT] = useState(Math.max(0,Math.ceil((gs.voteDeadline-Date.now())/1000)));
  const [myVote, setMyVote] = useState(null);
  const [showRes, setShowRes] = useState(false);
  const [lv, setLv] = useState(0); const [rv, setRv] = useState(0);
  const timerRef = useRef(null);
  const advRef = useRef(false);

  useEffect(()=>{
    let active=true;
    storage.get(vKey(code, gs.votingRound, mi, pid)).then(r=>{if(active&&r)setMyVote(r.value);}).catch(()=>{});
    return()=>{active=false;};
  },[mi, gs.votingRound]);

  useEffect(()=>{
    advRef.current=false; setShowRes(false); setMyVote(null);
    setT(Math.max(0,Math.ceil((gs.voteDeadline-Date.now())/1000)));
    timerRef.current=setInterval(async()=>{
      const v=Math.max(0,Math.ceil((gs.voteDeadline-Date.now())/1000));
      setT(v);
      if(v<=0){
        clearInterval(timerRef.current);
        if(!showRes){
          let l=0,r2=0;
          for(const p of gs.players){
            try{const res=await storage.get(vKey(code, gs.votingRound, mi, p.id));if(res){if(res.value==="left")l++;else r2++;}}catch{}
          }
          setLv(l);setRv(r2);setShowRes(true);
          if(isHost&&!advRef.current&&!transitioning.current){
            advRef.current=true;transitioning.current=true;
            setTimeout(async()=>{
              const fresh=await fetchGs()||gs;
              await advanceMatchup(fresh);transitioning.current=false;
            },2500);
          }
        }
      }
    },400);
    return()=>clearInterval(timerRef.current);
  },[gs.voteDeadline,mi]);

  if(!matchup) return <div style={g.page}><div style={{color:C.muted}}>Tallying…</div></div>;

  const [lId,rId]=matchup;
  const inMatchup=pid===lId||pid===rId;
  const canVote=!inMatchup&&!myVote&&!showRes;

  const vote=async(side)=>{
    if(!canVote)return;
    await storage.set(vKey(code, gs.votingRound, mi, pid), side);
    setMyVote(side);
    // After voting, check if every eligible voter has now voted — if so, collapse the timer
    // for all clients by writing voteDeadline = now - 1 (the host's interval detects v=0)
    const voterIds = gs.players.filter(p => p.id !== lId && p.id !== rId).map(p => p.id);
    if (voterIds.length > 0) {
      let allDone = true;
      for (const vid of voterIds) {
        try { const r = await storage.get(vKey(code, gs.votingRound, mi, vid)); if (!r) { allDone = false; break; } }
        catch { allDone = false; break; }
      }
      if (allDone) await writeGs({ ...gs, voteDeadline: Date.now() - 1000 });
    }
  };

  const vSecs = gs.voteSecs ?? VOTE_SECS;
  const tc=t<=vSecs*0.35?C.accent:t<=vSecs*0.65?C.yellow:C.green;
  const subs = (gs.submissions || {}) as Record<string, Array<{url:string, preview:string}>>;
  const lSub = subs[lId]?.[gs.votingRound];
  const rSub = subs[rId]?.[gs.votingRound];
  const currentPrompt = (gs.prompts as string[])?.[gs.votingRound] ?? "";

  const GifCard=({sub,id,side})=>{
    const isWinner=showRes&&(side==="left"?lv>rv:rv>lv);
    const isTie=showRes&&lv===rv;
    const myVoteThis=myVote===side;
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
        <div style={{borderRadius:12,overflow:"hidden",width:"100%",
          border:showRes?isWinner?`3px solid ${C.green}`:isTie?`3px solid ${C.yellow}`:"3px solid transparent"
            :myVoteThis?`3px solid ${C.accent}`:"3px solid transparent"}}>
          {sub
            ?<GifImg url={sub.url} style={{width:"100%",height:220}}/>
            :<div style={{height:220,background:C.card2,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted}}>No GIF</div>}
        </div>
        {showRes&&<div style={{fontWeight:700,fontSize:17,color:isWinner?C.green:isTie?C.yellow:C.muted}}>{side==="left"?lv:rv} vote{(side==="left"?lv:rv)!==1?"s":""}{isWinner?" 🏆":isTie?" 🤝":""}</div>}
        {!showRes&&canVote&&<button onClick={()=>vote(side)} style={{...g.btn,...g.btnP,marginBottom:0}}>{side==="left"?"👈 This one":"This one 👉"}</button>}
        {!showRes&&id===pid&&<div style={{color:C.yellow,fontSize:13,fontWeight:600}}>⭐ Your GIF</div>}
        {!showRes&&myVoteThis&&id!==pid&&<div style={{color:C.accent,fontSize:13,fontWeight:600}}>✅ Voted</div>}
      </div>
    );
  };

  return(
    <div style={g.pageTop}>
      <div style={{...g.wCard,marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{fontSize:13,color:C.muted}}>
            {meta
              ? `Round ${meta.cycle + 1}/${rounds} · Heat ${meta.heat + 1}/${meta.heatsInCycle} · Matchup ${mi+1}/${gs.matchups.length}`
              : `Round ${gs.votingRound+1} / ${rounds} · Matchup ${mi+1}/${gs.matchups.length}`}
          </div>
          <div style={{...g.timer,fontSize:34,color:tc}}>{t}s</div>
        </div>
        <div style={g.prompt}>"{currentPrompt}"</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:12}}>
          <GifCard sub={lSub} id={lId} side="left"/>
          <GifCard sub={rSub} id={rId} side="right"/>
        </div>
        <div style={{textAlign:"center",color:C.muted,fontSize:13}}>
          {showRes?(lv>rv?"Left wins! ✨":rv>lv?"Right wins! ✨":"Tie! Both get a point 🤝")+" Next up soon…"
            :inMatchup?"Your GIF is in this matchup — sit tight!"
            :myVote?"Vote cast! Waiting for timer…":"Vote for the funnier GIF!"}
        </div>
      </div>
    </div>
  );
}

// ── Round Results ─────────────────────────────────────────────────────────────
function RoundResults({ gs, isHost, nextVotingRound, transitioning }) {
  const rounds = getRounds(gs);
  const totalVotingRounds = getTotalVotingRounds(gs);
  const meta = getRoundPlan(gs)[gs.votingRound];
  const nextMeta = getRoundPlan(gs)[(gs.votingRound ?? 0) + 1];
  const sorted=[...gs.players].sort((a,b)=>b.score-a.score);
  const maxW=Math.max(0,...(Object.values(gs.roundMatchupWins||{}) as number[]));
  const rWinners=Object.entries(gs.roundMatchupWins||{}).filter(([,w])=>w===maxW).map(([id])=>id);
  const rWinnerNames=rWinners.map(id=>gs.players.find(p=>p.id===id)?.nickname).filter(Boolean);
  const isLast = (gs.votingRound ?? 0) + 1 >= totalVotingRounds;
  const [t, setT] = useState(RESULTS_SECS);
  const advRef = useRef(false);

  useEffect(() => {
    advRef.current = false;
    let remaining = RESULTS_SECS;
    setT(remaining);
    const interval = setInterval(() => {
      remaining -= 1;
      setT(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        if (isHost && !advRef.current && !transitioning.current) {
          advRef.current = true;
          transitioning.current = true;
          nextVotingRound().finally(() => { transitioning.current = false; });
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gs.votingRound]);

  return(
    <div style={g.page}>
      <div style={g.card}>
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{fontSize:40}}>🏆</div>
          <div style={g.h2}>
            {meta
              ? `Round ${meta.cycle + 1}/${rounds} · Heat ${meta.heat + 1}/${meta.heatsInCycle} Results`
              : `Round ${(gs.votingRound ?? 0) + 1} Results`}
          </div>
          {rWinnerNames.length>0&&<div style={{color:C.yellow,fontWeight:700}}>{rWinnerNames.join(" & ")} won this round!</div>}
        </div>
        <Scoreboard players={sorted} highlightIds={rWinners}/>
        <div style={{marginTop:16,textAlign:"center"}}>
          <div style={{color:C.muted,fontSize:13,marginBottom:10}}>
            {isLast
              ? `Final results in ${t}s…`
              : nextMeta
                ? `Round ${nextMeta.cycle + 1}/${rounds} · Heat ${nextMeta.heat + 1}/${nextMeta.heatsInCycle} starts in ${t}s…`
                : `Next round starts in ${t}s…`}
          </div>
          {isHost && (
            <button style={{...g.btn,...g.btnP,marginBottom:0}} onClick={() => {
              if (advRef.current || transitioning.current) return;
              advRef.current = true; transitioning.current = true;
              nextVotingRound().finally(() => { transitioning.current = false; });
            }}>{isLast ? "🎉 Show Results Now" : "▶ Skip Wait"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Game Over ─────────────────────────────────────────────────────────────────
function GameOver({ gs, writeGs, pid }) {
  const rounds = getRounds(gs);
  const sorted=[...gs.players].sort((a,b)=>b.score-a.score);
  const medals=["🥇","🥈","🥉"];
  const prompts = (gs.prompts || []) as string[];
  const subs = (gs.submissions || {}) as Record<string, Array<{url:string, preview:string}>>;
  const plan = getRoundPlan(gs);
  const playerNameById = new Map<string, string>(
    ((gs.players || []) as Array<{ id: string; nickname: string }>).map((p) => [p.id, p.nickname])
  );
  const summaryRows = (plan.length ? plan.map((entry, idx) => ({
    idx,
    cycle: (entry?.cycle ?? idx),
    heat: (entry?.heat ?? 0),
    heatsInCycle: (entry?.heatsInCycle ?? 1),
    participants: (entry?.participants || []) as string[],
    prompt: prompts[idx] || "",
  })) : prompts.map((prompt, idx) => ({
    idx,
    cycle: idx,
    heat: 0,
    heatsInCycle: 1,
    participants: (gs.players || []).map(p => p.id),
    prompt,
  })));

  const playAgain=async()=>{
    // Best-effort: delete all vote keys for this game before resetting
    storage.delPrefix(`gifbattle:vote:${gs.code}:`).catch(()=>{});
    await writeGs({
      ...gs, phase:"lobby",
      players:gs.players.map(p=>({...p,score:0})),
      prompts:[], submissions:{}, doneSubmitting:[], votingRound:0,
      matchups:[], currentMatchup:0, roundMatchupWins:{}, submitDeadline:null, voteDeadline:null, usedPrompts:[], roundPlan:[],
      rounds: getRounds(gs),
      namePromptRounds: getNamePromptRounds(gs),
      customPrompts: gs.customPrompts || []
    });
  };
  return(
    <div style={g.pageTop}>
      <div style={{...g.wCard,marginTop:20}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:52}}>🎊</div>
          <div style={g.h1}>Game Over!</div>
          <div style={{color:C.yellow,fontWeight:700,fontSize:18,marginTop:4}}>{sorted[0]?.nickname} wins!</div>
        </div>
        <div style={{marginBottom:18}}>
          {sorted.map((p,i)=>(
            <div key={p.id} style={{...g.pRow,background:i===0?"#f7258514":C.card2,borderLeft:i===0?`3px solid ${C.accent}`:"3px solid transparent"}}>
              <div style={g.row}>
                <span style={{fontSize:20}}>{medals[i]||"🎖"}</span>
                <span style={{fontWeight:i===0?800:500}}>{p.nickname}</span>
                {p.id===pid&&<span style={{...g.badge,background:"#7209b722",color:"#b060ff",fontSize:10}}>YOU</span>}
              </div>
              <span style={{fontWeight:800,color:i===0?C.accent:C.text}}>{p.score} pts</span>
            </div>
          ))}
        </div>

        <div style={{background:C.card2,borderRadius:12,padding:"14px 16px",marginBottom:18}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:10}}>GAME SUMMARY</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
            {`${summaryRows.length} heat${summaryRows.length!==1?"s":""} played across ${rounds} round${rounds!==1?"s":""}`}
          </div>
          {summaryRows.map(row => (
            <div key={row.idx} style={{background:`${C.bg}88`,borderRadius:10,padding:"12px 12px 10px",marginBottom:10}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>
                {`Round ${row.cycle + 1}/${rounds} · Heat ${row.heat + 1}/${row.heatsInCycle}`}
              </div>
              <div style={{fontSize:16,fontWeight:700,marginBottom:10,color:"#fff"}}>
                "{row.prompt || "No prompt"}"
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
                {row.participants.map((playerId) => {
                  const sub = subs[playerId]?.[row.idx];
                  const nick = playerNameById.get(playerId) || "Player";
                  return (
                    <div key={`${row.idx}-${playerId}`} style={{background:C.card,borderRadius:8,padding:"8px"}}>
                      <div style={{fontSize:12,fontWeight:700,marginBottom:6}}>{nick}</div>
                      {sub?.url
                        ? <GifImg url={sub.url} style={{height:130,borderRadius:6}} fit="cover"/>
                        : <div style={{height:130,background:C.card2,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:12}}>No GIF</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button style={{...g.btn,...g.btnP,marginBottom:0}} onClick={playAgain}>🔄 Play Again</button>
      </div>
    </div>
  );
}

function Scoreboard({players,highlightIds=[]}){
  const sorted=[...players].sort((a,b)=>b.score-a.score);
  return(
    <div>
      <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8}}>SCOREBOARD</div>
      {sorted.map((p,i)=>(
        <div key={p.id} style={{...g.pRow,background:highlightIds.includes(p.id)?`${C.yellow}18`:C.card2}}>
          <div style={{...g.row,gap:8}}>
            <span style={{color:C.muted,width:18,fontSize:13}}>{i+1}.</span>
            <span style={{fontWeight:500}}>{p.nickname}</span>
            {highlightIds.includes(p.id)&&<span>⭐</span>}
          </div>
          <span style={{fontWeight:700,color:i===0?C.accent:C.text}}>{p.score} pts</span>
        </div>
      ))}
    </div>
  );
}
