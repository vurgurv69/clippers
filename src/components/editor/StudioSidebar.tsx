"use client";

import type { ReactNode } from "react";
import { LIBRARY_TABS, type LibraryTabId } from "@/lib/capcut-catalog";

export type SidebarTab = LibraryTabId;

type Props = {
  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  children: ReactNode;
};

/**
 * CapCut-style left rail: vertical icon tabs + one content panel.
 */
export function StudioSidebar({
  tab,
  onTab,
  collapsed,
  onToggleCollapsed,
  children,
}: Props) {
  if (collapsed) {
    return (
      <aside className="studio-sidebar cc-sidebar collapsed" aria-label="Library (collapsed)">
        <button
          type="button"
          className="sidebar-expand"
          onClick={onToggleCollapsed}
          title="Show library"
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside className="studio-sidebar cc-sidebar" aria-label="Library">
      <nav className="cc-rail" role="tablist" aria-orientation="vertical">
        {LIBRARY_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "cc-rail-btn on" : "cc-rail-btn"}
            onClick={() => onTab(t.id)}
            title={t.label}
          >
            <span className="cc-rail-ico" aria-hidden>
              {t.icon}
            </span>
            <span className="cc-rail-label">{t.label}</span>
          </button>
        ))}
        {onToggleCollapsed && (
          <button
            type="button"
            className="cc-rail-btn collapse"
            onClick={onToggleCollapsed}
            title="Collapse library"
          >
            <span className="cc-rail-ico" aria-hidden>
              ‹
            </span>
            <span className="cc-rail-label">Hide</span>
          </button>
        )}
      </nav>
      <div className="cc-sidebar-panel sidebar-body">{children}</div>
    </aside>
  );
}
