"use client";

import { useEffect } from "react";

/** Sends uncaught browser errors to the admin log (a few per page view at most). */
export function ErrorReporter() {
  useEffect(() => {
    let sent = 0;
    const seen = new Set<string>();
    const report = (message: string, detail?: string) => {
      if (sent >= 5 || !message || seen.has(message)) return;
      // noise from extensions and cancelled loads
      if (/ResizeObserver loop|Script error\.?$|chrome-extension:|AbortError|Load failed|NetworkError/i.test(message + (detail ?? ""))) return;
      seen.add(message);
      sent++;
      fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.slice(0, 500), detail: detail?.slice(0, 3000), path: location.pathname }),
        keepalive: true,
      }).catch(() => {});
    };
    const onError = (e: ErrorEvent) => report(e.message, e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => report(String((e.reason as Error)?.message ?? e.reason), (e.reason as Error)?.stack);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
