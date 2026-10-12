"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Me = {
  loginAvailable: boolean;
  user: { handle: string; name: string | null; avatar: string | null; plus: boolean; plusUntil: string | null } | null;
  usage: { plan: "guest" | "free" | "plus"; used: number; resetsAt: string | null; capped: boolean; debate: boolean };
  /** post an answer on X → a free 2-hour session (once a day); null for guests */
  shareBonus?: { available: boolean } | null;
};

type Auth = {
  me: Me | null;
  refresh: () => Promise<void>;
  /** where "Log in with X" goes, coming back to the current page */
  loginHref: string;
  /** open the login dialog (guest hit the one-message limit) */
  askLogin: () => void;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [wall, setWall] = useState(false);
  const path = usePathname() ?? "/";
  const loginHref = `/api/auth/x/login?next=${encodeURIComponent(path)}`;

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.ok) setMe(await r.json());
    } catch {
      /* offline: keep the last known state */
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Ctx.Provider value={{ me, refresh, loginHref, askLogin: () => setWall(true) }}>
      {children}
      {wall && <LoginWall href={loginHref} available={me?.loginAvailable ?? true} onClose={() => setWall(false)} />}
    </Ctx.Provider>
  );
}

export function useAuth(): Auth {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside <AuthProvider>");
  return c;
}

/** X's mark, drawn on the pixel grid. */
export function XGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
      <path d="M0 0h2v1h-2zM1 1h2v1h-2zM2 2h2v1h-2zM3 3h1v1h-1zM3 4h2v1h-2zM4 5h2v1h-2zM5 6h2v1h-2zM5 0h2v1h-2zM4 1h2v1h-2zM2 4h1v1h-1zM1 5h2v1h-2zM0 6h2v1h-2z" fill="currentColor" />
    </svg>
  );
}

function LoginWall({ href, available, onClose }: { href: string; available: boolean; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-void/70 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="login-title" onClick={onClose}>
      <div className="sheet-in-up w-full max-w-[420px] rounded-panel border border-line bg-panel p-6" onClick={(e) => e.stopPropagation()}>
        <h2 id="login-title" className="text-h3">
          Keep talking — log in with X
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-particle">
          Free account: a fresh session every 4 hours, and your chats are saved. X only shares your public profile — no email, no posting.
        </p>
        {available ? (
          <a href={href} className="btn-ceramic mt-6 w-full">
            <XGlyph /> Log in with X
          </a>
        ) : (
          <p className="mt-6 text-sm text-muted">Login opens shortly.</p>
        )}
        <button onClick={onClose} className="link-quiet mt-4 w-full justify-center">
          Not now
        </button>
      </div>
    </div>
  );
}

/** Session meter under the inputs: what's left, and when it refills. */
export function UsageMeter({ className = "" }: { className?: string }) {
  const { me, loginHref } = useAuth();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!me) return null;
  if (!me.user) {
    if (!me.loginAvailable) return null;
    return (
      <p className={`font-pixel text-xs text-muted ${className}`}>
        1 free message ·{" "}
        <a href={loginHref} className="text-particle underline decoration-line-hover underline-offset-4 hover:text-ceramic">
          log in with X
        </a>{" "}
        for a session every 4h
      </p>
    );
  }
  const u = me.usage;
  const left = Math.max(0, 1 - u.used);
  const reset = u.resetsAt ? untilText(u.resetsAt) : null;
  const cells = 20;
  return (
    <div className={`flex items-center gap-3 font-pixel text-xs text-muted ${className}`}>
      <span className="inline-flex gap-[2px]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left * 100)} aria-label="Session left">
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className="h-2 w-[5px]" style={{ background: i < Math.round(left * cells) ? (left < 0.2 ? "var(--ii-verdict-sell)" : "var(--ii-particle)") : "var(--ii-line)" }} />
        ))}
      </span>
      <span>
        {u.plan === "plus" ? "Plus" : "Free"} session · {Math.round(left * 100)}% left{reset ? ` · refills in ${reset}` : ""}
      </span>
      {u.plan !== "plus" && (
        <a href="/account#plus" className="text-particle underline decoration-line-hover underline-offset-4 hover:text-ceramic">
          Plus ×6
        </a>
      )}
    </div>
  );
}

export function untilText(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "a moment";
  const mins = Math.ceil(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
