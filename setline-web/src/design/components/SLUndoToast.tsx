// SLUndoToast.swift — a short confirmation directly above the primary
// action, with an undo when there is something to undo. As high as the
// action it sits above, on surface-2 inside the strong hairline.
import { SL } from "../tokens";
import { HStack, Spacer, Text } from "../swiftui";
import { PressButton, useFillWidth } from "../support";
import { slHitTarget } from "./SLText";

export function SLUndoToast({ message, onUndo, onDismiss }: { message: string; onUndo?: () => void; onDismiss: () => void }) {
  const [ref, fill] = useFillWidth<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: SL.Metric.primaryPillHeight + 2 * SL.Metric.border,
        paddingLeft: SL.Space.s4,
        paddingRight: SL.Space.s4,
        background: SL.Surface.raised2,
        border: `${SL.Metric.border}px solid ${SL.Surface.hairlineStrong}`,
        borderRadius: SL.Radius.lg,
        ...fill,
      }}
    >
      <HStack alignment="center" spacing={SL.Space.s3} style={{ flex: "1 1 0", minWidth: 0 }}>
        {/* A message that wraps keeps clear of the capsule's ends. */}
        <Text size={SL.TypeSize.body} weight={SL.Weight.regular} color={SL.Ink.primary} style={{ paddingTop: SL.Space.s3, paddingBottom: SL.Space.s3 }}>
          {message}
        </Text>
        <Spacer minLength={SL.Space.s2} />
        {onUndo ? (
          <PressButton onPress={onUndo} style={{ flexShrink: 0 }}>
            <Text size={SL.TypeSize.body} weight={SL.Weight.semibold} color={SL.Signal.action} style={{ whiteSpace: "nowrap", display: "inline-block", ...slHitTarget() }}>
              Undo
            </Text>
          </PressButton>
        ) : (
          <PressButton onPress={onDismiss} style={{ flexShrink: 0 }}>
            <Text size={SL.TypeSize.body} weight={SL.Weight.regular} color={SL.Ink.secondary} style={{ whiteSpace: "nowrap", display: "inline-block", ...slHitTarget() }}>
              Close
            </Text>
          </PressButton>
        )}
      </HStack>
    </div>
  );
}
