"use client";

import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";

/** Lightweight Lottie host for sticker pack motion assets. */
export function LottieSticker({
  src,
  className,
  loop = true,
}: {
  src: string;
  className?: string;
  loop?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    animRef.current?.destroy();
    animRef.current = null;
    fetch(src)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !ref.current) return;
        animRef.current = lottie.loadAnimation({
          container: ref.current,
          renderer: "svg",
          loop,
          autoplay: true,
          animationData: data,
        });
      })
      .catch(() => {
        // missing / invalid
      });
    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [src, loop]);

  return <div ref={ref} className={className} aria-hidden />;
}
