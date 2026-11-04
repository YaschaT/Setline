// ExercisePreview.swift — the exercise, moving: its start and end photo one
// after the other, so the form is there without a tap. Keyed by exercise, so a
// swap shows the new one at once. An exercise without a faithful photo shows
// nothing.
import { useEffect, useState, type CSSProperties } from "react";
import { SL, slFont } from "../../design/tokens";
import { useReduceMotion } from "../../design/support";
import { ExerciseMedia } from "../../core/Catalog/ExerciseMedia";
import { useApp } from "../../data/AppState";

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
  const [showsEnd, setShowsEnd] = useState(false);
  // An exercise added from the online library brings its own photos.
  const added = app.customExercises.find((c) => c.id === exerciseID)?.photoFolder;
  const frames = added !== undefined ? ExerciseMedia.framesOfFolder(added) : ExerciseMedia.frames(exerciseID);

  useEffect(() => {
    setShowsEnd(false);
    if (reduceMotion) return;
    const timer = setInterval(() => setShowsEnd((end) => !end), 1200);
    return () => clearInterval(timer);
  }, [exerciseID, reduceMotion]);

  if (frames.length !== 2) return null;
  const photo = (src: string, visible: boolean) => (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: visible ? 1 : 0, transition: "opacity 350ms ease-in-out" }}
    />
  );
  return (
    <div
      role="img"
      aria-label="Photos of the start and end position"
      style={{ position: "relative", alignSelf: "stretch", aspectRatio: "16 / 9", borderRadius: SL.Radius.xl, overflow: "hidden", background: SL.Surface.raised2 }}
    >
      {photo(frames[0], !showsEnd)}
      {photo(frames[1], showsEnd)}
      <span style={{ ...chip, ...slFont(SL.TypeSize.micro, SL.Weight.bold), left: SL.Space.s2, letterSpacing: 0.6, background: "rgba(0,0,0,0.45)" }}>{showsEnd ? "End" : "Start"}</span>
      <span style={{ ...chip, ...slFont(SL.TypeSize.micro, SL.Weight.medium), right: SL.Space.s2, color: "rgba(255,255,255,0.85)", background: "rgba(0,0,0,0.35)" }}>{ExerciseMedia.credit}</span>
    </div>
  );
}
