"use client";

import dynamic from "next/dynamic";
import { InspectorClipActions } from "@/components/editor/inspector/ClipPanel";
import type { InspectorPanelCtx } from "@/components/editor/inspector/inspectorCtx";

export type { InspectorPanelCtx } from "@/components/editor/inspector/inspectorCtx";

const PanelFallback = () => (
  <div className="cc-panel-skeleton" aria-busy="true">
    Loading…
  </div>
);

const ClipPanel = dynamic(
  () => import("@/components/editor/inspector/ClipPanel").then((m) => m.ClipPanel),
  { loading: PanelFallback, ssr: false },
);
const TransformPanel = dynamic(
  () =>
    import("@/components/editor/inspector/TransformPanel").then((m) => m.TransformPanel),
  { loading: PanelFallback, ssr: false },
);
const EffectsPanel = dynamic(
  () =>
    import("@/components/editor/inspector/EffectsPanel").then((m) => m.EffectsPanel),
  { loading: PanelFallback, ssr: false },
);
const AudioPanel = dynamic(
  () => import("@/components/editor/inspector/AudioPanel").then((m) => m.AudioPanel),
  { loading: PanelFallback, ssr: false },
);
const FxPanel = dynamic(
  () => import("@/components/editor/inspector/FxPanel").then((m) => m.FxPanel),
  { loading: PanelFallback, ssr: false },
);
const TextPanel = dynamic(
  () => import("@/components/editor/inspector/TextPanel").then((m) => m.TextPanel),
  { loading: PanelFallback, ssr: false },
);
const TransitionsPanel = dynamic(
  () =>
    import("@/components/editor/inspector/TransitionsPanel").then(
      (m) => m.TransitionsPanel,
    ),
  { loading: PanelFallback, ssr: false },
);
const ExtraOptionsPanel = dynamic(
  () =>
    import("@/components/editor/inspector/ExtraOptionsPanel").then(
      (m) => m.ExtraOptionsPanel,
    ),
  { loading: PanelFallback, ssr: false },
);

/** Studio 2.0 — lazy inspector tabs (one panel mounted at a time). */
export function InspectorTabPanels({ ctx }: { ctx: InspectorPanelCtx }) {
  const { tab } = ctx;
  // Effects / Trans / Anim live on the left rail — map stray tabs to Clip.
  const view =
    tab === "effects" || tab === "fx" || tab === "transitions" || tab === "animation"
      ? "clip"
      : tab;
  return (
    <>
      <InspectorClipActions ctx={ctx} />
      {view === "clip" && <ClipPanel ctx={ctx} />}
      {view === "transform" && <TransformPanel ctx={ctx} />}
      {view === "color" && <EffectsPanel ctx={ctx} />}
      {view === "audio" && <AudioPanel ctx={ctx} />}
      {view === "text" && <TextPanel ctx={ctx} />}
      {view === "extra" && <ExtraOptionsPanel ctx={ctx} />}
      {!["clip", "transform", "color", "audio", "text", "extra"].includes(view) && (
        <ClipPanel ctx={ctx} />
      )}
    </>
  );
}
