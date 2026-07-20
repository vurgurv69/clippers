import { ClipStudio } from "@/components/ClipStudio";
import { StudioLauncher } from "@/components/StudioLauncher";

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-visual" aria-hidden>
          <div className="phone phone-a">
            <span>wait for it…</span>
          </div>
          <div className="phone phone-b">
            <span>this part hits</span>
          </div>
        </div>

        <div className="hero-copy">
          <p className="brand">
            Clip<em>pers</em>
          </p>
          <h1 className="headline">
            Paste a link. Get share-ready clips.
          </h1>
          <p className="lede">
            Short videos export in full. Longer YouTube cuts land at 40–60s —
            captions in Arabic or English, no watermarks.
          </p>
          <ClipStudio />
        </div>
      </section>

      <section className="studio-section" id="studio">
        <div className="studio-section-head">
          <h2>Or edit your own footage</h2>
          <p>
            A full multi-clip editor — drag in videos and photos, trim, split,
            reorder, add transitions, color and sound, then export.
          </p>
        </div>
        <StudioLauncher />
      </section>
    </div>
  );
}
