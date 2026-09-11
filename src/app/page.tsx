import { LandingHero } from "@/components/clip-studio/LandingHero";
import { StudioLauncher } from "@/components/studio";

export default function Home() {
  return (
    <div className="page">
      <LandingHero />

      <section className="studio-section" id="studio">
        <div className="studio-section-head">
          <h2>Or edit your own footage</h2>
          <p>
            A full multi-clip editor — drag in videos and photos, trim, split, reorder, add
            transitions, color and sound, then export.
          </p>
        </div>
        <StudioLauncher />
      </section>
    </div>
  );
}
