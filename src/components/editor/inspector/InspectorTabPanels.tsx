"use client";

import { TextPanel } from "@/components/editor/inspector/TextPanel";
import { EffectsPanel } from "@/components/editor/inspector/EffectsPanel";
import { TransformPanel } from "@/components/editor/inspector/TransformPanel";
import { FxPanel } from "@/components/editor/inspector/FxPanel";
import { AudioPanel } from "@/components/editor/inspector/AudioPanel";
import { TransitionsPanel } from "@/components/editor/inspector/TransitionsPanel";
import { ClipPanel, InspectorClipActions } from "@/components/editor/inspector/ClipPanel";
import { ExtraOptionsPanel } from "@/components/editor/inspector/ExtraOptionsPanel";
import type { InspectorPanelCtx } from "@/components/editor/inspector/inspectorCtx";

export type { InspectorPanelCtx } from "@/components/editor/inspector/inspectorCtx";

export function InspectorTabPanels({ ctx }: { ctx: InspectorPanelCtx }) {
  const { tab } = ctx;
  return (
    <>
      <InspectorClipActions ctx={ctx} />
      {tab === "clip" && <ClipPanel ctx={ctx} />}
      {(tab === "transform" || tab === "animation") && <TransformPanel ctx={ctx} />}
      {tab === "color" && <EffectsPanel ctx={ctx} />}
      {tab === "audio" && <AudioPanel ctx={ctx} />}
      {(tab === "effects" || tab === "fx") && <FxPanel ctx={ctx} />}
      {tab === "text" && <TextPanel ctx={ctx} />}
      {tab === "transitions" && <TransitionsPanel ctx={ctx} />}
      {tab === "extra" && <ExtraOptionsPanel ctx={ctx} />}
      {!["clip", "transform", "animation", "color", "audio", "effects", "fx", "text", "transitions", "extra"].includes(
        tab,
      ) && <ClipPanel ctx={ctx} />}
    </>
  );
}
