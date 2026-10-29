// SLValueRow.swift — a value and what it did beside it, on their shared
// baseline: "63,5 kg  +6,2 in 8 weken".
import type { CSSProperties, ReactNode } from "react";
import { SL } from "../tokens";
import { HStack } from "../swiftui";

export function SLValueRow({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <HStack alignment="firstTextBaseline" spacing={SL.Space.s3} style={style}>
      {children}
    </HStack>
  );
}
