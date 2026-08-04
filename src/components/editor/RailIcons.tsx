"use client";

/** Shared SVG glyphs for left library + right inspector rails. */
export function RailIcon({ name, size = 20 }: { name: string; size?: number }) {
  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  switch (name) {
    case "film":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M8 5v14M16 5v14M3 10h5M16 10h5M3 14h5M16 14h5" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M12 3l1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3z" />
          <path d="M19 15l.7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z" opacity="0.75" />
        </svg>
      );
    case "layout":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M10 10v10" />
        </svg>
      );
    case "swap":
      return (
        <svg {...common}>
          <path d="M7 8h11M15 5l3 3-3 3M17 16H6M9 13l-3 3 3 3" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2.2 2.2M14.8 14.8 17 17M17 7l-2.2 2.2M9.2 14.8 7 17" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "spin":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.3-5.6" />
          <path d="M20 5v5h-5" />
        </svg>
      );
    case "drop":
      return (
        <svg {...common}>
          <path d="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3z" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 3 3 8l9 5 9-5-9-5z" />
          <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M4 12 20 4l-6 16-2.5-6.5L4 12z" />
        </svg>
      );
    case "clip":
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="M8 6V4h8v2M10 10h4M10 14h6" />
        </svg>
      );
    case "move":
      return (
        <svg {...common}>
          <path d="M12 3v18M3 12h18M7 7l-4 5 4 5M17 7l4 5-4 5M7 17l5 4 5-4M7 7l5-4 5 4" />
        </svg>
      );
    case "color":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="9" r="2" fill="currentColor" stroke="none" />
          <circle cx="9" cy="13.5" r="2" fill="currentColor" stroke="none" opacity="0.7" />
          <circle cx="15" cy="13.5" r="2" fill="currentColor" stroke="none" opacity="0.5" />
        </svg>
      );
    case "audio":
      return (
        <svg {...common}>
          <path d="M4 10v4M8 7v10M12 5v14M16 8v8M20 10v4" />
        </svg>
      );
    case "text":
      return (
        <svg {...common}>
          <path d="M5 6h14M12 6v12M8 18h8" />
        </svg>
      );
    case "fx":
      return (
        <svg {...common}>
          <path d="M12 3 9 10H3l5 4-2 7 6-4 6 4-2-7 5-4h-6L12 3z" />
        </svg>
      );
    case "extra":
      return (
        <svg {...common}>
          <circle cx="6" cy="12" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.8" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}
