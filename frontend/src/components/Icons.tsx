import type { ReactNode } from "react";

const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };

function Svg({ children }: { children: ReactNode }) {
  return <svg {...base}>{children}</svg>;
}

export const Icon = {
  overview: () => <Svg><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>,
  contacts: () => <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.5 3 5.2" /></Svg>,
  marketing: () => <Svg><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></Svg>,
  leads: () => <Svg><path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z" /></Svg>,
  exams: () => <Svg><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9.5 13l2 2 3.5-4" /></Svg>,
  sponsorship: () => <Svg><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z" /></Svg>,
  quality: () => <Svg><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6Z" /><path d="m9 12 2 2 4-4" /></Svg>,
  admin: () => <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.2 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Svg>,
  account: () => <Svg><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>,
  chevron: () => <Svg><path d="m6 9 6 6 6-6" /></Svg>,
  check: () => <Svg><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>,
  table: () => <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 10v10" /></Svg>,
  chart: () => <Svg><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>,
  download: () => <Svg><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4 20h16" /></Svg>,
  info: () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.5" /></Svg>,
  menu: () => <Svg><path d="M4 7h16M4 12h16M4 17h16" /></Svg>,
  sun: () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>,
  moon: () => <Svg><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" /></Svg>,
  monitor: () => <Svg><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></Svg>,
  logout: () => <Svg><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" /></Svg>,
  x: () => <Svg><path d="M6 6l12 12M18 6 6 18" /></Svg>,
  good: () => <Svg><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></Svg>,
  pending: () => <Svg><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>,
  notStarted: () => <Svg><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></Svg>,
};
