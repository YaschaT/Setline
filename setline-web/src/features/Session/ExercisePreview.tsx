// ExercisePreview.swift — the exercise, moving: its start and end photo one
// after the other, so the form is there without a tap. Keyed by exercise, so a
// swap shows the new one at once. An exercise without a faithful photo shows
// nothing.
//
// Small by default, so the sets stay in view; bigger when you want to study
// the form, or hidden once you know it. The choice is remembered.
import { useEffect, useState, type CSSProperties } from "react";
import { SL, slFont } from "../../design/tokens";
import { useReduceMotion } from "../../design/support";
import { useAppStorage } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLPress } from "../../design/components/SLPress";
import { ExerciseMedia } from "../../core/Catalog/ExerciseMedia";
import { useApp } from "../../data/AppState";

type Size = "small" | "large" | "hidden";

const chip: CSSProperties = {
  position: "absolute",
  bottom: SL.Space.s2,
  padding: "4px 8px",
  borderRadius: 999,
  color: "#fff",
};

export function ExercisePreview({ exerciseID }: { exerciseID: string }) {
  const app = useApp();
  const reduceMotion = useReduceMotion();
  const [stored, setSize] = useAppStorage<string>("setline.session.photoSize", "small");
  const size: Size = stored === "large" || stored === "hidden" ? stored : "small";
  const [showsEnd, setShowsEnd] = useState(false);
  // An exercise added from the online library brings its own photos.
  const added = app.customExercises.find((c) => c.id === exerciseID)?.photoFolder;
  const frames = added !== undefined ? ExerciseMedia.framesOfFolder(added) : ExerciseMedia.frames(exerciseID);

  useEffect(() => {
    setShowsEnd(false);
    if (reduceMotion || size === "hidden") return;
    const timer = setInterval(() => setShowsEnd((end) => !end), 1200);
    return () => clearInterval(timer);
  }, [exerciseID, reduceMotion, size]);

  if (frames.length !== 2) return null;

  const photos = () => (
    <>
      {[0, 1].map((index) => (
        <img
          key={index}
          src={frames[index]}
          alt=""
          draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: (index === 1) === showsEnd ? 1 : 0, transition: "opacity 350ms ease-in-out" }}
        />
      ))}
    </>
  );
  const appear: CSSProperties = reduceMotion ? {} : { animation: "sl-fade-in 0.3s ease-out" };

  if (size === "hidden") {
    return (
      <SLPress
        scale={0.98}
        onPress={() => setSize("small")}
        style={{ ...appear, alignSelf: "stretch", display: "flex", alignItems: "center", gap: 6, minHeight: SL.Space.hitMin, background: "transparent", color: SL.Ink.secondary }}
      >
        <SFSymbol name="photo" size={13} weight={600} color={SL.Ink.secondary} />
        <span style={slFont(SL.TypeSize.meta, SL.Weight.semibold)}>Show exercise photos</span>
      </SLPress>
    );
  }

  if (size === "small") {
    const mark = (lit: boolean) => (
      <span style={{ width: 16, height: 4, borderRadius: 2, background: lit ? SL.Signal.action : SL.Surface.hairlineStrong, transition: "background 350ms ease-in-out" }} />
    );
    const plain = (symbol: string, label: string, next: Size) => (
      <SLPress
        scale={0.88}
        onPress={() => setSize(next)}
        aria-label={label}
        style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, flexShrink: 0, display: "grid", placeItems: "center", background: "transparent" }}
      >
        <SFSymbol name={symbol} size={15} weight={600} color={SL.Ink.secondary} />
      </SLPress>
    );
    return (
      <div
        style={{
          ...appear,
          alignSelf: "stretch",
          display: "flex",
          alignItems: "center",
          gap: SL.Space.s3,
          padding: SL.Space.s2,
          borderRadius: SL.Radius.xl,
          background: SL.Surface.raised,
          boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}`,
        }}
      >
        <SLPress
          scale={0.96}
          onPress={() => setSize("large")}
          aria-label="Photos of the start and end position. Shows them bigger"
          style={{ position: "relative", width: 96, height: 72, flexShrink: 0, borderRadius: SL.Radius.md, overflow: "hidden", background: SL.Surface.raised2 }}
        >
          {photos()}
        </SLPress>
        <div aria-hidden style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={{ ...slFont(SL.TypeSize.meta, SL.Weight.semibold), color: SL.Ink.primary }}>{showsEnd ? "End position" : "Start position"}</span>
          <span style={{ display: "flex", gap: 4 }}>
            {mark(!showsEnd)}
            {mark(showsEnd)}
          </span>
          {/* The credit is on the big view, where it has room. */}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex" }}>
          {plain("arrow.up.left.and.arrow.down.right", "Show photos bigger", "large")}
          {plain("eye.slash", "Hide photos", "hidden")}
        </div>
      </div>
    );
  }

  const onPhoto = (symbol: string, label: string, next: Size) => (
    <SLPress
      scale={0.88}
      onPress={() => setSize(next)}
      aria-label={label}
      style={{ width: SL.Space.hitMin, height: SL.Space.hitMin, display: "grid", placeItems: "center", background: "transparent" }}
    >
      <span style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.45)", display: "grid", placeItems: "center" }}>
        <SFSymbol name={symbol} size={13} weight={700} color="#fff" />
      </span>
    </SLPress>
  );
  return (
    <div style={{ ...appear, position: "relative", alignSelf: "stretch", aspectRatio: "16 / 9", borderRadius: SL.Radius.xl, overflow: "hidden", background: SL.Surface.raised2 }}>
      <div role="img" aria-label="Photos of the start and end position" style={{ position: "absolute", inset: 0 }}>
        {photos()}
        <span style={{ ...chip, ...slFont(SL.TypeSize.micro, SL.Weight.bold), left: SL.Space.s2, letterSpacing: 0.6, background: "rgba(0,0,0,0.45)" }}>{showsEnd ? "End" : "Start"}</span>
        <span style={{ ...chip, ...slFont(SL.TypeSize.micro, SL.Weight.medium), right: SL.Space.s2, color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.35)" }}>{ExerciseMedia.credit}</span>
      </div>
      <div style={{ position: "absolute", top: SL.Space.s1, right: SL.Space.s1, display: "flex" }}>
        {onPhoto("arrow.down.right.and.arrow.up.left", "Show photos smaller", "small")}
        {onPhoto("eye.slash", "Hide photos", "hidden")}
      </div>
    </div>
  );
}
