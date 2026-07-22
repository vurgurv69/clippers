"use client";

import { useEffect } from "react";

/** One-time editor boot: Google fonts + process due publish jobs. */
export function useStudioShellBoot() {
  useEffect(() => {
    const id = "clippers-editor-text-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Lato:wght@400;700&family=Montserrat:wght@400;600;700;800&family=Open+Sans:wght@400;600;700&family=Poppins:wght@400;600;700;800&family=Roboto:wght@400;500;700&display=swap";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        await fetch("/api/publish/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "process" }),
        });
      } catch {
        // ignore
      }
    }
    void tick();
    const id = window.setInterval(() => {
      if (!cancelled) void tick();
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
}
