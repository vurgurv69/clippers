"use client";

import { useCallback, useState } from "react";
import type {
  AspectRatio,
  CaptionReadMode,
  CaptionThemeId,
  ExportCodec,
  ExportQuality,
  LayoutMode,
  WhisperQuality,
} from "@/lib/types";
import type { CaptionAlign, CaptionFontFamily } from "@/lib/caption-style";
import type { ClipStudioControlValues } from "@/components/clip-studio/ClipStudioControls";

/** Form / export options for Auto Viral + Social Clean. */
export function useClipStudioControls() {
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("fill");
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [whisperQuality, setWhisperQuality] = useState<WhisperQuality>("fast");
  const [captionTheme, setCaptionTheme] = useState<CaptionThemeId>("tiktok-bold");
  const [captionReadMode, setCaptionReadMode] = useState<CaptionReadMode>("verbatim");
  const [captionEmojis, setCaptionEmojis] = useState(false);
  const [exportQuality, setExportQuality] = useState<ExportQuality>("maximum");
  const [exportCodec, setExportCodec] = useState<ExportCodec>("h264");
  const [preferHwEncode, setPreferHwEncode] = useState(true);
  const [clipCount, setClipCount] = useState(4);
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");
  const [captionPrimary, setCaptionPrimary] = useState("#FFFFFF");
  const [captionHighlight, setCaptionHighlight] = useState("#FFFF00");
  const [captionFont, setCaptionFont] = useState<CaptionFontFamily>("Montserrat");
  const [captionAlign, setCaptionAlign] = useState<CaptionAlign>("bottom");
  const [captionFontSize, setCaptionFontSize] = useState(72);
  const [captionOutline, setCaptionOutline] = useState(6);
  const [captionBox, setCaptionBox] = useState(false);
  const [removeWatermark, setRemoveWatermark] = useState(true);
  const [clipMode, setClipMode] = useState<ClipStudioControlValues["clipMode"]>("viral");
  const [stripBurnIn, setStripBurnIn] = useState(true);

  const value = useCallback((): ClipStudioControlValues => {
    return {
      aspectRatio,
      layoutMode,
      captionsEnabled,
      whisperQuality,
      captionTheme,
      captionReadMode,
      captionEmojis,
      exportQuality,
      exportCodec,
      preferHwEncode,
      clipCount,
      manualStartTime,
      manualEndTime,
      captionPrimary,
      captionHighlight,
      captionFont,
      captionAlign,
      captionFontSize,
      captionOutline,
      captionBox,
      removeWatermark,
      clipMode,
      stripBurnIn,
    };
  }, [
    aspectRatio,
    layoutMode,
    captionsEnabled,
    whisperQuality,
    captionTheme,
    captionReadMode,
    captionEmojis,
    exportQuality,
    exportCodec,
    preferHwEncode,
    clipCount,
    manualStartTime,
    manualEndTime,
    captionPrimary,
    captionHighlight,
    captionFont,
    captionAlign,
    captionFontSize,
    captionOutline,
    captionBox,
    removeWatermark,
    clipMode,
    stripBurnIn,
  ]);

  const onChange = useCallback((patch: Partial<ClipStudioControlValues>) => {
    if (patch.aspectRatio != null) setAspectRatio(patch.aspectRatio);
    if (patch.layoutMode != null) setLayoutMode(patch.layoutMode);
    if (patch.captionsEnabled != null) setCaptionsEnabled(patch.captionsEnabled);
    if (patch.whisperQuality != null) setWhisperQuality(patch.whisperQuality);
    if (patch.captionTheme != null) setCaptionTheme(patch.captionTheme);
    if (patch.captionReadMode != null) setCaptionReadMode(patch.captionReadMode);
    if (patch.captionEmojis != null) setCaptionEmojis(patch.captionEmojis);
    if (patch.exportQuality != null) setExportQuality(patch.exportQuality);
    if (patch.exportCodec != null) setExportCodec(patch.exportCodec);
    if (patch.preferHwEncode != null) setPreferHwEncode(patch.preferHwEncode);
    if (patch.clipCount != null) setClipCount(patch.clipCount);
    if (patch.manualStartTime != null) setManualStartTime(patch.manualStartTime);
    if (patch.manualEndTime != null) setManualEndTime(patch.manualEndTime);
    if (patch.captionPrimary != null) setCaptionPrimary(patch.captionPrimary);
    if (patch.captionHighlight != null) setCaptionHighlight(patch.captionHighlight);
    if (patch.captionFont != null) setCaptionFont(patch.captionFont);
    if (patch.captionAlign != null) setCaptionAlign(patch.captionAlign);
    if (patch.captionFontSize != null) setCaptionFontSize(patch.captionFontSize);
    if (patch.captionOutline != null) setCaptionOutline(patch.captionOutline);
    if (patch.captionBox != null) setCaptionBox(patch.captionBox);
    if (patch.removeWatermark != null) setRemoveWatermark(patch.removeWatermark);
    if (patch.clipMode != null) setClipMode(patch.clipMode);
    if (patch.stripBurnIn != null) setStripBurnIn(patch.stripBurnIn);
  }, []);

  return {
    value,
    onChange,
    aspectRatio,
    captionsEnabled,
  };
}
