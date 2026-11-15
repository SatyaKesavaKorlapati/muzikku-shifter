"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Link2, ListMusic, RefreshCw, Search, Sparkles, Users } from "lucide-react";
import { GlassSurface } from "@/components/glass/GlassSurface";

const ITEMS = [
  { href: "/", label: "Playlists", icon: ListMusic },
  { href: "/sync", label: "Sync Engine", icon: RefreshCw },
  { href: "/dedupe", label: "Deduplicator", icon: Sparkles },
  { href: "/search", label: "Deep Search", icon: Search },
  { href: "/artists", label: "Artists", icon: Users },
  { href: "/connections", label: "Connections", icon: Link2 },
];

const EASE = [0.22, 1, 0.36, 1] as const;

export function GlassPillNav() {
  const pathname = usePathname();
  return (
    <GlassSurface chrome className="rounded-full">
      <nav className="flex max-w-[min(760px,calc(100vw-8rem))] items-center gap-1 overflow-x-auto p-1.5 scroll-thin">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative isolate flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium"
              aria-current={active ? "page" : undefined}
            >
              {active ? (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 -z-10 rounded-full"
                  style={{ background: "var(--pill)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65), 0 8px 18px rgba(0,0,0,0.08)" }}
                  transition={{ duration: 0.45, ease: EASE }}
                />
              ) : null}
              <Icon size={15} strokeWidth={1.75} />
              <span className={active ? "text-[var(--pill-text)]" : "text-[var(--text-dim)]"}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </GlassSurface>
  );
}
