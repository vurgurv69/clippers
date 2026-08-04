"use client";

import type { ReactNode } from "react";
import { LIBRARY_TABS, type LibraryTabId } from "@/lib/capcut-catalog";
import { RailIcon } from "@/components/editor/RailIcons";

export type SidebarTab = LibraryTabId;

type Props = {
  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  children: ReactNode;
};

/**
 * CapCut-style left rail: vertical icon tabs + content + edge close arrow.
 */
export function StudioSidebar({
  tab,
  onTab,
  collapsed,
  onToggleCollapsed,
  children,
}: Props) {
  const rail = (
    <nav className="cc-rail cc-rail-left" role="tablist" aria-orientation="vertical">
      {LIBRARY_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={tab === t.id ? "cc-rail-btn on" : "cc-rail-btn"}
          onClick={() => {
            onTab(t.id);
            if (collapsed) onToggleCollapsed?.();
          }}
          title={t.label}
        >
          <span className="cc-rail-ico" aria-hidden>
            <RailIcon name={t.icon} />
          </span>
          <span className="cc-rail-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );

  if (collapsed) {
    return (
      <aside className="studio-sidebar cc-sidebar collapsed" aria-label="Library (collapsed)">
        {onToggleCollapsed && (
          <button
            type="button"
            className="bin-rail-btn bin-rail-expand"
            onClick={onToggleCollapsed}
            title="Show library"
            aria-label="Show library"
          >
            ›
          </button>
        )}
        {rail}
      </aside>
    );
  }

  return (
    <aside className="studio-sidebar cc-sidebar" aria-label="Library">
      {rail}
      <div className="cc-sidebar-panel sidebar-body">{children}</div>
      {onToggleCollapsed && (
        <button
          type="button"
          className="bin-rail-btn"
          onClick={onToggleCollapsed}
          title="Hide library"
          aria-label="Hide library"
        >
          ‹
        </button>
      )}
    </aside>
  );
}
