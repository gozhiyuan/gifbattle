import * as Sentry from "@sentry/nextjs";

const tracesSampleRate = Number.parseFloat(
  process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"
);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.1,
});

// Activated by Next.js 15+ — inert in Next.js 14 (Sentry.init above still runs via webpack injection)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
