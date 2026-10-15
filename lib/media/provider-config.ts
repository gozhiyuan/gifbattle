import { createGiphyProvider } from "./providers/giphy";
import { createKlipyProvider } from "./providers/klipy";
import { RemoteProvider } from "./types";
export const providerLabels = { giphy: "GIPHY", klipy: "KLIPY" };
export const GIF_CATEGORIES = ["Awkward", "Panic", "Nope", "Celebration", "Confused", "Angry", "Suspicious", "Facepalm", "Fail", "Shocked"];
export const PAGE_SIZE = 24;
export const remoteProviders = {
  giphy: process.env.NEXT_PUBLIC_GIPHY_KEY ? createGiphyProvider(process.env.NEXT_PUBLIC_GIPHY_KEY) : null,
  klipy: process.env.NEXT_PUBLIC_KLIPY_KEY ? createKlipyProvider(process.env.NEXT_PUBLIC_KLIPY_KEY) : null,
};
export const enabledProviders = (Object.keys(remoteProviders) as RemoteProvider[]).filter(id => remoteProviders[id]);
export const primaryProvider: RemoteProvider = enabledProviders.includes(process.env.NEXT_PUBLIC_GIF_PROVIDER as RemoteProvider)
  ? process.env.NEXT_PUBLIC_GIF_PROVIDER as RemoteProvider : enabledProviders[0] || "giphy";
// Players use one search; provider attribution follows the returned results.
export const automaticFallback = process.env.NEXT_PUBLIC_GIF_AUTO_FALLBACK !== "false";
