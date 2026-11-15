import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { AppShell } from "@/components/shell/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muzikku Shifter",
  description: "Multi-service music library manager and playlist synchronization.",
};

export const dynamic = "force-dynamic";

const themeBoot = `try{var a=JSON.parse(localStorage.getItem("muzikku.appearance")||"null");var theme=a&&a.theme==="dark"?"dark":"light";var tint=a&&typeof a.tint==="number"?a.tint:48;document.documentElement.dataset.theme=theme;document.documentElement.style.setProperty("--glass-alpha",(0.4+(tint/100)*0.48).toFixed(3));}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="muzikku-theme" strategy="beforeInteractive">
          {themeBoot}
        </Script>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
