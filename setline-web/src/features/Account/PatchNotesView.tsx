// PatchNotesView.swift — "What's new": every update, in plain words, for
// everyone. One list for both apps: public/patch-notes.json ships with the
// site, and the iPhone app reads the same file from the live site, so the two
// never tell a different story.
import { useEffect } from "react";
import { SL } from "../../design/tokens";
import { HStack, Text, VStack } from "../../design/swiftui";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { SLOverline } from "../../design/components/SLPieces";
import { SLSheet } from "../../design/components/SLSheet";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { PatchNotes, usePatchNotes } from "./PatchNotes";

export function PatchNotesView({ onClose }: { onClose: () => void }) {
  const store = usePatchNotes();
  const list = store.notes;
  // Opened is read: the dot on Settings goes once the list is on screen.
  useEffect(() => {
    if (list.length > 0) PatchNotes.markSeen();
  }, [list.length]);

  return (
    <SLSheet title="What's new" subtitle="Every update to Setline, in plain words" onClose={onClose}>
      <VStack alignment="leading" spacing={SL.Space.s6} style={{ paddingTop: SL.Space.s2, paddingBottom: SL.Space.s6 }}>
        {list.length === 0 && (
          <Text {...slBody()} color={SL.Ink.secondary}>
            Couldn't load the updates. Check your connection and open this again.
          </Text>
        )}
        {list.map((note, index) => (
          <VStack key={note.id} alignment="leading" spacing={SL.Space.s2} style={{ alignSelf: "stretch" }}>
            <HStack spacing={SL.Space.s2}>
              <SLOverline text={PatchNotes.dateLabel(note.date)} color={index === 0 ? SL.Signal.action : SL.Ink.secondary} />
              {index === 0 && (
                <Text size={SL.TypeSize.micro} weight={SL.Weight.bold} tracking={0.8} color={SL.Signal.onAction} style={{ background: SL.Signal.action, borderRadius: 999, padding: "1px 7px" }}>
                  LATEST
                </Text>
              )}
            </HStack>
            <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>
              {note.title}
            </Text>
            <VStack
              alignment="leading"
              spacing={SL.Space.s3}
              style={{ alignSelf: "stretch", background: SL.Surface.raised2, borderRadius: SL.Radius.lg, padding: SL.Space.s4 }}
            >
              {note.items.map((item, i) => (
                <HStack key={i} alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
                  <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: SL.Signal.action, marginTop: 8, flexShrink: 0 }} />
                  <Text {...slBody()} lineHeight={1.45} color={SL.Ink.primary} style={{ flex: "1 1 0", minWidth: 0 }}>
                    {item}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </VStack>
        ))}
        {list.length > 0 && (
          <Text {...slMeta()} color={SL.Ink.tertiary}>
            Same updates on iPhone and in the browser.
          </Text>
        )}
        <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          <SLPrimaryButton onPress={onClose}>Got it</SLPrimaryButton>
        </div>
      </VStack>
    </SLSheet>
  );
}

/**
 * The newest update as a dialog over Training, with the screen dimmed
 * behind it: read once as the app opens, then out of the way. Every update
 * stays in Settings › What's new.
 */
export function PatchNotesDialog({ onClose }: { onClose: () => void }) {
  const store = usePatchNotes();
  const note = store.notes[0];
  useEffect(() => {
    if (note) PatchNotes.markSeen();
  }, [note]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!note) return null;

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0, 0, 0, 0.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: SL.Space.s4, animation: "slRootFade 0.2s ease-out" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`What's new: ${note.title}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 400, maxHeight: "82vh", display: "flex", flexDirection: "column", background: SL.Surface.raised, borderRadius: SL.Radius.xl, boxShadow: `inset 0 0 0 1px ${SL.Surface.hairline}, 0 24px 60px rgba(0, 0, 0, 0.55)`, overflow: "hidden" }}
      >
        <VStack alignment="leading" spacing={SL.Space.s2} style={{ padding: `${SL.Space.s5}px ${SL.Space.s5}px ${SL.Space.s3}px` }}>
          <HStack spacing={SL.Space.s2}>
            <SLOverline text={`What's new · ${PatchNotes.dateLabel(note.date)}`} color={SL.Signal.action} />
          </HStack>
          <Text as="h2" {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>
            {note.title}
          </Text>
        </VStack>
        <div style={{ overflowY: "auto", padding: `0 ${SL.Space.s5}px` }}>
          <VStack alignment="leading" spacing={SL.Space.s3} style={{ alignSelf: "stretch", paddingBottom: SL.Space.s2 }}>
            {note.items.map((item, i) => (
              <HStack key={i} alignment="top" spacing={SL.Space.s3} style={{ alignSelf: "stretch" }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: SL.Signal.action, marginTop: 8, flexShrink: 0 }} />
                <Text {...slBody()} lineHeight={1.45} color={SL.Ink.primary} style={{ flex: "1 1 0", minWidth: 0 }}>
                  {item}
                </Text>
              </HStack>
            ))}
          </VStack>
        </div>
        <VStack spacing={SL.Space.s2} style={{ alignItems: "stretch", padding: SL.Space.s5, paddingTop: SL.Space.s4 }}>
          <SLPrimaryButton onPress={onClose}>Got it</SLPrimaryButton>
          <Text {...slMeta()} color={SL.Ink.tertiary} align="center">
            Every update stays in Settings › What's new.
          </Text>
        </VStack>
      </div>
    </div>
  );
}
