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
      </VStack>
    </SLSheet>
  );
}
