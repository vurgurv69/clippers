"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from "react";
import { clamp } from "@/lib/edit-tools";
import {
  clipLength,
  sampleKeyframe,
  type MusicTrack,
  type ProjectAsset,
  type TimelineClip,
  type TrackChrome,
  type TrackId,
} from "@/lib/editor-types";

const FPS = 30;

type ToastFn = (msg: string, kind?: "info" | "success" | "error") => void;

export type StudioPlaybackArgs = {
  videoRef: RefObject<HTMLVideoElement | null>;
  musicRef: RefObject<HTMLAudioElement | null>;
  sfxRefs: MutableRefObject<(HTMLAudioElement | null)[]>;
  previewWrapRef: RefObject<HTMLElement | null>;
  rafRef: MutableRefObject<number | null>;
  lastTickRef: MutableRefObject<number>;
  curRef: MutableRefObject<number>;
  playing: boolean;
  setPlaying: Dispatch<SetStateAction<boolean>>;
  setCurrent: Dispatch<SetStateAction<number>>;
  rate: number;
  setRate: Dispatch<SetStateAction<number>>;
  dir: 1 | -1;
  setDir: Dispatch<SetStateAction<1 | -1>>;
  loop: boolean;
  muted: boolean;
  setMuted: Dispatch<SetStateAction<boolean>>;
  masterVolume: number;
  music: MusicTrack | null;
  musicTracks: MusicTrack[];
  mixerSolo: string | null;
  tracks: Record<TrackId, TrackChrome>;
  viewClips: TimelineClip[];
  starts: number[];
  total: number;
  scrubTotal: number;
  activeIndex: number;
  activeAsset: ProjectAsset | null | undefined;
  activeClip: TimelineClip | null | undefined;
  assetById: Map<string, ProjectAsset>;
  nestedEditing: boolean;
  pushToast: ToastFn;
};

/**
 * Preview transport: music/SFX gain, rAF clock, seek, JKL play, mute, fullscreen.
 */
export function useStudioPlayback(args: StudioPlaybackArgs) {
  const {
    videoRef,
    musicRef,
    sfxRefs,
    previewWrapRef,
    rafRef,
    lastTickRef,
    curRef,
    playing,
    setPlaying,
    setCurrent,
    rate,
    setRate,
    dir,
    setDir,
    loop,
    muted,
    setMuted,
    masterVolume,
    music,
    musicTracks,
    mixerSolo,
    tracks,
    viewClips,
    starts,
    total,
    scrubTotal,
    activeIndex,
    activeAsset,
    activeClip,
    assetById,
    nestedEditing,
    pushToast,
  } = args;

  const musicGain = useCallback(
    (t: number) => {
      if (!music) return 0;
      if (mixerSolo && mixerSolo !== "music") return 0;
      const span = Math.max(0.1, music.outPoint - music.inPoint);
      const local = t - music.start;
      if (local < 0 || local > span) return 0;
      let g = clamp(music.volume, 0, 1) * masterVolume;
      if (music.fadeIn > 0 && local < music.fadeIn) g *= local / music.fadeIn;
      if (music.fadeOut > 0 && local > span - music.fadeOut)
        g *= Math.max(0, (span - local) / music.fadeOut);
      return clamp(g, 0, 1);
    },
    [music, mixerSolo, masterVolume],
  );

  const sfxGain = useCallback(
    (mt: MusicTrack, t: number, soloId: string) => {
      if (mixerSolo && mixerSolo !== soloId) return 0;
      const span = Math.max(0.1, mt.outPoint - mt.inPoint);
      const local = t - mt.start;
      if (local < 0 || local > span) return 0;
      let g = clamp(mt.volume, 0, 1) * masterVolume;
      if (mt.fadeIn > 0 && local < mt.fadeIn) g *= local / mt.fadeIn;
      if (mt.fadeOut > 0 && local > span - mt.fadeOut)
        g *= Math.max(0, (span - local) / mt.fadeOut);
      return clamp(g, 0, 1);
    },
    [mixerSolo, masterVolume],
  );

  const syncMusic = useCallback(
    (t: number, isPlaying: boolean) => {
      const m = musicRef.current;
      if (!m || !music) return;
      const span = Math.max(0.1, music.outPoint - music.inPoint);
      const inWindow = t >= music.start && t <= music.start + span;
      m.volume = musicGain(t);
      if (isPlaying && inWindow && musicGain(t) > 0.001) {
        const local = music.inPoint + (t - music.start);
        if (Math.abs(m.currentTime - local) > 0.3) m.currentTime = local;
        if (m.paused) m.play().catch(() => {});
      } else if (!m.paused) {
        m.pause();
      }
    },
    [music, musicGain, musicRef],
  );

  const syncSfx = useCallback(
    (t: number, isPlaying: boolean) => {
      musicTracks.forEach((mt, i) => {
        const el = sfxRefs.current[i];
        if (!el) return;
        const soloId = `sfx-${i}`;
        const g = sfxGain(mt, t, soloId);
        const span = Math.max(0.1, mt.outPoint - mt.inPoint);
        const inWindow = t >= mt.start && t <= mt.start + span;
        el.volume = g;
        if (isPlaying && inWindow && g > 0.001 && !tracks.music.muted && !muted) {
          const local = mt.inPoint + (t - mt.start);
          if (Math.abs(el.currentTime - local) > 0.3) el.currentTime = local;
          if (el.paused) el.play().catch(() => {});
        } else if (!el.paused) {
          el.pause();
        }
      });
    },
    [musicTracks, sfxGain, tracks.music.muted, muted, sfxRefs],
  );

  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      videoRef.current?.pause();
      musicRef.current?.pause();
      sfxRefs.current.forEach((a) => a?.pause());
      return;
    }
    lastTickRef.current = performance.now();
    const v = videoRef.current;
    if (v) {
      v.muted = muted || tracks.video.muted || (mixerSolo !== null && mixerSolo !== "clip");
      if (activeAsset?.kind === "video" && dir === 1) v.play().catch(() => {});
      else v.pause();
    }

    const tick = (now: number) => {
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;

      const prev = curRef.current;
      let idx = 0;
      for (let i = 0; i < viewClips.length; i++) {
        if (starts[i] <= prev + 0.0001) idx = i;
        else break;
      }
      const clip = viewClips[idx];
      let next = prev;
      if (clip) {
        const asset = assetById.get(clip.assetId);
        const clipStart = starts[idx] ?? 0;
        const speed = clip.speed || 1;
        if (asset?.kind === "video" && videoRef.current && dir === 1) {
          const vv = videoRef.current;
          vv.playbackRate = clamp(speed * rate, 0.0625, 16);
          vv.muted = muted;
          const st = vv.currentTime;
          if (vv.ended || st >= clip.outPoint - 0.03) {
            next = clipStart + clipLength(clip);
          } else if (vv.readyState >= 2) {
            next = clipStart + (st - clip.inPoint) / speed;
          }
        } else {
          next = prev + dir * dt * rate;
          const vv = videoRef.current;
          if (asset?.kind === "video" && vv) {
            vv.pause();
            const local = clamp(next, clipStart, clipStart + clipLength(clip));
            const stt = Math.max(0, clip.inPoint + (local - clipStart) * speed);
            if (Math.abs(vv.currentTime - stt) > 0.05) vv.currentTime = stt;
          }
        }
      }

      if (dir === 1 && next >= total - 0.02) {
        if (loop) {
          next = 0;
          const vv = videoRef.current;
          const c0 = viewClips[0];
          if (vv && c0 && assetById.get(c0.assetId)?.kind === "video") {
            vv.currentTime = Math.max(0, c0.inPoint);
          }
        } else {
          curRef.current = total;
          setCurrent(total);
          syncMusic(total, false);
          syncSfx(total, false);
          setPlaying(false);
          return;
        }
      }
      if (dir === -1 && next <= 0) {
        curRef.current = 0;
        setCurrent(0);
        syncMusic(0, false);
        syncSfx(0, false);
        setPlaying(false);
        setDir(1);
        return;
      }

      curRef.current = next;
      setCurrent(next);
      if (clip && videoRef.current && assetById.get(clip.assetId)?.kind === "video") {
        const len = clipLength(clip);
        const u = len > 0 ? clamp((next - (starts[idx] || 0)) / len, 0, 1) : 0;
        const vol = sampleKeyframe(clip.keyframes, "volume", u, clip.volume);
        videoRef.current.volume = clamp(vol * masterVolume, 0, 1);
        videoRef.current.muted =
          muted ||
          masterVolume <= 0.001 ||
          tracks.video.muted ||
          (mixerSolo !== null && mixerSolo !== "clip");
      }
      syncMusic(next, !nestedEditing && dir === 1 && !muted && !tracks.music.muted);
      syncSfx(next, !nestedEditing && dir === 1 && !muted && !tracks.music.muted);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Intentionally mirror StudioEditor deps — restart clock when timeline/transport changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playing,
    viewClips,
    starts,
    total,
    music,
    rate,
    dir,
    loop,
    muted,
    masterVolume,
    tracks.music.muted,
    tracks.video.muted,
    nestedEditing,
  ]);

  const seek = useCallback(
    (t: number) => {
      const clamped = clamp(t, 0, scrubTotal);
      curRef.current = clamped;
      setCurrent(clamped);
      const v = videoRef.current;
      if (v && activeAsset?.kind === "video") {
        const clipStart = starts[activeIndex] ?? 0;
        const clip = viewClips[activeIndex];
        if (clip) {
          v.currentTime = Math.max(0, clip.inPoint + (clamped - clipStart) * (clip.speed || 1));
        }
      }
      syncMusic(clamped, playing);
      syncSfx(clamped, playing);
    },
    [
      scrubTotal,
      curRef,
      setCurrent,
      videoRef,
      activeAsset?.kind,
      starts,
      activeIndex,
      viewClips,
      syncMusic,
      syncSfx,
      playing,
    ],
  );

  const togglePlay = useCallback(() => {
    if (!viewClips.length) {
      pushToast("Add a clip to the timeline first — click media in the library", "info");
      return;
    }
    setDir(1);
    if (curRef.current >= total - 0.02) {
      curRef.current = 0;
      setCurrent(0);
    }
    const next = !playing;
    setPlaying(next);
    const v = videoRef.current;
    if (v && activeAsset?.kind === "video") {
      if (next) {
        v.play().catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
      } else {
        v.pause();
      }
    }
  }, [
    viewClips.length,
    pushToast,
    setDir,
    curRef,
    total,
    setCurrent,
    playing,
    setPlaying,
    videoRef,
    activeAsset?.kind,
  ]);

  const playForward = useCallback(() => {
    if (!viewClips.length) {
      pushToast("Add a clip to the timeline first", "info");
      return;
    }
    if (playing && dir === 1) {
      setRate((r) => (r >= 2 ? 2 : r >= 1.5 ? 2 : r >= 1 ? 1.5 : 1));
    } else {
      setDir(1);
      setRate(1);
      if (curRef.current >= total - 0.02) {
        curRef.current = 0;
        setCurrent(0);
      }
      setPlaying(true);
      const v = videoRef.current;
      if (v && activeAsset?.kind === "video") {
        v.play().catch(() => {
          v.muted = true;
          v.play().catch(() => {});
        });
      }
    }
  }, [
    viewClips.length,
    pushToast,
    playing,
    dir,
    setRate,
    setDir,
    curRef,
    total,
    setCurrent,
    setPlaying,
    videoRef,
    activeAsset?.kind,
  ]);

  const playReverse = useCallback(() => {
    if (!viewClips.length) {
      pushToast("Add a clip to the timeline first", "info");
      return;
    }
    if (playing && dir === -1) {
      setRate((r) => Math.min(4, r + 0.5));
    } else {
      setDir(-1);
      setRate(1);
      setPlaying(true);
    }
  }, [viewClips.length, pushToast, playing, dir, setRate, setDir, setPlaying]);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
    setRate(1);
    setDir(1);
    musicRef.current?.pause();
    sfxRefs.current.forEach((a) => a?.pause());
  }, [setPlaying, setRate, setDir, musicRef, sfxRefs]);

  const stepFrame = useCallback(
    (frames: number) => seek(curRef.current + frames / FPS),
    [seek, curRef],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nv = !m;
      if (videoRef.current) videoRef.current.muted = nv;
      pushToast(nv ? "Muted" : "Unmuted", "info");
      return nv;
    });
  }, [setMuted, videoRef, pushToast]);

  const toggleFullscreen = useCallback(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }, [previewWrapRef]);

  return {
    musicGain,
    sfxGain,
    syncMusic,
    syncSfx,
    seek,
    togglePlay,
    playForward,
    playReverse,
    stopPlayback,
    stepFrame,
    toggleMute,
    toggleFullscreen,
  };
}

export { FPS as STUDIO_PLAYBACK_FPS };
