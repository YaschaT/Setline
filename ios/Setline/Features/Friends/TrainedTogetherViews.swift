import SwiftUI
import SetlineCore

/// "Who did you train with?" on a new or edited post: the friends named so
/// far as chips, and a way to add more. Only friends can be named.
struct TrainedWithCard: View {
    @Environment(SocialStore.self) private var social
    @Binding var participants: [String]?
    @State private var picking = false

    private var named: [SocialProfile] {
        let ids = participants ?? []
        return social.friends.filter { ids.contains($0.user_id) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            Text("Who did you train with?").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
            SLFlow(spacing: SL.Space.s2) {
                ForEach(named) { friend in
                    Button {
                        participants = (participants ?? []).filter { $0 != friend.user_id }
                    } label: {
                        HStack(spacing: 6) {
                            Text(friend.display_name).lineLimit(1)
                            Image(systemName: "xmark").font(.system(size: 10, weight: .bold))
                        }
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.onAction)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 40)
                        .background(Capsule().fill(SL.Signal.action))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(SLPressStyle(scale: 0.95))
                    .accessibilityLabel("Remove \(friend.display_name)")
                }
                Button { picking = true } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "person.2.fill").font(.system(size: 13, weight: .semibold))
                        Text(named.isEmpty ? "Add friends" : "Add more").lineLimit(1)
                    }
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: 40)
                    .background(Capsule().fill(SL.Surface.raised2))
                    .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                    .contentShape(Capsule())
                }
                .buttonStyle(SLPressStyle(scale: 0.95))
                .disabled(social.friends.isEmpty)
                .opacity(social.friends.isEmpty ? 0.5 : 1)
            }
            Text(social.friends.isEmpty
                 ? "Add friends first to name them here."
                 : "Optional. They see your workout next to theirs.")
                .slMeta().foregroundStyle(SL.Ink.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SL.Space.s4)
        .slBorderBox()
        .slListCard()
        .sheet(isPresented: $picking) {
            FriendPickerSheet(
                friends: social.friends,
                selection: Binding(get: { participants ?? [] }, set: { participants = $0 }),
                onClose: { picking = false }
            )
            .presentationDragIndicator(.visible)
        }
    }
}

/// Every friend, ticked or not.
struct FriendPickerSheet: View {
    let friends: [SocialProfile]
    @Binding var selection: [String]
    let onClose: () -> Void

    var body: some View {
        SLSheet(title: "Trained with", subtitle: "Tick everyone who was there", onClose: onClose) {
            VStack(spacing: 0) {
                ForEach(friends) { friend in
                    let on = selection.contains(friend.user_id)
                    Button {
                        selection = on ? selection.filter { $0 != friend.user_id } : selection + [friend.user_id]
                    } label: {
                        HStack(spacing: SL.Space.s3) {
                            SLAvatar(photo: nil, initial: friend.initial, size: 36)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(friend.display_name).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                                Text("@\(friend.username)").slMeta().foregroundStyle(SL.Ink.secondary)
                            }
                            Spacer(minLength: SL.Space.s2)
                            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(on ? SL.Signal.action : SL.Ink.tertiary)
                        }
                        .padding(.vertical, SL.Space.s2)
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
            }
            Button("Done", action: onClose)
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.top, SL.Space.s4)
        }
    }
}

/// "with Alex and Sam" under a post's title.
enum TrainedWithLine {
    static func text(_ friends: [SocialProfile]) -> String? {
        let names = friends.map { $0.display_name.split(separator: " ").first.map(String.init) ?? $0.display_name }
        switch names.count {
        case 0: return nil
        case 1: return "with \(names[0])"
        case 2: return "with \(names[0]) and \(names[1])"
        default: return "with \(names.dropLast().joined(separator: ", ")) and \(names.last!)"
        }
    }
}

/// A workout done together, on the post's own page: a section per person —
/// the post's author first, then each friend named, from their own post of
/// that day.
struct TogetherSection: View {
    @Environment(SocialStore.self) private var social
    let post: FeedPost
    @State private var theirs: [FeedPost] = []
    @State private var loaded = false

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s4) {
            Text("TOGETHER")
                .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                .tracking(SL.TypeSize.meta * 0.06)
                .foregroundStyle(SL.Ink.secondary)
            section(name: post.user_id == social.myID ? "You" : (post.author?.display_name ?? "A friend"), post: post)
            ForEach(post.trainedWith, id: \.user_id) { friend in
                if let match = theirs.first(where: { $0.user_id == friend.user_id }) {
                    section(name: friend.user_id == social.myID ? "You" : friend.display_name, post: match)
                } else {
                    VStack(alignment: .leading, spacing: SL.Space.s1) {
                        Text(friend.user_id == social.myID ? "You" : friend.display_name).slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                        Text(loaded ? "No post from \(friend.user_id == social.myID ? "you" : friend.display_name) for this day yet." : "Loading…")
                            .slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                    .padding(SL.Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .slListCard()
                }
            }
        }
        .task(id: post.id) {
            theirs = await social.togetherPosts(for: post)
            loaded = true
        }
    }

    private func section(name: String, post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            Text(name).slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
            let exercises = post.exercises ?? []
            if exercises.isEmpty {
                Text("No exercises shared on this post.").slMeta().foregroundStyle(SL.Ink.secondary)
            } else {
                ForEach(Array(exercises.enumerated()), id: \.offset) { _, exercise in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(exercise.name).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                        Text(detail(exercise, hidesWeights: post.hides(.weights)))
                            .slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slListCard()
    }

    /// "3 sets · best 100 kg × 5", or only the sets when weights are hidden.
    private func detail(_ exercise: PostExercise, hidesWeights: Bool) -> String {
        let sets = exercise.sets == 1 ? "1 set" : "\(exercise.sets) sets"
        guard !hidesWeights, let reps = exercise.reps else { return sets }
        if let kg = exercise.weight_kg, kg > 0 {
            let weight = kg.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(kg)) : String(format: "%.1f", kg)
            return "\(sets) · best \(weight) kg × \(reps)"
        }
        return "\(sets) · best \(reps) reps"
    }
}
