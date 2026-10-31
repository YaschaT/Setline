// TrainedTogetherViews.swift: naming the friends you trained with on a post,
// "with Alex" under its title, and the Together view on the post's page.
import { useEffect, useState } from "react";
import { SL, slListCard } from "../../design/tokens";
import { Sheet, Text, VStack, type Binding } from "../../design/swiftui";
import { SFSymbol } from "../../design/SFSymbol";
import { SLPrimaryButton } from "../../design/SetlineTokens";
import { SLFlow } from "../../design/components/SLFlow";
import { SLAvatar } from "../../design/components/SLAvatar";
import { SLPress } from "../../design/components/SLPress";
import { SLSheet } from "../../design/components/SLSheet";
import { slBody, slLead, slMeta } from "../../design/components/SLText";
import { FeedPost, SocialProfile, useSocial, type PostExercise } from "../../data/SocialStore";

const chipStyle = (lit: boolean) => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  paddingLeft: SL.Space.s3,
  paddingRight: SL.Space.s3,
  minHeight: 40,
  borderRadius: 999,
  background: lit ? SL.Signal.action : SL.Surface.raised2,
  boxShadow: lit ? undefined : `inset 0 0 0 1px ${SL.Surface.hairlineStrong}`,
});

/** "Who did you train with?" on a new or edited post. Only friends can be named. */
export function TrainedWithCard({ participants }: { participants: Binding<string[] | undefined> }) {
  const social = useSocial();
  const [picking, setPicking] = useState(false);
  const ids = participants.value ?? [];
  const named = social.friends.filter((f) => ids.includes(f.user_id));
  return (
    <VStack
      alignment="leading"
      spacing={SL.Space.s3}
      style={{ alignSelf: "stretch", padding: SL.Space.s4, background: SL.Surface.raised, border: `1px solid ${SL.Surface.hairline}`, borderRadius: SL.Radius.lg, overflow: "hidden" }}
    >
      <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>Who did you train with?</Text>
      <SLFlow spacing={SL.Space.s2}>
        {named.map((friend) => (
          <SLPress key={friend.user_id} scale={0.95} aria-label={`Remove ${friend.display_name}`} onPress={() => participants.set(ids.filter((id) => id !== friend.user_id))} style={chipStyle(true)}>
            <Text {...slMeta(SL.Weight.semibold)} color={SL.Signal.onAction} lineLimit={1}>{friend.display_name}</Text>
            <SFSymbol name="xmark" size={10} weight={700} color={SL.Signal.onAction} />
          </SLPress>
        ))}
        <SLPress scale={0.95} disabled={social.friends.length === 0} onPress={() => setPicking(true)} style={{ ...chipStyle(false), opacity: social.friends.length === 0 ? 0.5 : 1 }}>
          <SFSymbol name="person.2.fill" size={13} weight={600} color={SL.Ink.primary} />
          <Text {...slMeta(SL.Weight.semibold)} color={SL.Ink.primary} lineLimit={1}>{named.length === 0 ? "Add friends" : "Add more"}</Text>
        </SLPress>
      </SLFlow>
      <Text {...slMeta()} color={SL.Ink.tertiary}>
        {social.friends.length === 0 ? "Add friends first to name them here." : "Optional. They see your workout next to theirs."}
      </Text>
      <Sheet isPresented={picking} onDismiss={() => setPicking(false)}>
        <FriendPickerSheet friends={social.friends} selection={{ value: ids, set: (v) => participants.set(v) }} onClose={() => setPicking(false)} />
      </Sheet>
    </VStack>
  );
}

/** Every friend, ticked or not. */
export function FriendPickerSheet({ friends, selection, onClose }: { friends: SocialProfile[]; selection: Binding<string[]>; onClose: () => void }) {
  return (
    <SLSheet title="Trained with" subtitle="Tick everyone who was there" onClose={onClose}>
      <VStack spacing={0} style={{ alignSelf: "stretch" }}>
        {friends.map((friend) => {
          const on = selection.value.includes(friend.user_id);
          return (
            <button
              key={friend.user_id}
              type="button"
              className="sl-pressable"
              aria-pressed={on}
              onClick={() => selection.set(on ? selection.value.filter((id) => id !== friend.user_id) : [...selection.value, friend.user_id])}
              style={{ display: "flex", alignItems: "center", gap: SL.Space.s3, paddingTop: SL.Space.s2, paddingBottom: SL.Space.s2, minHeight: SL.Space.hitMin, background: "transparent", width: "100%" }}
            >
              <SLAvatar initial={SocialProfile.initial(friend)} size={36} />
              <VStack alignment="leading" spacing={1} style={{ flex: "1 1 0", minWidth: 0 }}>
                <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary} lineLimit={1}>{friend.display_name}</Text>
                <Text {...slMeta()} color={SL.Ink.secondary} lineLimit={1}>{`@${friend.username}`}</Text>
              </VStack>
              <SFSymbol name={on ? "checkmark.circle.fill" : "circle"} size={22} weight={600} color={on ? SL.Signal.action : SL.Ink.tertiary} />
            </button>
          );
        })}
      </VStack>
      <div style={{ alignSelf: "stretch", paddingTop: SL.Space.s4 }}>
        <SLPrimaryButton onPress={onClose}>Done</SLPrimaryButton>
      </div>
    </SLSheet>
  );
}

/** "with Alex and Sam" under a post's title. */
export const TrainedWithLine = {
  text(friends: SocialProfile[]): string | undefined {
    const names = friends.map((f) => f.display_name.split(" ")[0] || f.display_name);
    if (names.length === 0) return undefined;
    if (names.length === 1) return `with ${names[0]}`;
    if (names.length === 2) return `with ${names[0]} and ${names[1]}`;
    return `with ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  },
};

/** "3 sets · best 100 kg × 5", or only the sets when weights are hidden. */
function detail(exercise: PostExercise, hidesWeights: boolean): string {
  const sets = exercise.sets === 1 ? "1 set" : `${exercise.sets} sets`;
  if (hidesWeights || exercise.reps === undefined) return sets;
  if (exercise.weight_kg !== undefined && exercise.weight_kg > 0) {
    const kg = Number.isInteger(exercise.weight_kg) ? String(exercise.weight_kg) : exercise.weight_kg.toFixed(1);
    return `${sets} · best ${kg} kg × ${exercise.reps}`;
  }
  return `${sets} · best ${exercise.reps} reps`;
}

/**
 * The workout on the post's own page, exercise by exercise. Done together, it
 * is a section per person — the post's author first, then each friend named,
 * from their own post of that day.
 */
export function TogetherSection({ post }: { post: FeedPost }) {
  const social = useSocial();
  const [theirs, setTheirs] = useState<FeedPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    setLoaded(false);
    if (FeedPost.trainedWith(post).length === 0) {
      setLoaded(true);
      return;
    }
    void social.togetherPosts(post).then((posts) => {
      if (!live) return;
      setTheirs(posts);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const nameOf = (userID: string, fallback: string) => (userID === social.myID ? "You" : fallback);
  const section = (name: string, p: FeedPost, key: string) => {
    const exercises = p.exercises ?? [];
    return (
      <VStack key={key} alignment="leading" spacing={SL.Space.s2} style={{ ...slListCard(), alignSelf: "stretch", padding: SL.Space.s4 }}>
        <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{name}</Text>
        {exercises.length === 0 ? (
          <Text {...slMeta()} color={SL.Ink.secondary}>No exercises shared on this post.</Text>
        ) : (
          exercises.map((exercise, index) => (
            <VStack key={index} alignment="leading" spacing={2} style={{ paddingTop: 2, paddingBottom: 2 }}>
              <Text {...slBody(SL.Weight.medium)} color={SL.Ink.primary}>{exercise.name}</Text>
              <Text {...slMeta()} numerals color={SL.Ink.secondary}>{detail(exercise, FeedPost.hides(p, "weights"))}</Text>
            </VStack>
          ))
        )}
      </VStack>
    );
  };

  return (
    <VStack alignment="leading" spacing={SL.Space.s4} style={{ alignSelf: "stretch" }}>
      <Text {...slMeta(SL.Weight.semibold)} tracking={SL.TypeSize.meta * 0.06} color={SL.Ink.secondary}>
        {FeedPost.trainedWith(post).length === 0 ? "THE WORKOUT" : "TOGETHER"}
      </Text>
      {section(nameOf(post.user_id, post.author?.display_name ?? "A friend"), post, "author")}
      {FeedPost.trainedWith(post).map((friend) => {
        const match = theirs.find((p) => p.user_id === friend.user_id);
        const name = nameOf(friend.user_id, friend.display_name);
        if (match) return section(name, match, friend.user_id);
        return (
          <VStack key={friend.user_id} alignment="leading" spacing={SL.Space.s1} style={{ ...slListCard(), alignSelf: "stretch", padding: SL.Space.s4 }}>
            <Text {...slLead(SL.Weight.semibold)} color={SL.Ink.primary}>{name}</Text>
            <Text {...slMeta()} color={SL.Ink.secondary}>
              {!loaded
                ? "Loading…"
                : friend.user_id === social.myID
                  ? "Your own sets show here once you post this workout too."
                  : "Trained along. Their own sets show here once they post this workout."}
            </Text>
          </VStack>
        );
      })}
    </VStack>
  );
}
