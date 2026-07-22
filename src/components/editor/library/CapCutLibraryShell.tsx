"use client";

import { useMemo, useState, type ReactNode } from "react";

type Props = {
  title: string;
  searchPlaceholder?: string;
  categories: { id: string; label: string }[];
  children: (ctx: { category: string; query: string }) => ReactNode;
  footer?: ReactNode;
};

/** Shared CapCut-style library chrome: search + category chips + card grid host. */
export function CapCutLibraryShell({
  title,
  searchPlaceholder = "Search…",
  categories,
  children,
  footer,
}: Props) {
  const [category, setCategory] = useState(categories[0]?.id || "all");
  const [query, setQuery] = useState("");
  const cats = useMemo(() => categories, [categories]);

  return (
    <div className="cc-lib">
      <header className="cc-lib-head">
        <h3 className="cc-lib-title">{title}</h3>
        <input
          className="cc-search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search ${title}`}
        />
      </header>
      {cats.length > 0 && (
        <div className="cc-cats" role="tablist" aria-label={`${title} categories`}>
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              className={category === c.id ? "cc-cat on" : "cc-cat"}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="cc-lib-body">{children({ category, query })}</div>
      {footer}
    </div>
  );
}

type CardProps = {
  label: string;
  sub?: string;
  active?: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Animated / visual preview box */
  preview?: ReactNode;
};

export function CapCutCard({
  label,
  sub,
  active,
  onClick,
  onMouseEnter,
  onMouseLeave,
  preview,
}: CardProps) {
  return (
    <button
      type="button"
      className={active ? "cc-card on" : "cc-card"}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={label}
    >
      <span className="cc-card-thumb">{preview}</span>
      <span className="cc-card-meta">
        <span className="cc-card-label">{label}</span>
        {sub && <span className="cc-card-sub">{sub}</span>}
      </span>
    </button>
  );
}
