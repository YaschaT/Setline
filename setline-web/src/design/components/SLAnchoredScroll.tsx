// SLAnchoredScroll.swift — a screen's content at full height: a flexible
// space keeps the lower part down by the commit block, and the whole column
// scrolls once it no longer fits.
import type { CSSProperties, ReactNode } from "react";
import { ScrollView } from "../swiftui";

export function SLAnchoredScroll({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <ScrollView style={{ flex: "1 1 0", minHeight: 0, height: "100%", width: "100%", alignSelf: "stretch", ...style }}>
      {/* `.frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .top)` */}
      <div className="sl-anchored" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", minHeight: "100%", width: "100%" }}>
        {children}
      </div>
    </ScrollView>
  );
}
