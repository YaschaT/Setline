// SLSheet.swift — a bottom sheet as the redesign draws it: surface-1 under
// the strong hairline, radius 22 at the top and never taller than 86% of the
// screen. Its head is the title at 21 with one line of 13 beneath it, and a
// round close control that is a full 44 across.
//
// Present it as iOS does: `<Sheet isPresented onDismiss><SLSheet …>…</SLSheet></Sheet>`.
// It sets the sheet's presentation itself (0.86 detent, no grabber, raised
// fill, radius 22) through `Presentation`.
import type { ReactNode } from "react";
import { SL } from "../tokens";
import { HStack, ScrollView, Text, VStack } from "../swiftui";
import { PressButton, Presentation } from "../support";
import { slMeta, slTitle } from "./SLText";
import { SLGlyph } from "./SLGlyph";

export function SLSheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children?: ReactNode }) {
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: "1 1 0", minHeight: 0, width: "100%", height: "100%", background: SL.Surface.raised }}>
      <Presentation detents={[{ fraction: 0.86 }]} dragIndicator="hidden" background={SL.Surface.raised} cornerRadius={SL.Radius.xl} />
      {/* head */}
      <HStack
        alignment="center"
        spacing={SL.Space.s3}
        style={{ flexShrink: 0, paddingLeft: SL.Space.gutterSession, paddingRight: SL.Space.gutterSession, paddingTop: SL.Space.s4, paddingBottom: SL.Space.s3 }}
      >
        <VStack alignment="leading" spacing={2} style={{ flex: "1 1 0", minWidth: 0 }}>
          <Text as="h2" {...slTitle()} color={SL.Ink.primary}>
            {title}
          </Text>
          {subtitle !== undefined && (
            <Text {...slMeta()} numerals color={SL.Ink.secondary}>
              {subtitle}
            </Text>
          )}
        </VStack>
        <PressButton
          onPress={onClose}
          aria-label="Close"
          style={{
            flexShrink: 0,
            width: SL.Space.hitMin,
            height: SL.Space.hitMin,
            borderRadius: "50%",
            background: SL.Surface.raised2,
            display: "grid",
            placeItems: "center",
          }}
        >
          <SLGlyph name="IconClose" size={16} fixed color={SL.Ink.primary} />
        </PressButton>
      </HStack>
      {/* Up and down only: the content is held to the sheet's width. */}
      <ScrollView style={{ flex: "1 1 0", minHeight: 0, overscrollBehavior: "contain" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            // The content is proposed the full width, as `.frame(maxWidth: .infinity, alignment: .leading)` gives it.
            alignItems: "stretch",
            width: "100%",
            paddingLeft: SL.Space.gutterSession,
            paddingRight: SL.Space.gutterSession,
            paddingBottom: SL.Space.s2,
          }}
        >
          {children}
        </div>
      </ScrollView>
      {/* The design's border-top: a hairline along the top that runs out in the corners. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: SL.Radius.xl * 2,
          borderTopLeftRadius: SL.Radius.xl,
          borderTopRightRadius: SL.Radius.xl,
          boxShadow: `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0) 50%)",
          maskImage: "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0) 50%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
