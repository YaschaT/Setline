// SLFoodPhoto.swift — a food's photo: a product's own image from Open Food
// Facts, or a bundled photo for the quick adds. While it loads, or where
// there is none, the tile shows a fork and knife.
import { useState, type CSSProperties } from "react";
import { SL } from "../tokens";
import { SFSymbol } from "../SFSymbol";
import { assetURL } from "../support";

/** `SLFoodPhoto.Source`. */
export type SLFoodPhoto_Source =
  | { kind: "url"; value?: string }
  /** A bundled photo, by asset name (`public/food/<name>.jpg`). */
  | { kind: "asset"; value: string };
export const SLFoodPhoto_Source = {
  url(value: string | undefined): SLFoodPhoto_Source {
    return { kind: "url", value };
  },
  asset(value: string): SLFoodPhoto_Source {
    return { kind: "asset", value };
  },
};

/** The tile decides the size (pass `style={{ width, height }}`); the photo fills it and is cut to it. */
export function SLFoodPhoto({
  source,
  cornerRadius = SL.Radius.md,
  style,
}: {
  source: SLFoodPhoto_Source;
  cornerRadius?: number;
  style?: CSSProperties;
}) {
  const url = source.kind === "url" ? source.value : undefined;
  return (
    <div
      aria-hidden
      style={{
        position: "relative",
        flexShrink: 0,
        width: "100%",
        height: "100%",
        borderRadius: cornerRadius,
        background: SL.Surface.raised2,
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        ...style,
      }}
    >
      <SFSymbol name="fork.knife" size={15} weight={500} color={SL.Ink.tertiary} />
      {source.kind === "asset" ? (
        <img src={assetURL(`food/${source.value}.jpg`)} alt="" draggable={false} style={fillImage} />
      ) : url ? (
        <AsyncImage key={url} url={url} />
      ) : null}
    </div>
  );
}

const fillImage: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" };

/** `AsyncImage(url:transaction: .easeOut(0.2))` — fades in once loaded; nothing on failure. */
function AsyncImage({ url }: { url: string }) {
  const [phase, setPhase] = useState<"loading" | "loaded" | "failed">("loading");
  if (phase === "failed") return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      onLoad={() => setPhase("loaded")}
      onError={() => setPhase("failed")}
      style={{ ...fillImage, opacity: phase === "loaded" ? 1 : 0, transition: "opacity 0.2s ease-out" }}
    />
  );
}
