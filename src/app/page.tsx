import { ClipStudio } from "@/components/ClipStudio";
import { StudioLauncher } from "@/components/StudioLauncher";

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-visual" aria-hidden>
          <div className="hero-left">
            <div className="hero-lens">
              <span className="lens-ring lens-ring-a" />
              <span className="lens-ring lens-ring-b" />
              <span className="lens-ring lens-ring-c" />
              <span className="lens-core" />
            </div>
            <div className="hero-lens hero-lens-b">
              <span className="lens-ring lens-ring-a" />
              <span className="lens-ring lens-ring-b" />
              <span className="lens-ring lens-ring-c" />
              <span className="lens-core" />
            </div>
            <div className="hero-marquee">
              <div className="hero-marquee-track">
                <span>hook</span>
                <span>cut</span>
                <span>peak</span>
                <span>share</span>
                <span>hook</span>
                <span>cut</span>
                <span>peak</span>
                <span>share</span>
              </div>
            </div>
            <p className="hero-slash">/</p>
          </div>

          <div className="phone phone-a">
            <span>wait for it…</span>
          </div>
          <div className="phone phone-b">
            <span>this part hits</span>
          </div>
          <div className="phone phone-c">
            <span>drop that clip</span>
          </div>
        </div>

        <div className="hero-copy">
          <p className="brand">
            Clip<em>pers</em>
          </p>
          <div className="hero-main">
            <h1 className="headline">
              Paste a link. Get share-ready clips.
            </h1>
            <p className="lede">
              Drop any link — YouTube, TikTok, Reels, and more. Clippers finds
              the moments that hold attention, then exports clean vertical cuts
              ready to post.
            </p>
            <ClipStudio />
          </div>
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
