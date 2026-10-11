import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";

import { AuthProvider } from "@/components/account/AuthProvider";
import { KeyboardScroll } from "@/components/layout/KeyboardScroll";
import { SmoothScroll } from "@/components/layout/SmoothScroll";
import { TopBar } from "@/components/layout/TopBar";
import { site } from "@/config/site";
import { WalletProvider } from "@/modules/wallet";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s · ${site.name}` },
  description: `${site.tagline} ${site.description}`,
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#050506",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`} suppressHydrationWarning>
      <head>
        {/* Gate intro-only styles on JS so the page never hides content without it. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <WalletProvider>
          <AuthProvider>
            <SmoothScroll />
            <KeyboardScroll />
            <TopBar />
            <main className="relative">{children}</main>
          </AuthProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
