// Line icons in MASSALIA's sidebar manner: 1.6 px strokes in currentColor.
import type { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  troops: (
    <>
      <path d="M4 20 15 9M15 9l1-5 4-1-1 4-5 1M7 17l2 2M3 21l3-1-2-2z" />
      <path d="M20 20 9 9M9 9 8 4 4 3l1 4 5 1M17 17l-2 2M21 21l-3-1 2-2z" />
    </>
  ),
  reports: (
    <>
      <path d="M6 3h10l3 3v15H6z" />
      <path d="M16 3v3h3M9 10h7M9 14h7M9 18h4" />
    </>
  ),
  stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  kingdom: <path d="M3 18h18l-1-10-5 4-3-7-3 7-5-4zM4 21h16" />,
  family: (
    <>
      <circle cx="8" cy="7" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2 20c0-4 3-6 6-6s6 2 6 6M13 20c0-3 2-5 4-5s4 2 4 5" />
    </>
  ),
  people: (
    <>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M4 21c0-5 4-8 8-8s8 3 8 8" />
    </>
  ),
  helmet: <path d="M5 14a7 7 0 0 1 14 0v3h-4v-4H9v4H5zM12 7V3M9 3h6" />,
  send: <path d="M3 12h13M12 6l6 6-6 6M21 4v16" />,
  goods: (
    <>
      <path d="M4 9h16l-2 11H6z" />
      <path d="M8 9a4 4 0 0 1 8 0" />
    </>
  ),
  barracks: <path d="M3 21V9l9-5 9 5v12M8 21v-6h8v6M3 9h18" />,
  scroll: <path d="M7 4h11v14a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2h11v2a3 3 0 0 0 3 3M7 4a3 3 0 0 0-3 3v1h3" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  left: <path d="M15 5 8 12l7 7" />,
  right: <path d="m9 5 7 7-7 7" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  hammer: <path d="M14 4 20 10l-3 3-6-6zM12 8 3 17l3 3 9-9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  home: <path d="M3 11 12 4l9 7M6 9v11h12V9" />,
  oasis: <path d="M12 21V11M12 11c-3-5-7-5-9-3 3 0 6 1 9 3zM12 11c3-5 7-5 9-3-3 0-6 1-9 3zM12 11c-1-4 1-7 4-8-1 3-2 5-4 8z" />,
  flame: <path d="M12 21c-4 0-6-3-6-6 0-4 4-6 4-10 3 2 4 5 4 7 1-1 2-2 2-4 2 2 2 5 2 7 0 3-2 6-6 6z" />,
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name] ?? paths.scroll}
    </svg>
  );
}
