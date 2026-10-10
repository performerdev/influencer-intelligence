"use client";

import { useEffect, useState } from "react";

import { paymentsEnabled } from "@/config/chain";
import { site } from "@/config/site";
import { token } from "@/config/token";
import { AppLink } from "@/components/ui/AppLink";
import { Popover } from "@/components/ui/Popover";

import { LogoMark } from "./LogoMark";

const nav = [
  { href: "/#intelligences", label: "Intelligences" },
  { href: "/group", label: "Group" },
  { href: "/add", label: "Add" },
];

export function TopBar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b border-line transition-colors duration-fast ${
        scrolled ? "bg-void/80 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-topbar max-w-site items-center gap-6 px-gutter">
        <AppLink href="/" className="flex items-center gap-3 rounded-chip" aria-label={`${site.name} — home`}>
          <LogoMark size={25} />
          <span className="hidden font-pixel text-sm sm:inline">{site.name}</span>
        </AppLink>

        <nav aria-label="Primary" className="ml-auto hidden items-center gap-1 md:flex">
          {nav.map((n) => (
            <AppLink key={n.href} href={n.href} className="rounded-pill px-3 py-1.5 text-sm text-particle transition-colors duration-fast hover:text-ceramic">
              {n.label}
            </AppLink>
          ))}
          <a
            href={site.githubUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-pill px-3 py-1.5 text-sm text-particle transition-colors duration-fast hover:text-ceramic"
          >
            GitHub
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-2">
          <TokenPopover />
          <ConnectButton />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

function TokenPopover() {
  const [copied, setCopied] = useState(false);
  const ca = token.contractAddress;
  return (
    <Popover
      label={`${token.ticker} token`}
      triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-pill border border-line px-3.5 font-mono text-xs text-ceramic transition-colors duration-fast hover:border-line-hover"
      trigger={
        <>
          {token.ticker}
          <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden className="text-muted">
            <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" fill="none" strokeWidth="1.2" />
          </svg>
        </>
      }
    >
      <p className="label-mono">Contract</p>
      <div className="mt-2 flex items-center justify-between gap-3 rounded-input border border-line px-3 py-2">
        <span className="truncate font-mono text-xs text-particle">{ca ? `${ca.slice(0, 6)}…${ca.slice(-4)}` : "Not live yet"}</span>
        <button
          type="button"
          disabled={!ca}
          onClick={async () => {
            await navigator.clipboard.writeText(ca);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="font-mono text-label uppercase text-muted transition-colors duration-fast enabled:hover:text-ceramic disabled:opacity-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {token.dexScreenerUrl ? (
        <a href={token.dexScreenerUrl} target="_blank" rel="noreferrer" className="link-quiet mt-3">
          DexScreener <span className="arrow">↗</span>
        </a>
      ) : (
        <p className="mt-3 text-sm text-muted">DexScreener link appears at launch.</p>
      )}
    </Popover>
  );
}

function ConnectButton() {
  if (paymentsEnabled) {
    return (
      <button type="button" className="btn-ceramic h-9 px-4">
        Connect
      </button>
    );
  }
  return (
    <Popover label="Connect wallet" triggerClassName="btn-ceramic h-9 px-4" trigger="Connect">
      <p className="text-sm text-ceramic">Payments coming soon.</p>
      <p className="mt-1 text-sm text-muted">A wallet is only needed to add a brain.</p>
    </Popover>
  );
}

function MobileMenu() {
  return (
    <div className="md:hidden">
      <Popover
        label="Menu"
        triggerClassName="inline-flex h-9 w-9 items-center justify-center rounded-pill border border-line"
        trigger={
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M1 4.5h12M1 9.5h12" stroke="var(--ii-ceramic)" strokeWidth="1.2" />
          </svg>
        }
      >
        <nav aria-label="Primary" className="-my-1 flex flex-col">
          {nav.map((n) => (
            <AppLink key={n.href} href={n.href} className="py-2 text-body text-ceramic">
              {n.label}
            </AppLink>
          ))}
          <a href={site.githubUrl} target="_blank" rel="noreferrer" className="py-2 text-body text-ceramic">
            GitHub ↗
          </a>
        </nav>
      </Popover>
    </div>
  );
}
