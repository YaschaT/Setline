// BeforeAfterSlider.swift — the comparison as one picture: the earlier one
// under the later, and a line between them that the finger moves — left of it
// is then, right of it is now. Dragged sideways, or tapped where the line
// should go; a pull up or down still scrolls the page.
//
// Both pictures fill the same 3:4 frame the side-by-side pair uses, so the
// same pose lines up as it does there.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { rounded } from "../../core/Support/swift";
import { SL } from "../../design/tokens";
import { slFixed } from "../../design/SLDynamicType";
import { SLGlyph } from "../../design/components/SLGlyph";
import { useSidewaysDrag } from "../../design/components/SidewaysDrag";
import { useReduceMotion } from "../../design/support";
import { PhotoThumbnail } from "./PhotoThumbnail";

const clamped = (value: number) => Math.min(Math.max(value, 0), 1);

export function BeforeAfterSlider({ before, after, beforeTag, afterTag }: { before?: string; after?: string; beforeTag: string; afterTag: string }) {
  const reduceMotion = useReduceMotion();
  /** Where the line stands, as a share of the width: 0 shows only now, 1 only then. */
  const [split, setSplit] = useState(0.5);
  const [animate, setAnimate] = useState(false);
  const dragStart = useRef<number | undefined>(undefined);
  const frame = useRef<HTMLDivElement>(null);
  const [beforeImage, setBeforeImage] = useState<string | undefined>(undefined);
  const [afterImage, setAfterImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void Promise.all([
      before ? PhotoThumbnail.load(before, { maxPixels: 1400 }) : Promise.resolve(undefined),
      after ? PhotoThumbnail.load(after, { maxPixels: 1400 }) : Promise.resolve(undefined),
    ]).then(([b, a]) => {
      if (!live) return;
      setBeforeImage(b);
      setAfterImage(a);
    });
    return () => {
      live = false;
    };
  }, [before, after]);

  const width = () => Math.max(frame.current?.clientWidth ?? 1, 1);
  const drag = useSidewaysDrag({
    onChanged: (dx) => {
      const start = dragStart.current ?? split;
      dragStart.current = start;
      setAnimate(false);
      setSplit(clamped(start + dx / width()));
    },
    onEnded: () => {
      dragStart.current = undefined;
    },
  });

  /** A rectangle the size it is offered, the picture filling it from inside. */
  const picture = (image: string | undefined) => (
    <div style={{ position: "absolute", inset: 0, background: SL.Surface.raised2, overflow: "hidden" }}>
      {image && <img src={image} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    </div>
  );

  const tag = (text: string, side: "leading" | "trailing"): ReactNode => (
    <div style={{ position: "absolute", top: 0, [side === "leading" ? "left" : "right"]: 0, padding: SL.Space.s3 }}>
      <span
        style={{
          ...slFixed(SL.TypeSize.meta, SL.Weight.semibold),
          fontVariantNumeric: "tabular-nums",
          color: SL.Ink.primary,
          whiteSpace: "nowrap",
          display: "block",
          paddingLeft: SL.Space.s2,
          paddingRight: SL.Space.s2,
          paddingTop: 4,
          paddingBottom: 4,
          borderRadius: 999,
          background: "rgba(0,0,0,0.55)",
          lineHeight: 1.25,
        }}
      >
        {text}
      </span>
    </div>
  );

  const percent = `${split * 100}%`;
  const transition = animate && !reduceMotion ? "0.2s ease-out" : "none";

  return (
    <div
      ref={frame}
      {...drag}
      role="slider"
      tabIndex={0}
      aria-label={`Before and after, ${beforeTag} against ${afterTag}`}
      aria-valuetext={`${Math.trunc(rounded(split * 100))} percent before`}
      aria-valuenow={Math.trunc(rounded(split * 100))}
      aria-valuemin={0}
      aria-valuemax={100}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") setSplit((s) => clamped(s + 0.1));
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") setSplit((s) => clamped(s - 0.1));
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setAnimate(true);
        setSplit(clamped((e.clientX - rect.left) / Math.max(rect.width, 1)));
      }}
      style={{ ...drag.style, position: "relative", alignSelf: "stretch", width: "100%", aspectRatio: "3 / 4", borderRadius: SL.Radius.lg, overflow: "hidden", userSelect: "none" }}
    >
      {/* Each tag belongs to its picture, so the line cuts it as it cuts the picture. */}
      <div style={{ position: "absolute", inset: 0 }}>
        {picture(afterImage)}
        {tag(afterTag, "trailing")}
      </div>
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 calc(100% - ${percent}) 0 0)`, transition: transition === "none" ? "none" : `clip-path ${transition}` }}>
        {picture(beforeImage)}
        {tag(beforeTag, "leading")}
      </div>

      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `calc(${percent} - 1px)`,
          width: 2,
          background: "#fff",
          boxShadow: "0 0 3px rgba(0,0,0,0.35)",
          transition: transition === "none" ? "none" : `left ${transition}`,
        }}
      />
      {/* 44 to hold, the arrows saying which way it goes. */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: percent,
          transform: "translate(-50%, -50%)",
          width: SL.Space.hitMin,
          height: SL.Space.hitMin,
          borderRadius: "50%",
          background: SL.Surface.raised,
          boxShadow: "inset 0 0 0 2px #fff, 0 0 4px rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          color: SL.Ink.primary,
          transition: transition === "none" ? "none" : `left ${transition}`,
        }}
      >
        <SLGlyph name="chevronLeft" size={12} fixed />
        <SLGlyph name="chevronRight" size={12} fixed />
      </div>
    </div>
  );
}
