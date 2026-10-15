"use client";

import React, { useState, useEffect, useRef, useCallback, useContext, CSSProperties } from "react";

import { recordStockEvent } from "@/lib/media/stock-metrics";
import {catalogSeed} from '@/lib/media/catalog-seed';
import { MemeEditor, CreatedMeme } from "./meme-editor";
import { LocalPicks } from "./local-picks";
import { MediaCredit } from "./media-credit";
import { safeHttps } from "@/lib/media/catalog-schema.cjs";

import { hostGraceMs, heartbeatIsFresh } from "@/lib/host-presence";
import { ANSWER_MODE_POLICY, CHOICE_MODE_POLICY, getAnswerMode, modeForCycle, answerModeLabels, isChoiceMode, submissionAllowedForQuestion } from "@/lib/answer-modes";
import { MediaResult, RemoteProvider, ProviderError } from "@/lib/media/types";
import { enabledProviders, primaryProvider, providerLabels } from "@/lib/media/provider-config";
import { searchMedia, reportMediaSelection } from "@/lib/media/search";

const POLL_MS = 2000;
const DEFAULT_ROUNDS = 3;    // prompts each player submits for
const DEFAULT_NAME_PROMPT_ROUNDS = 1;
const VOTE_SECS = 12;        // seconds per voting matchup
const SUBMIT_SECS = 60;      // seconds per GIF question (total = SUBMIT_SECS * rounds)
const RESULTS_SECS = 5;      // seconds to show round results before auto-advancing
const NOTICE_MS = 5000;

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

const pickPrompts = (pool: string[], count: number, avoid: string[] = []) => {
  const avoidSet = new Set(avoid.filter(Boolean));
  const preferred = pool.filter((p) => !avoidSet.has(p));
  const preferredShuffled = [...preferred].sort(() => Math.random() - 0.5);
  const allShuffled = [...pool].sort(() => Math.random() - 0.5);

  if (count <= preferredShuffled.length) return preferredShuffled.slice(0, count);

  const picked = [...preferredShuffled];
  for (const candidate of allShuffled) {
    if (picked.length >= count) break;
    if (!picked.includes(candidate)) picked.push(candidate);
  }
  while (picked.length < count && pool.length > 0) {
    picked.push(pool[Math.floor(Math.random() * pool.length)]);
  }
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

const buildPromptsForPlan = (
  pool: string[],
  plan,
  rounds: number,
  namePromptRounds: number,
  playerNameById: Map<string, string>,
  customPromptPool: string[] = [],
  recentPrompts: string[] = []
) => {
  const nameCycles = pickCycles(rounds, namePromptRounds);
  const nameSlots = plan.filter(p => nameCycles.has(p.cycle)).length;
  const standardPrompts = pickPrompts(pool, Math.max(0, plan.length - nameSlots), recentPrompts);
  let standardIdx = 0;

  const pickedPrompts = plan.map((entry) => {
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

  if (customPromptPool.length === 0) return pickedPrompts;
  const customSet = new Set(customPromptPool);
  if (pickedPrompts.some((p) => customSet.has(p))) return pickedPrompts;

  const standardIndex = plan.findIndex((entry) => !nameCycles.has(entry.cycle));
  const fallbackIndex = standardIndex >= 0 ? standardIndex : 0;
  const forcedCustom = customPromptPool[Math.floor(Math.random() * customPromptPool.length)];
  pickedPrompts[fallbackIndex] = forcedCustom;
  return pickedPrompts;
};

const buildRoundPlan = (playerIds: string[], rounds: number, maxCompetitors: number) => {
  const plan: Array<{ participants: string[]; cycle: number; heat: number; heatsInCycle: number; answerMode: string }> = [];
  const cap = Math.max(2, getEligibleCompetitors(playerIds.length, maxCompetitors));
  const baseOrder = [...playerIds].sort(() => Math.random() - 0.5);
  const rotate = <T,>(arr: T[], shift: number) => {
    if (arr.length === 0) return arr;
    const n = ((shift % arr.length) + arr.length) % arr.length;
    return [...arr.slice(n), ...arr.slice(0, n)];
  };

  for (let cycle = 0; cycle < rounds; cycle++) {
    const shuffled = rotate(baseOrder, cycle);
    const groups: string[][] = [];
    for (let i = 0; i < shuffled.length; i += cap) groups.push(shuffled.slice(i, i + cap));

    const valid = groups
      .map(g => (g.length % 2 === 0 ? g : g.slice(0, -1)))
      .filter(g => g.length >= 2);

    const heatsInCycle = valid.length;
    valid.forEach((participants, heat) => {
      plan.push({ participants, cycle, heat, heatsInCycle, answerMode: modeForCycle(cycle, enabledProviders.length > 0) });
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

const countSubmittedRounds = (arr: Array<Submission> | undefined, indexes: number[]) =>
  indexes.reduce((sum, ri) => sum + (arr?.[ri] ? 1 : 0), 0);

const getEligibleForRound = (state, roundIndex: number) => {
  const subs = (state?.submissions || {}) as Record<string, Array<Submission>>;
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
const PID_STORAGE_KEY = "gifbattle_pid";
const NICK_STORAGE_KEY = "gifbattle_nick";
const LAST_ROOM_STORAGE_KEY = "gifbattle_last_room";
const ROOM_TOKEN_KEY_PREFIX = "gifbattle_room_token:";
const getStablePid = () => {
  if (typeof window === "undefined") return Math.random().toString(36).slice(2, 10);
  try {
    const saved = localStorage.getItem(PID_STORAGE_KEY);
    if (saved) return saved;
    const next = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(PID_STORAGE_KEY, next);
    return next;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
};
const TAB_ID = getStablePid();

const rKey = c => `gifbattle:room:${c}`;
const vKey = (c, round, mi, pid) => `gifbattle:vote:${c}:${round}:${mi}:${pid}`;
const hbKey = c => `gifbattle:hb:${c}`;
const roomTokenKey = (code: string) => `${ROOM_TOKEN_KEY_PREFIX}${code}`;
const getRoomToken = (code: string) => {
  if (!code) return "";
  try { return localStorage.getItem(roomTokenKey(code)) || ""; } catch { return ""; }
};
const setRoomToken = (code: string, token: string) => {
  if (!code) return;
  try { localStorage.setItem(roomTokenKey(code), token || ""); } catch {}
};
const clearRoomToken = (code: string) => {
  if (!code) return;
  try { localStorage.removeItem(roomTokenKey(code)); } catch {}
};

// ── KV storage shim — calls /api/store instead of window.storage ──────────────
const storage = {
  get: async (key: string) => {
    const r = await fetch(`/api/store?key=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error(`store_read_failed:${r.status}`);
    return r.json(); // { value: string } | null
  },
  set: async (key: string, value: string) => {
    const r = await fetch("/api/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!r.ok) throw new Error(`store_set_failed:${r.status}`);
  },
  del: async (key: string) => {
    const r = await fetch(`/api/store?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!r.ok) throw new Error(`store_del_failed:${r.status}`);
  },
};

// ── Submission type ────────────────────────────────────────────────────────────
type Submission = {
  type?: "giphy" | "media" | "text" | "ai" | "meme";
  source?: "giphy" | "klipy" | "local";
  assetId?: string;
  templateId?: string;
  captions?: string[];
  mediaFormat?: "image" | "animation";
  attribution?: MediaResult["attribution"];
  license?: MediaResult["license"];
  url?: string;
  preview?: string;
  textAnswer?: string;
};

// ── Styles ────────────────────────────────────────────────────────────────────
// Fight-card palette: warm ink neutrals, red corner (left answer) vs blue corner (right answer),
// and poster yellow (hi) reserved for primary actions and the VS stamp.
const DARK = { bg:"#14120F", card:"#1D1A16", card2:"#28241F", accent:"#E2402F", blue:"#4A80F0", text:"#F2EDE4", muted:"#8A8278", green:"#52B86E", yellow:"#F2B935", hi:"#FFC93C", onHi:"#14120F" };
const LIGHT = { bg:"#E9E7E3", card:"#FAFAF8", card2:"#E0DDD8", accent:"#C8321F", blue:"#1F5BD1", text:"#1A1714", muted:"#6B655D", green:"#1E7A3E", yellow:"#946400", hi:"#FFC93C", onHi:"#14120F" };
const FONT_DISPLAY = "'Big Shoulders Display', 'Arial Narrow', sans-serif";
const FONT_MONO = "'Space Mono', monospace";
const FONT_BODY = "'DM Sans', system-ui, sans-serif";
const makeStyles = (C: typeof DARK): Record<string, CSSProperties> => ({
  page: { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:FONT_BODY, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"20px" },
  pageTop: { minHeight:"100vh", background:C.bg, color:C.text, fontFamily:FONT_BODY, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"flex-start", padding:"20px 20px 40px" },
  card: { background:C.card, borderRadius:16, padding:"28px 32px", width:"100%", maxWidth:500, boxShadow:"none", border:`1px solid ${C.muted}33` },
  wCard: { background:C.card, borderRadius:16, padding:"28px 32px", width:"100%", maxWidth:820, boxShadow:"none", border:`1px solid ${C.muted}33` },
  h1: { fontSize:56, fontWeight:800, margin:"0 0 4px", fontFamily:FONT_DISPLAY, letterSpacing:1, display:"inline-block", color:C.text, lineHeight:1, textTransform:"uppercase" },
  h2: { fontSize:28, fontWeight:900, margin:"0 0 14px", fontFamily:FONT_DISPLAY, letterSpacing:2, color:C.text },
  sub: { color:C.muted, marginBottom:24, fontSize:14, letterSpacing:0.3 },
  inp: { width:"100%", padding:"13px 16px", borderRadius:10, border:`1px solid ${C.muted}55`, background:C.card2, color:C.text, fontSize:15, marginBottom:12, outline:"none", fontFamily:FONT_BODY },
  btn: { padding:"14px 24px", borderRadius:10, border:"none", cursor:"pointer", fontSize:15, fontWeight:700, display:"block", width:"100%", marginBottom:10, fontFamily:FONT_BODY, letterSpacing:0.4 },
  btnP: { background:C.hi, color:C.onHi },
  btnS: { background:C.card2, color:C.text, border:`1px solid ${C.muted}55` },
  btnSm: { padding:"8px 14px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:FONT_BODY },
  err: { color:C.accent, fontSize:13, marginBottom:12, padding:"10px 14px", background:`${C.accent}11`, borderRadius:8, border:`1px solid ${C.accent}33` },
  info: { color:C.muted, fontSize:13, marginBottom:12, padding:"10px 14px", background:C.card2, borderRadius:8 },
  divider: { textAlign:"center", color:C.muted, margin:"14px 0", fontSize:13 },
  row: { display:"flex", gap:10, alignItems:"center" },
  timer: { fontWeight:700, textAlign:"center", lineHeight:1, fontFamily:FONT_MONO, fontVariantNumeric:"tabular-nums" },
  prompt: { fontSize:21, fontWeight:600, textAlign:"center", lineHeight:1.5, padding:"16px 0", color:C.text, fontFamily:FONT_BODY },
  badge: { display:"inline-block", padding:"3px 10px", borderRadius:20, fontSize:10, fontWeight:700, letterSpacing:1 },
  pRow: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"11px 14px", background:C.card2, borderRadius:10, marginBottom:8, border:`1px solid ${C.muted}22` },
});

type ThemeMode = "dark" | "light" | "auto";
const normalizeThemeMode = (value: string | null): ThemeMode => {
  if (value === "dark" || value === "light" || value === "auto") return value;
  return "auto";
};
const ThemeCtx = React.createContext<{
  C: typeof DARK; g: Record<string, CSSProperties>;
  themeMode: ThemeMode; setThemeMode: (m: ThemeMode) => void;
}>({ C: DARK, g: makeStyles(DARK), themeMode: "auto", setThemeMode: () => {} });

// ── Powered By GIPHY attribution badge ────────────────────────────────────────
function PoweredByGiphy() {
  return (
    <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
      <a href="https://giphy.com" target="_blank" rel="noreferrer">
        <img src="/powered-by-giphy.gif" alt="Powered By GIPHY" style={{height:18,display:"block"}}/>
      </a>
    </div>
  );
}

function MediaAttribution({ source, attribution, license }: { source?: string } & Pick<MediaResult, "attribution" | "license">) {
  if (source === "local") return <MediaCredit attribution={attribution} license={license}/>;
  if (source === "giphy") return <PoweredByGiphy/>;
  if (source !== "klipy") return null;
  return <div style={{display:"flex",justifyContent:"flex-end",marginTop:8,fontSize:12}}>
    <a href="https://klipy.com" target="_blank" rel="noreferrer">Powered by KLIPY</a>
  </div>;
}
const submissionSource = (sub: Submission | undefined) => sub?.source ||
  (sub?.type === "giphy" || (!sub?.type && sub?.url) ? "giphy" : undefined);

// ── GIF image with loading/error state ────────────────────────────────────────
function GifImg({ url, style={}, fit="cover", className="", lazy=false }) {
  const { C } = useContext(ThemeCtx);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => { setOk(false); setErr(false); }, [url]);
  return (
    <div className={className} style={{ position:"relative", background:C.card2, overflow:"hidden", ...style }}>
      {!ok && !err && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:12}}>Loading…</div>}
      {err && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:12}}>GIF unavailable</div>}
      <img src={url} alt="" loading={lazy ? "lazy" : "eager"} onLoad={()=>setOk(true)} onError={()=>setErr(true)}
        style={{width:"100%",height:"100%",objectFit:fit as "cover"|"contain",display:"block",opacity:ok?1:0}} />
    </div>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const pid = TAB_ID;
  const [themeMode, setThemeMode] = useState<ThemeMode>("auto");
  const [sysDark, setSysDark] = useState(false);
  useEffect(() => {
    setThemeMode(normalizeThemeMode(localStorage.getItem("gifbattle_theme")));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSysDark(mq.matches);
    const handler = (e: MediaQueryListEvent) => setSysDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const setAndSaveTheme = (m: ThemeMode) => {
    const nextMode = normalizeThemeMode(m);
    localStorage.setItem("gifbattle_theme", nextMode);
    setThemeMode(nextMode);
  };
  const isDark = themeMode === "auto" ? sysDark : themeMode === "dark";
  useEffect(() => {
    const resolvedTheme = isDark ? "dark" : "light";
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [isDark]);
  const C = isDark ? DARK : LIGHT;
  const g = makeStyles(C);
  const themeCtxVal = { C, g, themeMode, setThemeMode: setAndSaveTheme };
  const envKey = enabledProviders.length ? "configured" : "";
  const [view, setView] = useState("home");
  const [nick, setNick] = useState("");
  const [code, setCode] = useState("");
  const [joinIn, setJoinIn] = useState("");
  const [gs, setGs] = useState(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const pollRef = useRef(null);
  const transitioning = useRef(false);
  const lastGsJson = useRef<string | null>(null);
  const gsRef = useRef<any>(null);
  const isHostRef = useRef(false);
  const hbIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hbMissingSinceRef = useRef<number | null>(null);
  const endCleanupRef = useRef<Record<string, { base: boolean; images: boolean }>>({});
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGsRef = useRef<any>(null);
  const leavingRef = useRef(false);
  const lobbyMissingPollsRef = useRef(0);
  const lastRoomReadWasMissing = useRef(false);

  useEffect(() => {
    try {
      const savedNick = localStorage.getItem(NICK_STORAGE_KEY) || "";
      if (savedNick) setNick(savedNick);
      const savedRoom = (localStorage.getItem(LAST_ROOM_STORAGE_KEY) || "").trim().toUpperCase();
      if (!savedRoom) return;
      storage.get(rKey(savedRoom))
        .then((r) => {
          if (!r?.value) {
            clearRoomToken(savedRoom);
            try { localStorage.removeItem(LAST_ROOM_STORAGE_KEY); } catch {}
            return;
          }
          let s: any;
          try {
            s = JSON.parse(r.value);
          } catch (error) {
            console.error("session_restore_parse_failed", { savedRoom, error });
            clearRoomToken(savedRoom);
            try { localStorage.removeItem(LAST_ROOM_STORAGE_KEY); } catch {}
            setErr("Saved room state was invalid. Please join the room again.");
            return;
          }
          if (!s?.players?.some((p: { id: string }) => p.id === pid)) {
            clearRoomToken(savedRoom);
            try { localStorage.removeItem(LAST_ROOM_STORAGE_KEY); } catch {}
            return;
          }
          setCode(savedRoom);
          setGs(s);
          lastGsJson.current = r.value;
          setView("game");
        })
        .catch((error) => {
          console.error("session_restore_failed", { savedRoom, error });
        });
    } catch {}
  }, [pid]);

  useEffect(() => {
    try {
      localStorage.setItem(NICK_STORAGE_KEY, nick || "");
    } catch {}
  }, [nick]);

  useEffect(() => () => { clearTimeout(noticeTimerRef.current!); }, []);

  const showNotice = useCallback((message: string) => {
    if (!message) return;
    setNotice(message);
    clearTimeout(noticeTimerRef.current!);
    noticeTimerRef.current = setTimeout(() => setNotice(""), NOTICE_MS);
  }, []);

  const fetchGs = useCallback(async (c?: string) => {
    const roomCode = String(c || code || "").trim().toUpperCase();
    lastRoomReadWasMissing.current = false;
    try {
      const r = await storage.get(rKey(roomCode));
      lastRoomReadWasMissing.current = r === null;
      if (r) {
        let s: any;
        try {
          s = JSON.parse(r.value);
        } catch (error) {
          console.error("fetch_room_state_parse_failed", { roomCode, error });
          return null;
        }
        // Only call setGs when the state actually changed — avoids flicker during voting
        if (r.value !== lastGsJson.current) {
          lastGsJson.current = r.value;
          setGs(s);
        }
        return s;
      }
    } catch (error) {
      console.error("fetch_room_state_failed", { roomCode, error });
    }
    return null;
  }, [code]);

  const writeGs = useCallback(async (state, c?: string) => {
    const roomCode = String(c || code || "").trim().toUpperCase();
    if (!roomCode) return null;
    const token = getRoomToken(roomCode);
    if (!token) {
      console.warn("write_room_state_missing_token", { roomCode });
      return null;
    }
    try {
      const sanitizedState = { ...state };
      if ("geminiKey" in sanitizedState) delete sanitizedState.geminiKey;
      const json = JSON.stringify(sanitizedState);
      const res = await fetch("/api/room/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, pid, token, state: json }),
      });
      if (!res.ok) {
        console.error("write_room_state_failed", { roomCode, status: res.status });
        if (res.status === 403) {
          clearRoomToken(roomCode);
          try { localStorage.removeItem(LAST_ROOM_STORAGE_KEY); } catch {}
          if (roomCode === String(code || "").trim().toUpperCase()) {
            clearTimeout(noticeTimerRef.current!);
            prevGsRef.current = null;
            setNotice("");
            setView("home");
            setGs(null);
            setCode("");
            setErr("Room authorization expired. Please join the room again.");
          }
        } else {
          showNotice("Could not save the latest room update.");
          setErr("Failed to sync room state. Please try again.");
        }
        return null;
      }
      const result = await res.json();
      const savedState = result.state || sanitizedState;
      lastGsJson.current = JSON.stringify(savedState);
      setGs(savedState); return savedState;
    } catch (error) {
      console.error("write_room_state_error", { roomCode, error });
      showNotice("Room sync failed. Check your connection.");
      setErr("Failed to sync room state. Check your connection and try again.");
      return null;
    }
  }, [code, pid, showNotice]);

  const runEndGameCleanup = useCallback(async (state, opts?: { deleteImages?: boolean }) => {
    const roomCode = String(state?.code || code || "").trim().toUpperCase();
    const deleteImages = Boolean(opts?.deleteImages);
    if (!roomCode || state?.host !== pid) return;
    const cleanupState = endCleanupRef.current[roomCode] || { base: false, images: false };
    if (cleanupState.base && (!deleteImages || cleanupState.images)) return;

    const tasks: Array<Promise<unknown>> = [];
    if (!cleanupState.base) {
      try { sessionStorage.removeItem("gifbattle_gemini_key"); } catch {}
      tasks.push(
        fetch("/api/gemini-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: roomCode, pid, key: "" }),
        })
      );
      cleanupState.base = true;
    }

    if (deleteImages && !cleanupState.images) {
      const blobUrls = Object.values(state?.submissions || {})
        .flat()
        .filter((s: Submission) => s?.type === "ai" && s?.url)
        .map((s: Submission) => s.url as string);
      if (blobUrls.length > 0) {
        tasks.push(
          fetch("/api/cleanup-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: roomCode, pid, urls: blobUrls }),
          })
        );
      }
      tasks.push(fetch("/api/cleanup-memes", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, pid, token: getRoomToken(roomCode), gameId: state?.submitDeadline }) }));
      cleanupState.images = true;
    }

    endCleanupRef.current[roomCode] = cleanupState;
    await Promise.allSettled(tasks);
  }, [code, pid]);

  const sendHostHeartbeat = useCallback(async () => {
    try {
      const response = await fetch('/api/room/host-presence', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'heartbeat',code,pid,token:getRoomToken(code)})});
      if (!response.ok) console.info('host_heartbeat_held',{code,status:response.status});
    } catch { console.info('host_heartbeat_unavailable',{code}); }
  },[code,pid]);

  const checkHostMigration = useCallback(async () => {
    const cur = gsRef.current;
    if (!cur || cur.phase === 'game_over' || isHostRef.current) return;
    try {
      const r = await storage.get(hbKey(code));
      const now = Date.now(); let heartbeat;
      try { heartbeat = r?.value ? JSON.parse(r.value) : null; } catch { heartbeat=null; }
      if (heartbeat?.pid === cur.host && Number.isFinite(heartbeat.ts)) {
        hbMissingSinceRef.current = null;
        if (heartbeatIsFresh(heartbeat,cur.host,now,cur.phase)) return;
      } else {
        hbMissingSinceRef.current ??= now;
        if (now-hbMissingSinceRef.current < hostGraceMs(cur.phase)) return;
      }
      if (!cur.players.some(player => player.id === pid)) return;
      const fresh = await fetchGs() || cur;
      if (fresh.host !== cur.host || fresh.phase === 'game_over') return;
      const response = await fetch('/api/room/host-presence',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'claim',code,pid,token:getRoomToken(code),expectedHost:cur.host})});
      if (response.ok) { hbMissingSinceRef.current=null; await fetchGs(); }
    } catch { console.info('host_migration_check_unavailable',{code}); }
  },[code,pid,fetchGs]);

  // Keep refs in sync so interval callbacks always see current state
  useEffect(() => {
    gsRef.current = gs;
    isHostRef.current = gs?.host === pid;
  }, [gs]);

  // Show room lifecycle notices (player left, host changed) based on state diffs.
  useEffect(() => {
    if (view !== "game" || !gs) {
      prevGsRef.current = gs;
      return;
    }
    const prev = prevGsRef.current;
    if (!prev) {
      prevGsRef.current = gs;
      return;
    }
    const prevPlayers = (Array.isArray(prev.players) ? prev.players : []) as Array<{ id: string; nickname?: string }>;
    const curPlayers = (Array.isArray(gs.players) ? gs.players : []) as Array<{ id: string; nickname?: string }>;
    const prevById = new Map<string, { id: string; nickname?: string }>(prevPlayers.map((p) => [p.id, p]));
    const curById = new Map<string, { id: string; nickname?: string }>(curPlayers.map((p) => [p.id, p]));
    const leftPlayers = prevPlayers.filter((p) => !curById.has(p.id));

    if (!leavingRef.current) {
      if (leftPlayers.length > 0) {
        const locationLabel = gs.phase === "lobby" ? "the lobby" : "the game";
        const leftHost = leftPlayers.find((p) => p.id === prev.host);
        if (leftHost) {
          const hostName = leftHost.nickname || "Host";
          const nextHostName = gs.host && curById.get(gs.host)?.nickname;
          if (nextHostName) showNotice(`${hostName} left. ${nextHostName} is now host.`);
          else showNotice(`${hostName} left ${locationLabel}.`);
        } else if (leftPlayers.length === 1) {
          const who = leftPlayers[0].nickname || "A player";
          showNotice(`${who} left ${locationLabel}.`);
        } else {
          showNotice(`${leftPlayers.length} players left ${locationLabel}.`);
        }
      } else if (prev.host !== gs.host && gs.host !== pid) {
        const nextHostName = gs.host ? (curById.get(gs.host)?.nickname || "A player") : "A player";
        showNotice(`${nextHostName} is now host.`);
      }
    }

    prevGsRef.current = gs;
  }, [gs, pid, showNotice, view]);

  // Write initial heartbeat whenever this client becomes (or remains) host
  useEffect(() => {
    if (view === "game" && code && gs?.host === pid) {
      void sendHostHeartbeat();
    }
  }, [view, code, gs?.host, sendHostHeartbeat]);

  useEffect(() => {
    if (view === "game" && code) {
      pollRef.current = setInterval(async () => {
        const next = await fetchGs();
        if (next) {
          lobbyMissingPollsRef.current = 0;
          return;
        }
        if (!lastRoomReadWasMissing.current) {
          lobbyMissingPollsRef.current = 0;
          return;
        }
        if (gsRef.current?.phase !== "lobby") {
          lobbyMissingPollsRef.current = 0;
          return;
        }
        lobbyMissingPollsRef.current += 1;
        if (lobbyMissingPollsRef.current >= 2) {
          leave({ notifyRoom: false, localMessage: "Lobby expired due to inactivity. Please create or join a new room." });
        }
      }, POLL_MS);
      // Stagger: host writes heartbeat every 8s starting immediately;
      // non-hosts check for stale host every 8s starting at 4s offset.
      const hbDelay = setTimeout(() => {
        hbIntervalRef.current = setInterval(() => {
          if (isHostRef.current) {
            void sendHostHeartbeat();
          } else {
            checkHostMigration();
          }
        }, 8000);
      }, isHostRef.current ? 0 : 4000);
      return () => {
        clearInterval(pollRef.current);
        clearInterval(hbIntervalRef.current!);
        hbMissingSinceRef.current = null;
        lobbyMissingPollsRef.current = 0;
        clearTimeout(hbDelay);
      };
    }
  }, [view, code, fetchGs, checkHostMigration, sendHostHeartbeat]);

  useEffect(() => {
    if(view !== 'game' || !code) return;
    const resume = async () => {
      if(document.visibilityState !== 'visible') return;
      const fresh = await fetchGs();
      if(fresh?.host === pid && fresh.phase !== 'game_over') await sendHostHeartbeat();
    };
    window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return () => {window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[view,code,pid,fetchGs,sendHostHeartbeat]);

  // Detect when this player has been kicked from the lobby
  useEffect(() => {
    if (gs && view === "game" && gs.phase === "lobby" && !gs.players.find(p => p.id === pid)) {
      leave({ notifyRoom: false, localMessage: "You were removed from the lobby." });
    }
  }, [gs]);

  const leave = (opts?: { notifyRoom?: boolean; localMessage?: string }) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    const roomCode = String(code || "").trim().toUpperCase();
    const token = getRoomToken(roomCode);
    clearInterval(pollRef.current);
    clearInterval(hbIntervalRef.current!);
    hbMissingSinceRef.current = null;
    if ((opts?.notifyRoom ?? true) && roomCode && token) {
      fetch("/api/room/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: roomCode, pid, token }),
        keepalive: true,
      }).catch(() => {});
    }
    clearRoomToken(roomCode);
    try { localStorage.removeItem(LAST_ROOM_STORAGE_KEY); } catch {}
    clearTimeout(noticeTimerRef.current!);
    prevGsRef.current = null;
    setNotice("");
    setView("home");
    setGs(null);
    setCode("");
    setErr(opts?.localMessage || "");
    leavingRef.current = false;
  };

  if (view === "home") return (
    <ThemeCtx.Provider value={themeCtxVal}>
      <ThemeToggle />
      <HomeScreen nick={nick} setNick={setNick} joinIn={joinIn} setJoinIn={setJoinIn} err={err} setErr={setErr}
      onCreate={async () => {
        if (!nick.trim()) return setErr("Enter a nickname");
        try {
          const res = await fetch("/api/room/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pid, nickname: nick.trim() }),
          });
          if (res.status === 429) {
            let d: { retryAfterSec?: number } = {};
            try { d = await res.json(); } catch {}
            const retryIn = typeof d.retryAfterSec === "number" ? `${d.retryAfterSec}s` : "a moment";
            return setErr(`Too many attempts — try again in ${retryIn}`);
          }
          if (!res.ok) return setErr("Failed to create room, please try again");
          const { code: c, token } = await res.json();
          if (!c || typeof token !== "string" || !token) return setErr("Failed to create room, please try again");
          setRoomToken(c, token);
          try {
            localStorage.setItem(NICK_STORAGE_KEY, nick.trim());
            localStorage.setItem(LAST_ROOM_STORAGE_KEY, c);
          } catch {}
          setCode(c);
          setView("game");
        } catch { setErr("Failed to create room — check your connection"); }
      }}
      onJoin={async () => {
        if (!nick.trim()) return setErr("Enter a nickname");
        const c = joinIn.trim().toUpperCase();
        if (!/^[A-Z0-9]{6}$/.test(c)) return setErr("Enter a valid 6-character room code");
        try {
          const res = await fetch("/api/room/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: c, pid, nickname: nick.trim() }),
          });
          if (res.status === 404) return setErr("Room not found");
          if (res.status === 409) {
            let d: { error?: string } = {};
            try { d = await res.json(); } catch {}
            if (d.error === "not_in_lobby") return setErr("Game already in progress");
            if (d.error === "room_full") return setErr("Room is full");
            return setErr("Cannot join this room");
          }
          if (res.status === 429) {
            let d: { retryAfterSec?: number } = {};
            try { d = await res.json(); } catch {}
            return setErr(`Too many attempts — try again in ${d.retryAfterSec ?? "a moment"}`);
          }
          if (!res.ok) return setErr("Failed to join — check the code");
          const data = await res.json();
          if (typeof data?.token !== "string" || !data.token) return setErr("Failed to join — check the code");
          setRoomToken(c, data.token);
          try {
            localStorage.setItem(NICK_STORAGE_KEY, nick.trim());
            localStorage.setItem(LAST_ROOM_STORAGE_KEY, c);
          } catch {}
          setCode(c);
          setView("game");
        } catch { setErr("Failed to join — check your connection"); }
      }}
    />
    </ThemeCtx.Provider>
  );

  if (!gs) return (
    <ThemeCtx.Provider value={themeCtxVal}>
      <ThemeToggle />
      <div style={g.page}><div style={{color:C.muted}}>Loading…</div></div>
    </ThemeCtx.Provider>
  );

  const isHost = gs.host === pid;

  const startGame = async () => {
    if (gs.players.length < 2) return alert("Need at least 2 players");
    const fresh = await fetchGs() || gs;
    const rounds = getRounds(fresh);
    const namePromptRounds = getNamePromptRounds(fresh);
    const customPromptPool = (fresh.customPrompts || []) as string[];
    const pool = [...PROMPTS, ...customPromptPool];
    if (pool.length === 0) return alert("No prompts available");
    const maxC = fresh.maxCompetitors ?? 4;
    const players = (fresh.players || []) as Array<{ id: string; nickname: string }>;
    const plan = buildRoundPlan(players.map(p => p.id), rounds, maxC);
    if (plan.length === 0) return alert("Not enough players to build matchups");
    const playerNameById = new Map(players.map(p => [p.id, p.nickname]));
    const previousPrompts: string[] = Array.isArray(fresh.usedPrompts) && fresh.usedPrompts.length > 0
      ? (fresh.usedPrompts as string[])
      : (Array.isArray(fresh.prompts) ? (fresh.prompts as string[]) : []);
    const prompts = buildPromptsForPlan(
      pool,
      plan,
      rounds,
      namePromptRounds,
      playerNameById,
      customPromptPool,
      previousPrompts
    );
    await writeGs({
      ...fresh, phase:"submitting", prompts, submissions:{}, doneSubmitting:[], votingRound:0,
      matchups:[], currentMatchup:0, roundMatchupWins:{}, voteDeadline:null, usedPrompts: prompts, roundPlan:plan, answerModePolicy: fresh.alternateModes === false ? CHOICE_MODE_POLICY : ANSWER_MODE_POLICY, alternateModes: fresh.alternateModes !== false, answerModeOverrides: {},
      submitDeadline: Date.now() + (fresh.submitSecs ?? SUBMIT_SECS) * rounds * 1000
    });
  };

  const transitionToVoting = async (state) => {
    const vRound = findNextVotableRound(state, state.votingRound ?? 0);
    if (vRound == null) {
      await runEndGameCleanup(state, { deleteImages: false });
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
    if (nextVR == null) {
      await runEndGameCleanup(fresh, { deleteImages: false });
      return writeGs({ ...fresh, phase:"game_over" });
    }
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

  const sp = { gs, pid, code, isHost, apiKey: envKey, writeGs, fetchGs, transitioning, transitionToVoting, advanceMatchup, startGame, nextVotingRound, runEndGameCleanup, leave };
  return (
    <ThemeCtx.Provider value={themeCtxVal}>
      <ThemeToggle />
      {notice && (
        <div role="status" style={{
          position:"fixed", top:16, left:"50%", transform:"translateX(-50%)",
          zIndex:1000, background:C.card2, color:C.text, border:`1px solid ${C.blue}66`,
          borderRadius:10, padding:"10px 14px", boxShadow:"0 6px 22px rgba(0,0,0,0.25)",
          fontSize:13, maxWidth:460, width:"calc(100% - 40px)", textAlign:"center",
        }}>
          {notice}
        </div>
      )}
      {gs.phase !== "lobby" && (
        <button
          className="gbtn"
          onClick={() => { if (window.confirm("Leave this game?")) leave(); }}
          style={{
            position:"fixed", top:16, left:16, zIndex:1001,
            background:C.card2, border:`1px solid ${C.muted}66`, color:C.text,
            borderRadius:10, padding:"8px 12px", cursor:"pointer", fontSize:13,
            boxShadow:"0 4px 16px rgba(0,0,0,0.2)",
          }}
        >
          ← Leave
        </button>
      )}
      {gs.phase==="lobby"?<Lobby {...sp}/>:gs.phase==="submitting"?<Submit {...sp}/>:gs.phase==="voting"?<Voting {...sp}/>:gs.phase==="round_results"?<RoundResults {...sp}/>:gs.phase==="game_over"?<GameOver {...sp}/>:null}
    </ThemeCtx.Provider>
  );
}

// ── Theme toggle ──────────────────────────────────────────────────────────────
function ThemeToggle() {
  const { themeMode, setThemeMode, C } = useContext(ThemeCtx);
  const icon: Record<ThemeMode, string> = { dark:"🌙", light:"☀️", auto:"🖥️" };
  const next: Record<ThemeMode, ThemeMode> = { auto:"dark", dark:"light", light:"auto" };
  return (
    <button className="gbtn theme-toggle" title={`Theme: ${themeMode}`} aria-label={`Theme: ${themeMode}. Switch to ${next[themeMode]}`}
      onClick={() => setThemeMode(next[themeMode])}
      style={{ position:"fixed", bottom:16, right:16, zIndex:1000,
        background:C.card2, border:`1px solid ${C.muted}44`,
        borderRadius:10, padding:"8px 12px", cursor:"pointer",
        fontSize:16, lineHeight:1, color:C.text,
        boxShadow:"0 2px 12px rgba(0,0,0,0.15)" }}>
      {icon[themeMode]}
    </button>
  );
}

// ── GIPHY env config screen ───────────────────────────────────────────────────
function MissingGiphyConfig() {
  const { C, g } = useContext(ThemeCtx);
  return (
    <div style={g.page}>
      <div style={g.card}>
        <div style={g.h1}>GIF BATTLES</div>
        <div style={g.sub}>GIF search is not configured for this deployment</div>
        <div style={{background:C.card2,borderRadius:12,padding:"14px 16px",marginBottom:16,fontSize:13,lineHeight:1.9,color:C.muted,border:`1px solid ${C.muted}22`}}>
          <div style={{color:C.text,fontWeight:700,marginBottom:6,fontSize:14}}>Fix deployment config:</div>
          1. Add a provider key, e.g. <code style={{background:`${C.blue}18`,color:C.blue,padding:"1px 6px",borderRadius:4,fontSize:11}}>NEXT_PUBLIC_GIPHY_KEY</code><br/>
          2. Redeploy the app<br/>
          <div style={{marginTop:8,fontSize:12,color:C.muted}}>
            Configure NEXT_PUBLIC_GIPHY_KEY or NEXT_PUBLIC_KLIPY_KEY to enable GIF search.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Home ──────────────────────────────────────────────────────────────────────
function HomeScreen({ nick, setNick, joinIn, setJoinIn, err, setErr, onCreate, onJoin }) {
  const { C, g } = useContext(ThemeCtx);
  return (
    <div style={g.page}>
      <div style={{...g.card,position:"relative"}}>
        <div style={{textAlign:"center", marginBottom:28}}>
          <div style={{fontSize:84, fontWeight:800, fontFamily:FONT_DISPLAY, letterSpacing:1, display:"inline-block",
            color:C.text, lineHeight:0.9, marginBottom:10}}>
            <span style={{color:C.accent}}>GIF</span> BATTLES
          </div>
          <div style={{color:C.muted, fontSize:11, letterSpacing:5, fontWeight:600}}>CREATE · VOTE · GLORY</div>
          <div style={{marginTop:12,color:C.muted,fontSize:13,lineHeight:1.6}}>
            A fast online party game for remote teams, coworker happy hours, and friend groups.
          </div>
          <div style={{marginTop:6,color:C.muted,fontSize:13,lineHeight:1.6}}>
            Find a funny GIF or create your own meme. Add a caption, get optional AI help, and vote for the funniest answer.
          </div>
        </div>

        <div role="note" aria-label="Beta availability" style={{marginBottom:16,padding:"12px 14px",borderRadius:10,background:C.card2,border:`1px solid ${C.muted}22`,fontSize:12,lineHeight:1.6,color:C.muted}}>
          <strong style={{color:C.text}}>Public beta</strong> · We’re still testing and improving the game. GIF search has limited quotas; if both providers reach their limits, the affected question switches to Meme mode. Keep playing by creating your own captioned meme or submitting a text answer. AI tools are optional and require the host to enable them.
        </div>
        {err && <div style={g.err}>⚠ {err}</div>}
        <input style={g.inp} placeholder="Your nickname" value={nick} maxLength={20}
          onChange={e=>{setNick(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&onCreate()} />
        <button className="gbtn" style={{...g.btn,...g.btnP}} onClick={onCreate}>🎲 Create Room</button>
        <div style={g.divider}>— or join with a code —</div>
        <input style={g.inp} placeholder="Room code (e.g. AB12CD)" value={joinIn} maxLength={6}
          onChange={e=>{setJoinIn(e.target.value.toUpperCase());setErr("");}} onKeyDown={e=>e.key==="Enter"&&onJoin()} />
        <button className="gbtn" style={{...g.btn,...g.btnS,marginBottom:0}} onClick={onJoin}>🚪 Join Room</button>
        <div style={{marginTop:14,padding:"12px 14px",borderRadius:10,background:C.card2,border:`1px solid ${C.muted}22`}}>
          <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8,fontWeight:700}}>HOW TO PLAY</div>
          <div style={{fontSize:13,lineHeight:1.7,color:C.text}}>
            1. Create a room and share the 6-character code.<br/>
            2. Answer each prompt with a funny GIF or a meme you create.<br/>
            3. Vote in head-to-head matchups until one winner remains.
          </div>
          <div style={{marginTop:8,fontSize:12,lineHeight:1.6,color:C.muted}}>
            Great for virtual team building, remote happy hours, and quick coworker icebreakers.
          </div>
        </div>
        <div style={{marginTop:12,textAlign:"center",fontSize:12,color:C.muted,lineHeight:1.6}}>
          Questions or suggestions? Open an{" "}
          <a href="https://github.com/gozhiyuan/gifbattle/issues" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:"underline"}}>
            issue
          </a>
          {" "}or submit a{" "}
          <a href="https://github.com/gozhiyuan/gifbattle/pulls" target="_blank" rel="noreferrer" style={{color:C.blue,textDecoration:"underline"}}>
            PR
          </a>
          {" · "}
          <a href="/privacy" style={{color:C.blue,textDecoration:"underline"}}>
            Privacy
          </a>
          .
        </div>
      </div>
    </div>
  );
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function Lobby({ gs, pid, code, isHost, startGame, leave, writeGs }) {
  const [alternateDraft,setAlternateDraft] = useState(gs.alternateModes !== false);
  const [alternateSaving,setAlternateSaving] = useState(false);
  useEffect(() => { if (!alternateSaving) setAlternateDraft(gs.alternateModes !== false); }, [gs.alternateModes,alternateSaving]);
  const saveAlternateMode = async (enabled:boolean) => {
    if (!isHost || alternateSaving) return;
    setAlternateDraft(enabled); setAlternateSaving(true);
    try { if (!await writeGs({...gs,alternateModes:enabled})) setAlternateDraft(gs.alternateModes !== false); }
    finally { setAlternateSaving(false); }
  };
  const { C, g } = useContext(ThemeCtx);
  const [copied, setCopied] = useState(false);
  const [promptInput, setPromptInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [llmCreateStatus, setLlmCreateStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [promptGenSlow, setPromptGenSlow] = useState(false);
  const promptSlowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { clearTimeout(promptSlowRef.current!); }, []);

  // Gemini key is stored only in host sessionStorage + server-side secret storage.
  const [geminiKey, setGeminiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [roomKeySet, setRoomKeySet] = useState(false);
  const [editingKey, setEditingKey] = useState(false);
  useEffect(() => {
    let saved = "";
    try { saved = sessionStorage.getItem("gifbattle_gemini_key") || ""; } catch {}
    setGeminiKey(saved);
    setKeyInput(saved);
    if (!isHost) return;
    fetch(`/api/gemini-key?code=${encodeURIComponent(code)}&pid=${encodeURIComponent(pid)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setRoomKeySet(Boolean(data?.exists)))
      .catch(() => {});
  }, [code, isHost, pid]);
  const saveKey = async () => {
    const k = keyInput.trim();
    try { sessionStorage.setItem("gifbattle_gemini_key", k); } catch {}
    setGeminiKey(k);
    setEditingKey(false);
    setGenError("");
    if (!isHost) return;
    try {
      const res = await fetch("/api/gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pid, key: k }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setGenError("Failed to save Gemini key on server");
        return;
      }
      setRoomKeySet(Boolean(data?.exists));
    } catch {
      setGenError("Failed to save Gemini key on server");
    }
  };
  const clearKey = async () => {
    try { sessionStorage.removeItem("gifbattle_gemini_key"); } catch {}
    setGeminiKey("");
    setKeyInput("");
    setEditingKey(false);
    if (!isHost) return;
    try {
      await fetch("/api/gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pid, key: "" }),
      });
    } catch {}
    setRoomKeySet(false);
  };
  const maskKey = (k: string) => k.length > 8 ? k.slice(0, 7) + "…" + k.slice(-4) : "••••••••";

  const GEMINI_MODELS = [
    { id: "gemini-3.5-flash", label: "3.5 Flash" },
    { id: "gemini-3.6-flash", label: "3.6 Flash" },
  ];
  const modelIds = new Set(GEMINI_MODELS.map(m => m.id));
  const currentModel = modelIds.has(gs.geminiModel) ? gs.geminiModel : GEMINI_MODELS[0].id;
  const setGeminiModel = async (m: string) => {
    if (!isHost) return;
    await writeGs({ ...gs, geminiModel: m });
  };

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
    setPromptGenSlow(false);
    setGenError("");
    setLlmCreateStatus(null);
    clearTimeout(promptSlowRef.current!);
    promptSlowRef.current = setTimeout(() => setPromptGenSlow(true), 6000);
    try {
      const promptSeeds = [
        ...customPrompts,
        promptInput.trim(),
      ].filter(Boolean);

      const res = await fetch("/api/generate-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ existingPrompts: promptSeeds, roomCode: code, pid, model: currentModel }),
      });
      const data = await res.json();
      if (data.error === "not configured") {
        setGenError("No API key set — enter your Gemini key below");
        setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
        setEditingKey(true);
      } else if (data.error === "invalid key") {
        setGenError("Invalid API key — check and re-enter it below");
        setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
        setEditingKey(true);
      } else if (data.error === "provider_bad_request") {
        setGenError("Gemini request was rejected (model/config). Try a different model or update server config.");
        setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
      } else if (data.error === "rate_limited") {
        const wait = Number(data.retryAfter);
        setGenError(`Too many prompt generations in this room. Try again in ${Number.isFinite(wait) ? Math.max(1, Math.ceil(wait)) : 30}s.`);
        setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
      } else if (data.error === "generation_busy") {
        setGenError("Gemini is currently busy. Please retry in a few seconds.");
        setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
      } else if (data.error === "generation_failed") {
        setGenError("Prompt generation failed due to a provider error. Please retry.");
        setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
      } else if (data.error === "invalid_request") {
        setGenError("Prompt generation request was invalid. Please refresh and try again.");
        setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
      } else if (data.error === "forbidden") {
        setGenError("Room authorization failed — try rejoining");
        setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
      } else if (data.error === "generation_blocked") {
        setGenError("Gemini blocked this generation response. Try a simpler custom prompt seed.");
        setLlmCreateStatus({ ok: false, message: "LLM generation was blocked by provider safety filters." });
      } else {
        const generated: string[] = Array.isArray(data.prompts)
          ? Array.from(new Set(
              data.prompts
                .filter((p: unknown): p is string => typeof p === "string")
                .map(p => p.trim())
                .filter(Boolean)
            ))
          : [];
        if (generated.length === 0) {
          setLlmCreateStatus({ ok: false, message: "LLM response format was invalid. Please retry." });
          return;
        }
        const newPrompts = generated.filter(p => !customPrompts.includes(p));
        if (newPrompts.length === 0) {
          setLlmCreateStatus({ ok: false, message: "LLM completed, but no new unique questions were added." });
          return;
        }
        await writeGs({ ...gs, customPrompts: [...customPrompts, ...newPrompts] });
        setLlmCreateStatus({
          ok: true,
          message: `LLM created and added ${newPrompts.length} custom question${newPrompts.length > 1 ? "s" : ""}.`,
        });
      }
    } catch {
      setGenError("Failed to generate — check your connection");
      setLlmCreateStatus({ ok: false, message: "LLM could not create custom questions." });
    } finally {
      clearTimeout(promptSlowRef.current!);
      promptSlowRef.current = null;
      setPromptGenSlow(false);
      setGenerating(false);
    }
  };

  return (
    <div style={g.page}>
      <div style={g.card}>
        <div style={{
          ...g.h1,
          marginBottom: 4,
        }}>
          LOBBY
        </div>
        <div style={g.sub}>Share the code & wait for friends</div>
        <div style={{background:C.card2,borderRadius:12,padding:"14px 20px",marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.muted}33`}}>
          <div>
            <div style={{fontSize:10,color:C.muted,letterSpacing:3,marginBottom:4,fontWeight:600}}>ROOM CODE</div>
            <div style={{fontSize:42,fontWeight:700,letterSpacing:8,color:C.text,fontFamily:FONT_MONO}}>{code}</div>
          </div>
          <button className="gbtn" style={{...g.btnSm,background:copied?C.green:C.hi,color:copied?"#fff":C.onHi,padding:"10px 18px"}} onClick={copy}>{copied?"✓ Copied":"Copy"}</button>
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
                      background:current===n?C.text:C.card2,
                      color:current===n?C.bg:C.text,
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
              {isHost ? <label style={{display:'block',fontSize:13,marginBottom:8,cursor:'pointer'}}>
                <input type="checkbox" checked={alternateDraft} disabled={alternateSaving} onChange={event => void saveAlternateMode(event.target.checked)}/>{' '}Alternate GIF and Meme rounds
              </label> : <div style={{fontSize:13,marginBottom:8}}>Answer format: {gs.alternateModes !== false ? 'Alternating GIF and Meme rounds' : 'Players choose GIF or Meme'}</div>}
              <div style={{fontSize:12,color:C.muted,marginBottom:12}}>{gs.alternateModes !== false ? 'On: rounds alternate GIF → Meme, with one required mode per question.' : 'Off: players choose Search GIFs or Create Meme for every question.'}</div>
              {settingRow("ROUNDS", "", [3,5,7,10], rounds, setRounds)}
              {settingRow("NAME-BASED ROUNDS", "", nameRoundOptions, namePromptRounds, setNamePromptRounds)}
              {settingRow("ANSWERS PER HEAT", "", [2,4,6,8], maxC, setMaxComp)}
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
                {`${sSecs}s × ${rounds} questions = ${sSecs*rounds}s total to create your answers`}
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

              {/* Gemini key config */}
              <div style={{background:`${C.bg}88`,borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:6}}>GEMINI API KEY</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:8}}>
                  Needed for AI prompt/image generation in this room.
                  Get a key from{" "}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    style={{color:C.blue,textDecoration:"underline"}}
                  >
                    Google AI Studio
                  </a>
                  . The key is room-scoped, not shown to other players, and is auto-cleared at game over.
                </div>
                {!editingKey ? (
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:13,flex:1,color:roomKeySet?C.green:C.muted}}>
                      {roomKeySet ? `✓ ${geminiKey ? maskKey(geminiKey) : "Key set on server"}` : "Not set"}
                    </span>
                    <button onClick={()=>{setKeyInput(geminiKey);setEditingKey(true);}}
                      style={{...g.btnSm,background:C.card2,color:C.text,border:`1px solid ${C.muted}44`}}>
                      {roomKeySet ? "Change" : "Set Key"}
                    </button>
                    {roomKeySet && (
                      <button onClick={clearKey}
                        style={{...g.btnSm,background:`${C.accent}18`,color:C.accent,border:"none"}}>
                        Clear
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      style={{...g.inp,marginBottom:8,fontFamily:"monospace",fontSize:13}}
                      type="password"
                      placeholder="AIza…"
                      value={keyInput}
                      onChange={e=>setKeyInput(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter")saveKey();if(e.key==="Escape"){setEditingKey(false);setKeyInput(geminiKey);}}}
                      autoFocus
                    />
                    <div style={{display:"flex",gap:8}}>
                      <button onClick={saveKey}
                        style={{...g.btnSm,flex:1,background:C.hi,color:C.onHi}}>
                        Save
                      </button>
                      <button onClick={()=>{setEditingKey(false);setKeyInput(geminiKey);}}
                        style={{...g.btnSm,background:C.card2,color:C.text,border:`1px solid ${C.muted}44`}}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {/* Model selector */}
                <div style={{marginTop:10}}>
                  <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:6}}>MODEL</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {GEMINI_MODELS.map(m => (
                      <button key={m.id} onClick={()=>setGeminiModel(m.id)}
                        style={{...g.btnSm,
                          background:currentModel===m.id?C.text:C.card2,
                          color:currentModel===m.id?C.bg:C.text,
                          border:currentModel===m.id?"none":`1px solid ${C.muted}44`,
                          opacity:isHost?1:0.7,cursor:isHost?"pointer":"default"}}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                style={{...g.btn,...g.btnS,marginBottom:8,opacity:generating?0.6:1}}
                onClick={generatePrompts}
                disabled={generating}
              >
                {generating ? "✨ Generating…" : "✨ Enrich custom questions with LLM"}
              </button>
              {generating && promptGenSlow && (
                <div style={g.info}>Still working… this can take a little longer when Gemini is under load.</div>
              )}

              {genError && <div style={g.err}>⚠ {genError}</div>}
              {llmCreateStatus && (
                <div style={{
                  ...g.info,
                  marginBottom:10,
                  background: llmCreateStatus.ok ? `${C.green}14` : `${C.yellow}15`,
                  color: llmCreateStatus.ok ? C.green : C.yellow,
                  border: `1px solid ${llmCreateStatus.ok ? `${C.green}44` : `${C.yellow}55`}`,
                }}>
                  {llmCreateStatus.ok ? "✓" : "⚠"} {llmCreateStatus.message}
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
                  style={{...g.btnSm,background:`${C.accent}18`,color:C.accent,fontSize:11,padding:"3px 8px"}}
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
              {p.id===gs.host&&<span style={{...g.badge,background:`${C.accent}22`,color:C.accent}}>HOST</span>}
              {p.id===pid&&<span style={{...g.badge,background:`${C.blue}22`,color:C.blue}}>YOU</span>}
              {isHost&&p.id!==pid&&(
                <button onClick={()=>kickPlayer(p.id)}
                  style={{...g.btnSm,background:`${C.accent}18`,color:C.accent,fontSize:11,padding:"4px 10px"}}>
                  ✕ Kick
                </button>
              )}
            </div>
          </div>
        ))}
        <div style={{marginTop:16}}>
          {isHost
            ?<button className="gbtn" style={{...g.btn,...g.btnP}} disabled={alternateSaving} onClick={startGame}>{alternateSaving ? "Saving settings…" : gs.players.length<2?"⏳ Need more players…":"🚀 Start Game"}</button>
            :<div style={{textAlign:"center",color:C.muted,padding:12,background:C.card2,borderRadius:10,marginBottom:10,border:`1px solid ${C.muted}22`}}>⏳ Waiting for host to start…</div>}
          <button className="gbtn" style={{...g.btn,...g.btnS,marginBottom:0}} onClick={leave}>← Leave</button>
        </div>
      </div>
    </div>
  );
}

// ── Submit ────────────────────────────────────────────────────────────────────
function Submit({ gs, pid, code, apiKey, writeGs, fetchGs, transitioning, transitionToVoting, isHost }) {
  const { C, g } = useContext(ThemeCtx);
  const rounds = getRounds(gs);
  const subs = (gs.submissions || {}) as Record<string, Array<Submission>>;
  const myAssignedRounds = getAssignedRoundIndexes(gs, pid);
  const mySubmissions = subs[pid];
  const myDoneCount = countSubmittedRounds(mySubmissions, myAssignedRounds);
  const myTargetCount = myAssignedRounds.length;
  const currentRoundIndex = myAssignedRounds.find(ri => mySubmissions?.[ri] == null) ?? null;
  const isDone = currentRoundIndex == null || myDoneCount >= myTargetCount;
  const currentMeta = currentRoundIndex == null ? null : getRoundPlan(gs)[currentRoundIndex];
  const currentPrompt = currentRoundIndex == null ? "" : (gs.prompts as string[])?.[currentRoundIndex] ?? "";

  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<MediaResult[]>([]);
  const [provider, setProvider] = useState<RemoteProvider>(primaryProvider);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const pausedRef = useRef<Partial<Record<RemoteProvider, number>>>({});
  useEffect(() => () => requestRef.current?.abort(), []);
  const [hasMore, setHasMore] = useState(false);
  const [sel, setSel] = useState<MediaResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [gifSubmitting, setGifSubmitting] = useState(false);
  const [memeFallbackNeeded, setMemeFallbackNeeded] = useState(false);
  const [switchingToMeme, setSwitchingToMeme] = useState(false);
  const [chosenMode, setChosenMode] = useState<"giphy" | "meme">(apiKey ? "giphy" : "meme");
  const modeChoiceEnabled = isChoiceMode(gs) && !gs.answerModeOverrides?.[currentRoundIndex ?? 0];
  const activeTab = modeChoiceEnabled ? (apiKey ? chosenMode : "meme") : getAnswerMode(gs, currentRoundIndex ?? 0, Boolean(apiKey));
  useEffect(() => { setChosenMode(apiKey ? "giphy" : "meme"); }, [currentRoundIndex, apiKey]);
  const [textStyle, setTextStyle] = useState("random");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [answerSuggestions, setAnswerSuggestions] = useState<string[]>([]);
  const [revising, setRevising] = useState(false);
  const revisionRef = useRef<AbortController | null>(null);
  const imageRequestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { revisionRef.current?.abort(); imageRequestRef.current?.abort(); }, []);
  const [roomAiReady, setRoomAiReady] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/gemini-key?code=${encodeURIComponent(code)}&pid=${encodeURIComponent(pid)}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setRoomAiReady(Boolean(data?.exists)); })
      .catch(() => { if (!controller.signal.aborted) setRoomAiReady(false); });
    return () => controller.abort();
  }, [code, pid]);
  const [memeTemplate, setMemeTemplate] = useState<MediaResult | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [memeSubmitting, setMemeSubmitting] = useState(false);
  const [genImageUrl, setGenImageUrl] = useState<string|null>(null);
  const [genSlow, setGenSlow] = useState(false);
  const genSlowRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { clearTimeout(genSlowRef.current!); }, []);
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
    setMemeTemplate(null); setTemplateSearch(''); setMemeSubmitting(false);
    setGifs([]);
    requestRef.current?.abort();
    requestRef.current = null;
    busyRef.current = false;
    setSearching(false);
    setCursor(undefined);
    setSearchedQuery("");
    setHasMore(false);
    setSel(null);
    setSearchErr("");
    setGifSubmitting(false); setMemeFallbackNeeded(false); setSwitchingToMeme(false);
    setGenError("");
    revisionRef.current?.abort(); imageRequestRef.current?.abort();
    setAnswerSuggestions([]); setRevising(false);
    setGenImageUrl(null);
    setGenerating(false);
    setGenSlow(false);
    clearTimeout(genSlowRef.current!);
    genSlowRef.current = null;
  }, [currentRoundIndex, activeTab]);
  const fallbackMode = async (mode: 'meme') => {
    if (currentRoundIndex == null) return;
    const fresh = await fetchGs() || gs;
    if (fresh.phase !== 'submitting' || fresh.submitDeadline !== gs.submitDeadline) return;
    if (!await writeGs({ ...fresh, answerModeOverrides: { ...(fresh.answerModeOverrides || {}), [currentRoundIndex]: mode } })) throw new Error("Could not change the unavailable answer mode. Please retry.");
  };

  const runSearch = async (q: string, append = false) => {
    const term = q.trim();
    if (!term || busyRef.current) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    busyRef.current = true;
    setSearching(true);
    setSearchErr("");
    try {
      const result = await searchMedia({ provider, query: term, cursor: append ? cursor : undefined,
        code, pid, signal: controller.signal, paused: pausedRef.current,
        onCooldown: (id, until) => { pausedRef.current[id] = until; } });
      if (requestRef.current !== controller || controller.signal.aborted) return;
      setProvider(result.provider);
      setMemeFallbackNeeded(false);
      if (!append || result.replaceResults) setSel(null);
      setGifs(previous => append && !result.replaceResults ? [...previous, ...result.items] : result.items);
      setSearchedQuery(term);
      setCursor(result.nextCursor);
      setHasMore(Boolean(result.nextCursor));
      if (!result.items.length && !append) setSearchErr("No results — try different keywords");
    } catch (error) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setSearchErr(error instanceof Error ? error.message : "GIF search failed. Please try again.");
      if (error instanceof ProviderError && error.status === 429 && enabledProviders.every(id => (pausedRef.current[id] || 0) > Date.now())) {
        setMemeFallbackNeeded(true);
        await fallbackMode("meme").catch(() => setSearchErr("GIF search is unavailable, and the mode change could not be saved. Please retry."));
      }
    } finally {
      if (requestRef.current === controller) {
        busyRef.current = false;
        setSearching(false);
      }
    }
  };
  const doSearch = (q: string) => runSearch(q);
  const loadMore = () => { if (hasMore && cursor) void runSearch(searchedQuery, true); };

  const STYLES = [
    { key: "random", label: "🎲 Random" },
    { key: "anime", label: "Anime" },
    { key: "watercolor", label: "Watercolor" },
    { key: "pixel", label: "Pixel Art" },
    { key: "oil", label: "Oil Painting" },
    { key: "neon", label: "Neon" },
    { key: "minimal", label: "Minimal" },
    { key: "vintage", label: "Vintage" },
    { key: "comic", label: "Comic" },
  ];

  const reviseAnswer = async () => {
    if (roomAiReady !== true || currentRoundIndex == null) return;
    revisionRef.current?.abort(); const controller = new AbortController(); revisionRef.current = controller;
    setRevising(true); setGenError(""); setAnswerSuggestions([]);
    try {
      const response = await fetch('/api/meme-answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ code, pid, token: getRoomToken(code), gameId: gs.submitDeadline, roundIndex: currentRoundIndex, draft: query.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === 'ai_not_configured' ? 'Ask the host to add a Gemini key to enable AI.' : data.error === 'round_closed' || data.error === 'wrong_answer_mode' ? 'This meme question has ended or changed.' : 'AI suggestions are unavailable. Your answer is still editable.');
      const choices = Array.isArray(data.suggestions) ? data.suggestions.filter(value => typeof value === 'string' && value.trim() && value.length <= 280).slice(0,3) : [];
      if (!choices.length) throw new Error('No suggestions returned. You can still write your own answer.');
      if (!controller.signal.aborted && revisionRef.current === controller) setAnswerSuggestions(choices);
    } catch (error) { if (!controller.signal.aborted) setGenError(error instanceof Error ? error.message : 'AI suggestions are unavailable.'); }
    finally { if (!controller.signal.aborted && revisionRef.current === controller) setRevising(false); }
  };

  const generateImage = async () => {
    if (!query.trim() || roomAiReady !== true || currentRoundIndex == null) return;
    imageRequestRef.current?.abort(); const controller = new AbortController(); imageRequestRef.current = controller;
    setGenerating(true);
    setGenSlow(false);
    setGenError("");
    setGenImageUrl(null);
    clearTimeout(genSlowRef.current!);
    genSlowRef.current = setTimeout(() => setGenSlow(true), 8000);
    try {
      const res = await fetch("/api/generate-image", {
        signal: controller.signal, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode: code, pid, textAnswer: query, style: textStyle, templateId: memeTemplate?.providerId, memeImage: true, token: getRoomToken(code), gameId: gs.submitDeadline, roundIndex: currentRoundIndex }),
      });
      const data = await res.json();
      if (controller.signal.aborted || imageRequestRef.current !== controller) return;
      if (data.error === "round_closed" || data.error === "wrong_answer_mode") { setGenError("This meme question has ended or changed."); return; }
      if (data.error === "not_configured") { setRoomAiReady(false); setGenError("No Gemini key set — ask the host to add one in the lobby"); return; }
      if (data.error === "invalid_key") { setGenError("Invalid Gemini key — ask the host to update it in the lobby"); return; }
      if (data.error === "forbidden") { setGenError("Room authorization failed — rejoin the room"); return; }
      if (data.error === "provider_bad_request") { setGenError("Gemini rejected the request (model/config). Please try again later."); return; }
      if (data.error === "generation_blocked") { setGenError("Gemini blocked this image request. Try different wording."); return; }
      if (data.error === "provider_no_image") { setGenError("Gemini returned no image for this request. Please retry."); return; }
      if (data.error === "generation_timeout") { setGenError("Image generation timed out. Please retry."); return; }
      if (data.error === "storage_not_configured") { setGenError("Image storage is not configured on server (missing BLOB_READ_WRITE_TOKEN)."); return; }
      if (data.error === "storage_failed") { setGenError("Image generated but failed to save. Please retry."); return; }
      if (data.error === "rate_limited") {
        const wait = Number(data.retryAfter);
        setGenError(`Too many image generations in this room. Try again in ${Number.isFinite(wait) ? Math.max(1, Math.ceil(wait)) : 30}s.`);
        return;
      }
      if (data.error === "generation_busy") { setGenError("Gemini is currently busy. Please retry in a few seconds."); return; }
      if (data.error || !data.url) { setGenError("Generation failed — try again"); return; }
      setGenImageUrl(data.url);
    } catch {
      if (!controller.signal.aborted) setGenError("Generation failed — check your connection");
    } finally {
      if (controller.signal.aborted || imageRequestRef.current !== controller) return;
      clearTimeout(genSlowRef.current!);
      genSlowRef.current = null;
      setGenSlow(false);
      setGenerating(false);
    }
  };

  const submitSub = async (sub: Submission) => {
    if (currentRoundIndex == null) return;
    const fresh = await fetchGs() || gs;
    if (fresh.phase !== "submitting" || fresh.submitDeadline !== gs.submitDeadline || fresh.submitDeadline <= Date.now()) throw new Error("This submission round has ended.");
    const existing = ((fresh.submissions || {}) as Record<string, Array<Submission>>)[pid] || [];
    const freshAssignedRounds = getAssignedRoundIndexes(fresh, pid);
    const submitAt = freshAssignedRounds.find(ri => existing?.[ri] == null);
    if (submitAt == null || submitAt !== currentRoundIndex) throw new Error("This answer has already been submitted.");
    if (!submissionAllowedForQuestion(fresh, submitAt, sub, Boolean(apiKey))) throw new Error("The answer mode for this question changed. Please use the current mode.");
    const newArr = [...existing];
    newArr[submitAt] = sub;
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
      if (!await writeGs(newState)) throw new Error("Could not save your answer. Please try again.");
    }
    if (sub.source === "local" && sub.assetId?.startsWith("local:")) recordStockEvent({ code, pid, token: getRoomToken(code), gameId: gs.submitDeadline, roundIndex: submitAt }, "selected", [sub.assetId.slice(6)]);
  };
  const submitMedia = async (item: MediaResult) => {
    await submitSub({ type: "media", source: item.source, assetId: item.id, mediaFormat: item.format,
      url: item.displayUrl, preview: item.previewUrl, attribution: item.attribution, license: item.license });
  };
  const submit = async () => {
    if (!sel || gifSubmitting || searching || switchingToMeme || memeFallbackNeeded) return;
    setGifSubmitting(true); setSearchErr('');
    try { await submitMedia(sel); void reportMediaSelection(sel, code, pid); }
    catch (error) { setSearchErr(error instanceof Error ? error.message : 'Could not submit your GIF. Please retry.'); }
    finally { setGifSubmitting(false); }
  };
  const retryMemeFallback = async () => {
    if (switchingToMeme) return;
    setSwitchingToMeme(true);
    try { await fallbackMode('meme'); }
    catch { setSearchErr('Could not switch this question to Meme mode. Check your connection and retry.'); }
    finally { setSwitchingToMeme(false); }
  };
  const submitMemeAnswer = async () => {
    if (!query.trim() || memeSubmitting || generating) return;
    setMemeSubmitting(true); setGenError('');
    try { await submitSub(genImageUrl ? { type: "ai", url: genImageUrl, textAnswer: query.trim() } : { type: "text", textAnswer: query.trim() }); }
    catch (error) { setGenError(error instanceof Error ? error.message : 'Could not submit. Please retry.'); }
    finally { setMemeSubmitting(false); }
  };

  const forceStart = async () => {
    if (transitioning.current) return;
    transitioning.current = true;
    try {
      const fresh = await fetchGs() || gs;
      await transitionToVoting(fresh);
    } finally { transitioning.current = false; }
  };

  const totalSubmitSecs = (gs.submitSecs ?? SUBMIT_SECS) * rounds;

  // Waiting screen — this player finished all their submissions
  if (isDone) {
    return (
      <div style={g.page}>
        <div style={g.card}>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:13,color:C.muted}}>Time remaining</div>
              <div style={{...g.timer,fontSize:26,color:tc,animation:t<=10?"timerPulse 0.6s ease-in-out infinite":undefined}}>{t}s</div>
            </div>
            <div style={{height:4,background:C.card2,borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",background:tc,width:`${Math.min(100,(t/totalSubmitSecs)*100)}%`,transition:"width 0.4s linear",borderRadius:4}}/>
            </div>
          </div>
          <div style={{textAlign:"center",marginBottom:18}}>
            <div style={{fontSize:44,marginBottom:4}}>✅</div>
            <div style={g.h2}>All done!</div>
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
                  {done?"✓ Done":`${count}/${pAssigned.length || rounds}`}
                </span>
              </div>
            );
          })}
          {isHost && (
            <button className="gbtn" style={{...g.btn,...g.btnP,marginTop:8,marginBottom:0}} onClick={forceStart}>
              ⚡ Force Start Voting
            </button>
          )}
        </div>
      </div>
    );
  }

  // Active submission screen
  return (
    <div className="game-page" style={g.pageTop}>
      <div className="game-card" style={{...g.wCard,maxWidth:960}}>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:13,color:C.muted}}>
              {`Question ${myDoneCount+1} / ${myTargetCount}`}
              {currentMeta ? ` · Round ${currentMeta.cycle + 1}/${rounds} · Heat ${currentMeta.heat + 1}/${currentMeta.heatsInCycle}` : ""}
            </div>
            <div style={{...g.timer,fontSize:28,color:tc,animation:t<=10?"timerPulse 0.6s ease-in-out infinite":undefined}}>{t}s</div>
          </div>
          <div style={{height:4,background:C.card2,borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",background:tc,width:`${Math.min(100,(t/totalSubmitSecs)*100)}%`,transition:"width 0.4s linear",borderRadius:4}}/>
          </div>
        </div>
        <div style={g.prompt}>"{currentPrompt}"</div>

        {/* Shared text area */}
        {<textarea
          style={{...g.inp, resize:"none", height:64, marginBottom:10} as React.CSSProperties}
          placeholder={activeTab === "giphy" ? "Search GIFs" : "Your answer or meme idea…"}
          maxLength={activeTab === "meme" ? 280 : undefined} disabled={generating || memeSubmitting}
          value={query}
          onChange={e => {
            const v = e.target.value;
            setQuery(v);
            revisionRef.current?.abort(); setRevising(false); setAnswerSuggestions([]);
            setGenImageUrl(null);
            setGenError("");
          }}
          onKeyDown={e => {
            if (activeTab === "giphy" && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault(); void doSearch(query);
            }
          }}
          autoFocus
        />}

        {modeChoiceEnabled ? <div role="group" aria-label="Answer mode" style={{display:'flex',gap:8,marginBottom:12}}>
          {(apiKey ? ['giphy','meme'] : ['meme']).map(mode => <button key={mode} type="button" aria-pressed={activeTab === mode}
            style={{...g.btnSm,flex:1,background:activeTab === mode ? C.text : C.card2,color:activeTab === mode ? C.bg : C.text}}
            onClick={() => setChosenMode(mode as 'giphy' | 'meme')}>{mode === 'giphy' ? 'Search GIFs' : 'Create Meme'}</button>)}
        </div> : <div style={{...g.info, fontWeight:700, marginBottom:12}} aria-label="Required answer mode">
          {answerModeLabels[activeTab]} · This question uses one answer mode.
        </div>}
        {gs.answerModeOverrides?.[currentRoundIndex] && <div role="status" style={g.info}>
          GIF search is unavailable. This question now uses Meme mode for everyone still answering.
        </div>}

        {/* Search GIFs tab */}
        {activeTab === "giphy" && (
          <>
            <button className="gbtn" style={{...g.btn,...g.btnP}} disabled={searching || gifSubmitting || switchingToMeme || !query.trim()}
              onClick={() => void doSearch(query)}>{searching ? "Searching…" : "Search"}</button>
            <div style={{fontSize:12,color:C.muted,marginBottom:8}}>Searching {providerLabels[provider]}{searchedQuery ? ` · Results for “${searchedQuery}”` : ""}</div>
            {gifs.length > 0 && (
              <div className="media-grid" style={{display:"grid",gap:6,maxHeight:"min(52vh, 520px)",overflowY:"auto",marginBottom:12}}>
                {gifs.map(gif => (
                  <div key={gif.id} onClick={() => setSel(gif)}
                    style={{position:"relative",paddingBottom:"100%",borderRadius:8,overflow:"hidden",cursor:"pointer",
                      border:sel?.id===gif.id?`3px solid ${C.accent}`:"3px solid transparent",
                      transition:"border-color 0.15s"}}>
                    <div style={{position:"absolute",inset:0}}>
                      <GifImg url={gif.previewUrl} lazy style={{width:"100%",height:"100%"}} fit="contain"/>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {searching && <div style={g.info}>Searching…</div>}
            {searchErr && !searching && <div style={g.err}>⚠ {searchErr}</div>}
            {memeFallbackNeeded && <button type="button" style={{...g.btn,...g.btnS}} disabled={switchingToMeme || searching} onClick={() => void retryMemeFallback()}>
              {switchingToMeme ? 'Switching…' : 'Switch this question to Meme'}
            </button>}
            {hasMore && !searching && !gifSubmitting && !searchErr && (
              <button className="gbtn" onClick={loadMore}
                style={{...g.btnSm,width:"100%",marginBottom:12,background:C.card2,color:C.text,border:`1px solid ${C.muted}44`}}>
                Load more GIFs
              </button>
            )}
            <MediaAttribution source={provider}/>
            {sel && (
              <div style={{textAlign:"center",marginBottom:12}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:3,marginBottom:6,fontWeight:600}}>SELECTED</div>
                <GifImg url={sel.previewUrl} style={{width:200,height:150,borderRadius:8,margin:"0 auto",border:`2px solid ${C.accent}`}}/>
              </div>
            )}
            <button className="gbtn" style={{...g.btn,...(sel?g.btnP:{background:C.card2,color:C.muted}),cursor:sel?"pointer":"not-allowed",marginBottom:0}}
              onClick={() => void submit()} disabled={!sel || searching || gifSubmitting || switchingToMeme || memeFallbackNeeded}>
              {gifSubmitting ? "Submitting…" : sel?"Submit GIF":"Select a GIF first"}
            </button>
          </>
        )}

        {/* Meme: written answers, AI creation, and captioned templates */}
        {activeTab === "meme" && (
          <>
            {roomAiReady === false && <div role="status" style={g.info}>
              {isHost ? "Add a Gemini key in the lobby before starting to enable AI writing, captions and meme images." : "Ask the host to add a Gemini key in the lobby to enable AI writing, captions and meme images."}
              {" You can still write an answer or caption a template yourself."}
            </div>}
            <button type="button" disabled={roomAiReady !== true || revising || generating || memeSubmitting} style={{...g.btn,...g.btnS}} onClick={() => void reviseAnswer()}>
              {revising ? 'Thinking…' : query.trim() ? 'Make it funnier with AI' : 'Suggest a funny answer with AI'}
            </button>
            {answerSuggestions.map((choice,index) => <button type="button" key={index} style={{...g.btn,...g.btnS}} disabled={generating || memeSubmitting}
              onClick={() => { setQuery(choice); setGenImageUrl(null); setAnswerSuggestions([]); }}>{choice}</button>)}
            <div style={{display:'flex',gap:8,marginBottom:12}}>
              <button type="button" style={{...g.btn,...g.btnS,flex:1}} disabled={generating || memeSubmitting || !query.trim()} onClick={() => setTemplateSearch(query.trim().slice(0,200))}>Search</button>
              <button type="button" style={{...g.btn,...g.btnS,flex:1}} disabled={generating || memeSubmitting} onClick={() => { setMemeTemplate(null); setGenImageUrl(null); }}>Text only</button>
            </div>
            <LocalPicks key={`meme-${currentRoundIndex}`} captionableOnly seed={catalogSeed(`${code}:${pid}:${gs.submitDeadline}:${currentRoundIndex}`)} searchQuery={templateSearch} selectedId={memeTemplate?.id || ''} disabled={generating || memeSubmitting}
              onSelect={template => { setMemeTemplate(template); setGenImageUrl(null); setGenError(''); }}
              onExposure={ids => recordStockEvent({ code, pid, token: getRoomToken(code), gameId: gs.submitDeadline, roundIndex: currentRoundIndex }, "exposed", ids)} onSubmit={submitMedia} colors={C} styles={g}/>
            {templateSearch && <div style={g.info}>Images matching “{templateSearch}” · <button type="button" style={g.btnSm} onClick={() => setTemplateSearch('')}>Browse all</button></div>}
            <details style={{marginBottom:12}}>
              <summary style={{cursor:'pointer',fontSize:12}}>AI image style · {textStyle}</summary>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {STYLES.map(s => (
                  <button key={s.key} disabled={generating || memeSubmitting} onClick={()=>{ setTextStyle(s.key); setGenImageUrl(null); setGenError(""); }}
                    style={{...g.btnSm,
                      background:textStyle===s.key?C.text:C.card2,
                      color:textStyle===s.key?C.bg:C.text,
                      border:textStyle===s.key?"none":`1px solid ${C.muted}44`}}>
                    {s.label}
                  </button>
                ))}
              </div>
            </details>
            {genImageUrl && (
              <div style={{textAlign:"center",marginBottom:12}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:3,marginBottom:6,fontWeight:600}}>GENERATED IMAGE</div>
                <img src={genImageUrl} alt="AI generated"
                  style={{width:200,height:150,objectFit:"cover",borderRadius:8,margin:"0 auto",display:"block",
                    border:`2px solid ${C.accent}`}}/>
              </div>
            )}
            {genError && <div style={g.err}>⚠ {genError}</div>}
            {generating && genSlow && (
              <div style={g.info}>Still generating… this can take up to about 45 seconds.</div>
            )}
            <button className="gbtn" style={{...g.btn,...g.btnS}} onClick={generateImage}
              disabled={generating || memeSubmitting || !query.trim() || roomAiReady !== true}>
              {generating ? 'Generating…' : genImageUrl ? 'Regenerate image with AI' : memeTemplate ? 'Generate with AI using this idea' : 'Generate image with AI'}
            </button>
            {memeTemplate && <div style={g.info}>AI creates a new scene inspired by the selected image and your caption.</div>}
            {memeTemplate && !genImageUrl && !generating ? <MemeEditor key={memeTemplate.id} template={memeTemplate} code={code} pid={pid}
              token={getRoomToken(code)} gameId={gs.submitDeadline} roundIndex={currentRoundIndex} caption={query} onBusyChange={setMemeSubmitting} submitLabel="Submit" aiEnabled={false} styles={g} onSubmit={async (meme: CreatedMeme) => {
                await submitSub({ type: "meme", source: "local", templateId: meme.templateId, assetId: `local:${meme.templateId}`,
                  mediaFormat: "image", captions: meme.captions, url: meme.url, preview: meme.url, attribution: meme.attribution, license: meme.license });
              }}/> : <>
              <div role="status" style={g.info}>{generating ? 'Creating your image…' : genImageUrl ? 'Ready to submit your AI image.' : 'Ready to submit text only. Choose an image to turn it into a meme.'}</div>
              <button className="gbtn" style={{...g.btn,...g.btnP,marginBottom:0}} disabled={!query.trim() || generating || memeSubmitting} onClick={() => void submitMemeAnswer()}>{memeSubmitting ? 'Submitting…' : 'Submit'}</button>
            </>}
          </>
        )}

      </div>
    </div>
  );
}

// ── Voting ────────────────────────────────────────────────────────────────────
function Voting({ gs, pid, code, isHost, fetchGs, writeGs, transitioning, advanceMatchup }) {
  const { C, g } = useContext(ThemeCtx);
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

  useEffect(() => {
    if (!matchup || matchup.includes(pid)) return;
    const ids = matchup.map(id => gs.submissions?.[id]?.[gs.votingRound]).filter(sub => sub?.source === "local" && sub.assetId?.startsWith("local:")).map(sub => sub.assetId.slice(6));
    recordStockEvent({ code, pid, token: getRoomToken(code), gameId: gs.submitDeadline, roundIndex: gs.votingRound, matchup: mi }, "vote_exposed", ids);
  }, [mi, gs.votingRound]);

  if(!matchup) return <div style={g.page}><div style={{color:C.muted}}>Tallying…</div></div>;

  const [lId,rId]=matchup;
  const inMatchup=pid===lId||pid===rId;
  const canVote=!inMatchup&&!myVote&&!showRes;

  const vote=async(side)=>{
    if(!canVote)return;
    await storage.set(vKey(code, gs.votingRound, mi, pid), side);
    setMyVote(side);
    const sub = gs.submissions?.[side === "left" ? lId : rId]?.[gs.votingRound];
    if (sub?.source === "local" && sub.assetId?.startsWith("local:")) recordStockEvent({ code, pid, token: getRoomToken(code), gameId: gs.submitDeadline, roundIndex: gs.votingRound, matchup: mi }, "voted", [sub.assetId.slice(6)]);
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
  const subs = (gs.submissions || {}) as Record<string, Array<Submission>>;
  const lSub = subs[lId]?.[gs.votingRound];
  const rSub = subs[rId]?.[gs.votingRound];
  const currentPrompt = (gs.prompts as string[])?.[gs.votingRound] ?? "";

  const GifCard=({sub,id,side})=>{
    const isWinner=showRes&&(side==="left"?lv>rv:rv>lv);
    const isTie=showRes&&lv===rv;
    const myVoteThis=myVote===side;
    const voteCount=side==="left"?lv:rv;
    const subType = sub?.type || (sub?.url ? "giphy" : null);
    // Left answer is always the red corner, right is always the blue corner
    const corner = side==="left" ? C.accent : C.blue;
    const cornerName = side==="left" ? "RED" : "BLUE";
    const lost = showRes && !isWinner && !isTie;
    return(
      <div className="gif-vote-card" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,minWidth:0,
        opacity:lost?0.45:1,transition:"opacity 0.3s ease, transform 0.18s ease"}}>
        {(() => {
          const frame = (
            <div style={{borderRadius:10,overflow:"hidden",width:"100%",position:"relative",
              border:`3px solid ${isTie?C.yellow:showRes||myVoteThis?corner:`${corner}66`}`,
              transition:"border-color 0.2s"}}>
              <div style={{position:"absolute",top:0,[side==="left"?"left":"right"]:0,zIndex:1,background:corner,color:"#fff",
                fontFamily:FONT_DISPLAY,fontWeight:800,fontSize:14,letterSpacing:1.5,padding:"3px 10px",
                borderBottomRightRadius:side==="left"?8:0,borderBottomLeftRadius:side==="left"?0:8}}>
                {cornerName} CORNER
              </div>
              {subType === "text"
                ? <div className="vote-gif" style={{background:`${corner}14`,
                    display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
                    <div style={{fontSize:"clamp(17px, 2.2vw, 26px)",fontWeight:700,textAlign:"center",color:C.text,lineHeight:1.4,fontStyle:"italic"}}>
                      "{sub.textAnswer}"
                    </div>
                  </div>
                : subType === "ai" && sub.url
                ? <div style={{position:"relative"}}>
                    <img src={sub.url} alt="AI generated" className="vote-gif"
                      style={{width:"100%",objectFit:"contain",display:"block",background:C.card2}}/>
                    <div style={{position:"absolute",bottom:6,[side==="left"?"right":"left"]:6,background:`${C.bg}cc`,
                      borderRadius:6,padding:"2px 6px",fontSize:10,color:C.text,fontWeight:700,letterSpacing:1}}>
                      ✨ AI
                    </div>
                  </div>
                : sub?.url
                ? <GifImg className="vote-gif" url={sub.url} fit="contain" style={{width:"100%"}}/>
                : <div className="vote-gif" style={{background:C.card2,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted}}>No submission</div>}
              {canVote && (
                <div style={{background:corner,color:"#fff",fontFamily:FONT_DISPLAY,fontWeight:800,fontSize:20,letterSpacing:1.5,padding:"8px 0"}}>
                  VOTE {cornerName}
                </div>
              )}
            </div>
          );
          return canVote
            ? <button type="button" className="vote-pick" aria-label={`Vote for the ${side} answer (${cornerName.toLowerCase()} corner)`}
                style={{color:corner}} onClick={()=>vote(side)}>{frame}</button>
            : frame;
        })()}
        <MediaAttribution source={submissionSource(sub)} attribution={sub?.attribution} license={sub?.license}/>
        {subType === "ai" && sub?.textAnswer && (
          <div style={{fontSize:12,color:C.muted,textAlign:"center",fontStyle:"italic",maxWidth:"100%",
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            "{sub.textAnswer}"
          </div>
        )}
        {showRes&&(
          <div style={{fontWeight:800,fontSize:24,fontFamily:FONT_DISPLAY,letterSpacing:1,color:isWinner?corner:isTie?C.yellow:C.muted}}>
            {voteCount} {voteCount!==1?"VOTES":"VOTE"}{isWinner?" 🏆":isTie?" 🤝":""}
          </div>
        )}
        {!showRes&&id===pid&&<div style={{color:C.yellow,fontSize:13,fontWeight:700,letterSpacing:1}}>★ YOUR GIF</div>}
        {!showRes&&myVoteThis&&id!==pid&&<div style={{color:C.green,fontSize:13,fontWeight:700,letterSpacing:1}}>✓ VOTED</div>}
      </div>
    );
  };

  return(
    <div className="game-page" style={g.pageTop}>
      <div className="game-card" style={{...g.wCard,maxWidth:1320}}>
        <div style={{marginBottom:10}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:13,color:C.muted}}>
              {meta
                ? `Round ${meta.cycle + 1}/${rounds} · Heat ${meta.heat + 1}/${meta.heatsInCycle} · Matchup ${mi+1}/${gs.matchups.length}`
                : `Round ${gs.votingRound+1} / ${rounds} · Matchup ${mi+1}/${gs.matchups.length}`}
            </div>
            <div style={{...g.timer,fontSize:34,color:tc,animation:t<=5?"timerPulse 0.5s ease-in-out infinite":undefined}}>{t}s</div>
          </div>
          <div style={{height:4,background:C.card2,borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",background:tc,width:`${Math.min(100,(t/vSecs)*100)}%`,transition:"width 0.4s linear",borderRadius:4}}/>
          </div>
        </div>
        <div style={{...g.prompt,fontSize:"clamp(18px, 2vw, 26px)",padding:"10px 0 14px"}}>"{currentPrompt}"</div>
        <div className="vote-grid" style={{display:"grid",gap:16,alignItems:"start",marginBottom:12}}>
          <GifCard sub={lSub} id={lId} side="left"/>
          <div style={{display:"flex",justifyContent:"center",alignSelf:"center"}}>
            <div className="vote-vs" style={{fontSize:34,fontFamily:FONT_DISPLAY,fontWeight:800,letterSpacing:1,lineHeight:1,
              background:C.hi,color:C.onHi,padding:"6px 10px 4px",borderRadius:4,transform:"rotate(-4deg)"}}>
              VS
            </div>
          </div>
          <GifCard sub={rSub} id={rId} side="right"/>
        </div>

        <div style={{textAlign:"center",color:C.muted,fontSize:13,marginTop:8}}>
          {showRes?(lv>rv?"Red corner wins.":rv>lv?"Blue corner wins.":"Tie. Both get a point.")+" Next matchup soon…"
            :inMatchup?"Your answer is in this matchup. Others are voting."
            :myVote?"Vote cast. Waiting for the timer…":"Tap the funnier answer to vote."}
        </div>
      </div>
    </div>
  );
}

// ── Round Results ─────────────────────────────────────────────────────────────
function RoundResults({ gs, isHost, nextVotingRound, transitioning }) {
  const { C, g } = useContext(ThemeCtx);
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
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:44,marginBottom:4}}>🏆</div>
          <div style={g.h2}>
            {meta
              ? `Round ${meta.cycle + 1}/${rounds} · Heat ${meta.heat + 1}/${meta.heatsInCycle} Results`
              : `Round ${(gs.votingRound ?? 0) + 1} Results`}
          </div>
          {rWinnerNames.length>0&&<div style={{color:C.yellow,fontWeight:700,fontSize:15}}>{rWinnerNames.join(" & ")} won this round!</div>}
        </div>
        <Scoreboard players={sorted} highlightIds={rWinners}/>
        <div style={{marginTop:16,textAlign:"center"}}>
          <div style={{color:C.muted,fontSize:13,marginBottom:12}}>
            {isLast
              ? `Final results in ${t}s…`
              : nextMeta
                ? `Round ${nextMeta.cycle + 1}/${rounds} · Heat ${nextMeta.heat + 1}/${nextMeta.heatsInCycle} starts in ${t}s…`
                : `Next round starts in ${t}s…`}
          </div>
          {isHost && (
            <button className="gbtn" style={{...g.btn,...g.btnP,marginBottom:0}} onClick={() => {
              if (advRef.current || transitioning.current) return;
              advRef.current = true; transitioning.current = true;
              nextVotingRound().finally(() => { transitioning.current = false; });
            }}>{isLast ? "Show Results Now" : "▶ Skip Wait"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Game Over ─────────────────────────────────────────────────────────────────
function GameOver({ gs, writeGs, pid, runEndGameCleanup }) {
  const { C, g } = useContext(ThemeCtx);
  const rounds = getRounds(gs);
  const sorted=[...gs.players].sort((a,b)=>b.score-a.score);
  const medals=["🥇","🥈","🥉"];
  const prompts = (gs.prompts || []) as string[];
  const subs = (gs.submissions || {}) as Record<string, Array<Submission>>;
  const [downloading, setDownloading] = useState(false);
  const [downloadErr, setDownloadErr] = useState("");
  useEffect(() => {
    if (pid !== gs.host) return;
    void fetch("/api/gif-events", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: gs.code, pid, provider: primaryProvider, event: "game_completed" }), keepalive: true }).catch(() => {});
    try { sessionStorage.removeItem("gifbattle_gemini_key"); } catch {}
    fetch("/api/gemini-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: gs.code, pid, key: "" }),
    }).catch(() => {});
  }, [gs.code, gs.host, pid]);
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
  const summaryMediaHeight = 180;

  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");

  const downloadResults = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadErr("");
    try {
      const now = new Date();
      const generatedAt = now.toLocaleString();
      const timestamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const aiUrls = Array.from(new Set(
        Object.values(subs || {})
          .flat()
          .filter((s: Submission) => (s?.type === "ai" || s?.type === "meme") && typeof s?.url === "string")
          .map((s: Submission) => s.url as string)
      ));
      const aiDataUrlMap = new Map<string, string>();
      await Promise.all(aiUrls.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return;
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => reject(new Error("read_failed"));
            reader.readAsDataURL(blob);
          });
          if (dataUrl) aiDataUrlMap.set(url, dataUrl);
        } catch {}
      }));
      const scoreRowsHtml = sorted.map((p, i) => (
        `<tr><td>${i + 1}</td><td>${escapeHtml(p.nickname)}</td><td>${p.score}</td></tr>`
      )).join("");
      const summaryHtml = summaryRows.map((row) => {
        const cardsHtml = row.participants.map((playerId) => {
          const sub = subs[playerId]?.[row.idx];
          const nick = playerNameById.get(playerId) || "Player";
          if (sub?.type === "text") {
            return `<div class="card"><div class="name">${escapeHtml(nick)}</div><div class="text-answer">"${escapeHtml(sub.textAnswer || "")}"</div></div>`;
          }
          if (sub?.url) {
            const rawSrc = (sub?.type === "ai" || sub?.type === "meme") ? (aiDataUrlMap.get(sub.url) || sub.url) : sub.url;
            const imageSrc = rawSrc.startsWith("/media/") ? new URL(rawSrc, window.location.origin).href : rawSrc;
            const source = submissionSource(sub);
            const credit = source === "giphy" ? `<a href="https://giphy.com">Powered by GIPHY</a>` : source === "klipy" ? `<a href="https://klipy.com">Powered by KLIPY</a>` : source === "local" && sub.attribution && safeHttps(sub.attribution.url) ? `<a href="${escapeHtml(sub.attribution.url)}">${escapeHtml(sub.attribution.label)}</a>${sub.license && safeHttps(sub.license.url) ? ` · <a href="${escapeHtml(sub.license.url)}">${escapeHtml(sub.license.label)}</a>` : ""}` : "";
            const badge = sub?.type === "ai" ? `<span class="badge">AI</span>` : `<span class="badge">${sub.type === "meme" ? "MEME" : sub.mediaFormat === "image" ? "IMAGE" : "GIF"}</span>`;
            const caption = sub?.textAnswer ? `<div class="caption">"${escapeHtml(sub.textAnswer)}"</div>` : "";
            return `<div class="card"><div class="name">${escapeHtml(nick)}</div><div class="image-wrap"><img src="${escapeHtml(imageSrc)}" alt="submission" loading="lazy"/>${badge}</div>${credit}${caption}</div>`;
          }
          return `<div class="card"><div class="name">${escapeHtml(nick)}</div><div class="missing">No submission</div></div>`;
        }).join("");
        return `<section class="round"><div class="meta">ROUND ${row.cycle + 1}/${rounds} · HEAT ${row.heat + 1}/${row.heatsInCycle}</div><h3>"${escapeHtml(row.prompt || "No prompt")}"</h3><div class="grid">${cardsHtml}</div></section>`;
      }).join("");

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GIF Battles Results ${escapeHtml(gs.code || "")}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; padding: 28px; background: #14120F; color: #F2EDE4; font-family: "DM Sans", system-ui, -apple-system, sans-serif; }
    h1 { margin: 0 0 8px; font-size: 42px; letter-spacing: 1px; }
    h2 { margin: 18px 0 8px; font-size: 20px; }
    .sub { color: #8A8278; margin-bottom: 12px; }
    .block { background: #1D1A16; border: 1px solid #8A827833; border-radius: 14px; padding: 14px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #8A827833; }
    .round { background: #28241F; border: 1px solid #8A827833; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
    .meta { font-size: 12px; color: #8A8278; letter-spacing: 1px; margin-bottom: 6px; }
    .round h3 { margin: 0 0 10px; font-size: 17px; font-style: italic; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .card { background: #1D1A16; border: 1px solid #8A827833; border-radius: 10px; padding: 8px; }
    .name { font-size: 11px; letter-spacing: 1px; color: #8A8278; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; }
    .image-wrap { position: relative; height: 220px; border-radius: 6px; background: #28241F; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; display: block; background: #28241F; }
    .badge { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.75); color: #F2EDE4; border: 1px solid #8A827866; border-radius: 4px; font-size: 10px; font-weight: 700; padding: 1px 5px; }
    .text-answer { min-height: 220px; border-radius: 6px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; background: #28241F; border: 1px solid #8A827833; }
    .caption { font-size: 12px; color: #8A8278; margin-top: 6px; font-style: italic; text-align: center; }
    .missing { height: 220px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #8A8278; background: #28241F; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <h1>GIF BATTLES RESULTS</h1>
  <div class="sub">Room ${escapeHtml(gs.code || "")} · Generated ${escapeHtml(generatedAt)}</div>
  <div class="block">
    <h2>Final Scoreboard</h2>
    <table>
      <thead><tr><th>#</th><th>Player</th><th>Score</th></tr></thead>
      <tbody>${scoreRowsHtml}</tbody>
    </table>
  </div>
  <div class="block">
    <h2>Game Summary</h2>
    ${summaryHtml}
  </div>
</body>
</html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gifbattles-results-${(gs.code || "room").toLowerCase()}-${timestamp}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadErr("Failed to build results download.");
    } finally {
      setDownloading(false);
    }
  };

  const playAgain=async()=>{
    await runEndGameCleanup(gs, { deleteImages: true });
    const recentPrompts = Array.isArray(gs.prompts) ? gs.prompts : (Array.isArray(gs.usedPrompts) ? gs.usedPrompts : []);
    await writeGs({
      ...gs, phase:"lobby",
      players:gs.players.map(p=>({...p,score:0})),
      prompts:[], submissions:{}, doneSubmitting:[], votingRound:0,
      matchups:[], currentMatchup:0, roundMatchupWins:{}, submitDeadline:null, voteDeadline:null, usedPrompts: recentPrompts, roundPlan:[],
      rounds: getRounds(gs),
      namePromptRounds: getNamePromptRounds(gs),
      customPrompts: gs.customPrompts || []
    });
  };
  return(
    <div className="game-page" style={g.pageTop}>
      <div className="game-card" style={{...g.wCard,maxWidth:1100}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:56,marginBottom:4}}>🎊</div>
          <div style={{fontSize:88,fontWeight:800,fontFamily:FONT_DISPLAY,letterSpacing:1,color:C.text,lineHeight:0.9,marginBottom:10}}>
            GAME OVER
          </div>
          <div style={{fontSize:20,fontWeight:700,color:C.yellow}}>
            👑 {sorted[0]?.nickname} wins!
          </div>
        </div>
        <div style={{marginBottom:18}}>
          {sorted.map((p,i)=>(
            <div key={p.id} style={{...g.pRow,
              background:i===0?`${C.accent}12`:C.card2,
              borderLeft:i===0?`3px solid ${C.accent}`:"3px solid transparent",
}}>
              <div style={g.row}>
                <span style={{fontSize:22}}>{medals[i]||"🎖"}</span>
                <span style={{fontWeight:i===0?800:500,fontSize:i===0?16:15}}>{p.nickname}</span>
                {p.id===pid&&<span style={{...g.badge,background:`${C.blue}18`,color:C.blue}}>YOU</span>}
              </div>
              <span style={{fontWeight:900,fontSize:i===0?20:15,fontFamily:FONT_MONO,color:i===0?C.accent:C.text}}>{p.score}</span>
            </div>
          ))}
        </div>

        <div style={{background:C.card2,borderRadius:12,padding:"14px 16px",marginBottom:18,border:`1px solid ${C.muted}22`}}>
          <div style={{fontSize:10,color:C.muted,letterSpacing:3,marginBottom:10,fontWeight:600}}>GAME SUMMARY</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:12}}>
            {`${summaryRows.length} heat${summaryRows.length!==1?"s":""} played across ${rounds} round${rounds!==1?"s":""}`}
          </div>
          {summaryRows.map(row => (
            <div key={row.idx} style={{background:`${C.bg}88`,borderRadius:10,padding:"12px 12px 10px",marginBottom:10,border:`1px solid ${C.muted}18`}}>
              <div style={{fontSize:11,color:C.muted,marginBottom:4,letterSpacing:1}}>
                {`ROUND ${row.cycle + 1}/${rounds} · HEAT ${row.heat + 1}/${row.heatsInCycle}`}
              </div>
              <div style={{fontSize:15,fontWeight:600,marginBottom:10,color:C.text,fontStyle:"italic"}}>
                "{row.prompt || "No prompt"}"
              </div>
              <div className="summary-grid" style={{display:"grid",gap:10}}>
                {row.participants.map((playerId) => {
                  const sub = subs[playerId]?.[row.idx];
                  const nick = playerNameById.get(playerId) || "Player";
                  return (
                    <div key={`${row.idx}-${playerId}`} style={{background:C.card,borderRadius:8,padding:"8px",border:`1px solid ${C.muted}22`}}>
                      <div style={{fontSize:11,fontWeight:700,marginBottom:6,color:C.muted,letterSpacing:1}}>{nick.toUpperCase()}</div>
                      {sub?.type === "text"
                        ? <div style={{height:summaryMediaHeight,background:C.card2,borderRadius:6,
                            display:"flex",alignItems:"center",justifyContent:"center",padding:10,
                            border:`1px solid ${C.accent}22`}}>
                            <div style={{fontSize:13,fontWeight:600,color:C.text,textAlign:"center",fontStyle:"italic",lineHeight:1.4}}>
                              "{sub.textAnswer}"
                            </div>
                          </div>
                        : sub?.type === "ai" && sub?.url
                        ? <div>
                            <div style={{position:"relative",height:summaryMediaHeight,background:C.bg,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                              <img src={sub.url} alt="AI" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain",borderRadius:6,display:"block"}}/>
                              <div style={{position:"absolute",top:4,right:4,background:`${C.bg}cc`,borderRadius:4,
                                padding:"1px 5px",fontSize:9,color:C.blue,fontWeight:700,letterSpacing:1}}>✨ AI</div>
                            </div>
                            {sub.textAnswer && (
                              <div style={{fontSize:10,color:C.muted,marginTop:4,fontStyle:"italic",textAlign:"center",
                                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                "{sub.textAnswer}"
                              </div>
                            )}
                          </div>
                        : sub?.url
                        ? <GifImg url={sub.url} style={{height:summaryMediaHeight,borderRadius:6,background:C.bg}} fit="contain"/>
                        : <div style={{height:summaryMediaHeight,background:C.card2,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:12}}>No submission</div>}
                      {sub?.source === "local" && <MediaCredit attribution={sub.attribution} license={sub.license}/>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {Array.from(new Set(Object.values(gs.submissions || {}).flat().map((sub: Submission) => submissionSource(sub)).filter(Boolean)))
          .map((source: string) => <MediaAttribution key={source} source={source}/>)}
        {downloadErr && <div style={g.err}>⚠ {downloadErr}</div>}
        <button className="gbtn" style={{...g.btn,...g.btnS,fontSize:16,letterSpacing:1}} onClick={downloadResults} disabled={downloading}>
          {downloading ? "Preparing Download…" : "↓ Download Results (HTML)"}
        </button>

        <button className="gbtn" style={{...g.btn,...g.btnP,marginBottom:0,fontSize:16,letterSpacing:1}} onClick={playAgain}>↺ Play Again</button>
      </div>
    </div>
  );
}

function Scoreboard({players,highlightIds=[]}){
  const { C, g } = useContext(ThemeCtx);
  const sorted=[...players].sort((a,b)=>b.score-a.score);
  return(
    <div>
      <div style={{fontSize:10,color:C.muted,letterSpacing:3,marginBottom:10,fontWeight:600}}>SCOREBOARD</div>
      {sorted.map((p,i)=>(
        <div key={p.id} style={{...g.pRow,
          background:highlightIds.includes(p.id)?`${C.yellow}14`:C.card2,
          borderLeft:highlightIds.includes(p.id)?`2px solid ${C.yellow}`:"2px solid transparent"}}>
          <div style={{...g.row,gap:8}}>
            <span style={{fontFamily:FONT_MONO,color:i===0?C.accent:C.muted,width:22,fontSize:12,fontWeight:700}}>{i+1}</span>
            <span style={{fontWeight:i===0?700:500}}>{p.nickname}</span>
            {highlightIds.includes(p.id)&&<span style={{fontSize:12}}>⭐</span>}
          </div>
          <span style={{fontWeight:800,fontFamily:FONT_MONO,fontSize:14,color:i===0?C.accent:C.text}}>{p.score}</span>
        </div>
      ))}
    </div>
  );
}
