import CoreLocation
import MapKit
import SwiftUI

// MARK: - Finding gyms

/// Fitness centres around the phone, found once on request: the location is
/// read a single time, never tracked, and only after the lifter asked.
@MainActor
@Observable
final class NearbyGyms {
    enum State: Equatable {
        case idle
        case searching
        case denied
        case found([WorkoutPlace])
        case failed
    }

    private(set) var state: State = .idle
    /// Where the phone was, for an outdoor workout.
    private(set) var here: CLLocationCoordinate2D?

    func search() async {
        state = .searching
        guard let location = await Self.currentLocation() else {
            state = CLLocationManager().authorizationStatus == .denied ? .denied : .failed
            return
        }
        here = location.coordinate
        let region = MKCoordinateRegion(center: location.coordinate, latitudinalMeters: 20_000, longitudinalMeters: 20_000)
        let points = MKLocalPointsOfInterestRequest(center: location.coordinate, radius: 10_000)
        points.pointOfInterestFilter = MKPointOfInterestFilter(including: [.fitnessCenter])
        let words = MKLocalSearch.Request()
        words.naturalLanguageQuery = "gym"
        words.region = region
        words.resultTypes = .pointOfInterest

        // Both searches: Apple's fitness category also holds yoga and dance
        // studios; the word search finds the gyms it files elsewhere.
        async let byCategory = try? MKLocalSearch(request: points).start().mapItems
        async let byWord = try? MKLocalSearch(request: words).start().mapItems
        let items = ((await byCategory) ?? []) + ((await byWord) ?? [])

        var seen = Set<String>()
        let ranked = items.compactMap { item -> (place: WorkoutPlace, distance: CLLocationDistance, isGym: Bool)? in
            let coordinate = item.placemark.coordinate
            guard let name = item.name, !name.isEmpty, seen.insert(name.lowercased()).inserted else { return nil }
            let distance = location.distance(from: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude))
            guard distance <= 10_000 else { return nil }
            return (WorkoutPlace(kind: .gym, name: name, latitude: coordinate.latitude, longitude: coordinate.longitude),
                    distance, Self.soundsLikeGym(name))
        }
        // Gyms first, each group nearest first.
        .sorted { ($0.isGym ? 0 : 1, $0.distance) < ($1.isGym ? 0 : 1, $1.distance) }
        .prefix(10)

        distances = Dictionary(ranked.map { ($0.place, $0.distance) }, uniquingKeysWith: { first, _ in first })
        state = .found(ranked.map(\.place))
    }

    /// How far each found place is, for its row.
    private(set) var distances: [WorkoutPlace: CLLocationDistance] = [:]

    private static let gymWords = ["gym", "fit", "crossfit", "kracht", "strength", "athlet", "training", "sport", "jims", "lift", "barbell", "powerhouse", "box"]

    private static func soundsLikeGym(_ name: String) -> Bool {
        let lower = name.lowercased()
        return gymWords.contains { lower.contains($0) }
    }

    /// One reading, then stop. Asks for "while using" the first time.
    private static func currentLocation() async -> CLLocation? {
        do {
            for try await update in CLLocationUpdate.liveUpdates() {
                if update.authorizationDenied || update.authorizationDeniedGlobally { return nil }
                if let location = update.location, location.horizontalAccuracy >= 0, location.horizontalAccuracy < 500 {
                    return location
                }
            }
        } catch {
            return nil
        }
        return nil
    }
}

// MARK: - Searching by name

/// "basic fit rijkevorsel": Apple Maps' own suggestions as you type, gyms and
/// addresses alike, then the exact place for the one tapped.
@MainActor
@Observable
final class PlaceSearch: NSObject, MKLocalSearchCompleterDelegate {
    private(set) var suggestions: [MKLocalSearchCompletion] = []
    private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.resultTypes = [.pointOfInterest, .address]
        completer.delegate = self
    }

    func update(_ query: String, near coordinate: CLLocationCoordinate2D?) {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            suggestions = []
            return
        }
        if let coordinate {
            completer.region = MKCoordinateRegion(center: coordinate, latitudinalMeters: 60_000, longitudinalMeters: 60_000)
        }
        completer.queryFragment = trimmed
    }

    nonisolated func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        // The completer answers on the main thread it was set up on.
        MainActor.assumeIsolated { self.suggestions = Array(self.completer.results.prefix(8)) }
    }

    nonisolated func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        MainActor.assumeIsolated { self.suggestions = [] }
    }

    /// The place behind a suggestion, with its coordinates.
    func place(for completion: MKLocalSearchCompletion) async -> WorkoutPlace? {
        let request = MKLocalSearch.Request(completion: completion)
        guard let item = try? await MKLocalSearch(request: request).start().mapItems.first else { return nil }
        let coordinate = item.placemark.coordinate
        return WorkoutPlace(kind: .gym, name: item.name ?? completion.title,
                            latitude: coordinate.latitude, longitude: coordinate.longitude)
    }
}

// MARK: - The finish screen's row

/// "Where did you train?" on the finish screen: nothing is shared until a
/// place is picked, and the pick is for this workout only.
struct WorkoutPlaceRow: View {
    @Binding var place: WorkoutPlace?
    @State private var picking = false

    var body: some View {
        Button { picking = true } label: {
            HStack(spacing: SL.Space.s2) {
                Image(systemName: place?.kind.symbol ?? "mappin.and.ellipse")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(place == nil ? SL.Ink.secondary : SL.Signal.action)
                    .frame(width: 22)
                Text(place?.name ?? "Add where you trained")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(place == nil ? SL.Ink.secondary : SL.Ink.primary)
                    .lineLimit(1)
                Spacer(minLength: SL.Space.s2)
                Text(place == nil ? "Optional" : "Change")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s1)
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(place.map { "Place: \($0.name)" } ?? "Add where you trained")
        .accessibilityHint("Friends see the place on this workout. Optional.")
        .sheet(isPresented: $picking) {
            WorkoutPlaceSheet(
                current: place,
                onPick: { picked in
                    place = picked
                    if picked?.kind == .gym { WorkoutPlace.lastGym = picked }
                    picking = false
                },
                onClose: { picking = false }
            )
        }
    }
}

/// The post's place, near the top where it is seen: the map once picked,
/// and before that the question with the last gym as one tap.
struct WorkoutPlaceCard: View {
    @Binding var place: WorkoutPlace?
    @State private var picking = false

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack {
                Text("Where did you train?").slLead(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                Spacer()
                if place != nil {
                    Button("Change") { picking = true }
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.action)
                        .frame(minHeight: SL.Space.hitMin)
                    Button { place = nil } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(width: 30, height: 30)
                            .background(Circle().fill(SL.Surface.raised2))
                            .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove the place")
                }
            }
            if let place {
                PostPlaceView(place: place)
            } else {
                HStack(spacing: SL.Space.s2) {
                    if let last = WorkoutPlace.lastGym {
                        chip(last.name, symbol: "dumbbell.fill", lit: true) { place = last }
                    }
                    chip(WorkoutPlace.lastGym == nil ? "Add your gym" : "Somewhere else", symbol: "magnifyingglass", lit: WorkoutPlace.lastGym == nil) {
                        picking = true
                    }
                }
                Text("Optional. Friends see it on the post.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
            }
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .slListCard()
        .sheet(isPresented: $picking) {
            WorkoutPlaceSheet(
                current: place,
                onPick: { picked in
                    place = picked
                    if picked?.kind == .gym { WorkoutPlace.lastGym = picked }
                    picking = false
                },
                onClose: { picking = false }
            )
        }
    }

    private func chip(_ title: String, symbol: String, lit: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 13, weight: .semibold))
                Text(title).lineLimit(1)
            }
            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
            .foregroundStyle(lit ? SL.Signal.onAction : SL.Ink.primary)
            .padding(.horizontal, SL.Space.s3)
            .frame(minHeight: 40)
            .background(Capsule().fill(lit ? SL.Signal.action : SL.Surface.raised2))
            .overlay(Capsule().strokeBorder(lit ? Color.clear : SL.Surface.hairlineStrong, lineWidth: 1))
            .contentShape(Capsule())
        }
        .buttonStyle(SLPressStyle(scale: 0.95))
    }
}

/// The choices, privacy first: no place, the gym from last time, gyms near
/// you (location read once, on request), home, or outdoors (shown as an
/// area of about a kilometre).
struct WorkoutPlaceSheet: View {
    let current: WorkoutPlace?
    let onPick: (WorkoutPlace?) -> Void
    let onClose: () -> Void

    @State private var gyms = NearbyGyms()
    @State private var search = PlaceSearch()
    @State private var query = ""
    @FocusState private var searching: Bool

    var body: some View {
        SLSheet(title: "Where did you train?", subtitle: "Friends see it on this workout", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                searchField
                if query.trimmingCharacters(in: .whitespaces).count >= 2 {
                    searchResults
                } else {
                    choices
                }
            }
        }
    }

    /// Typing a name is the fastest way to any gym, near or not.
    private var searchField: some View {
        HStack(spacing: SL.Space.s2) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(SL.Ink.secondary)
            TextField("", text: $query, prompt: Text("Search a gym or address").foregroundColor(SL.Ink.tertiary))
                .font(.sl(SL.TypeSize.body, SL.Weight.regular))
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .focused($searching)
                .submitLabel(.search)
                .autocorrectionDisabled()
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(SL.Ink.tertiary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, SL.Space.s4)
        .frame(minHeight: 48)
        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised))
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
            .strokeBorder(searching ? SL.Signal.action.opacity(0.5) : SL.Surface.hairlineStrong, lineWidth: 1))
        .onChange(of: query) { _, text in search.update(text, near: gyms.here) }
    }

    /// Apple Maps' matches, and always the way to use the typed name as it is.
    private var searchResults: some View {
        let typed = query.trimmingCharacters(in: .whitespaces)
        return group {
            ForEach(search.suggestions, id: \.self) { suggestion in
                option(suggestion.title, symbol: "mappin.circle.fill",
                       detail: suggestion.subtitle.isEmpty ? nil : suggestion.subtitle, isOn: current?.name == suggestion.title) {
                    Task {
                        if let place = await search.place(for: suggestion) { onPick(place) }
                    }
                }
            }
            option("Use “\(typed)”", symbol: "plus.circle.fill",
                   detail: "Your own name, without a map", isOn: false) {
                onPick(WorkoutPlace(kind: .gym, name: typed, latitude: nil, longitude: nil))
            }
        }
    }

    @ViewBuilder
    private var choices: some View {
                group {
                    option("Don't show a place", symbol: "eye.slash", detail: nil, isOn: current == nil) { onPick(nil) }
                    if let last = WorkoutPlace.lastGym {
                        option(last.name, symbol: WorkoutPlace.Kind.gym.symbol, detail: "Your last gym", isOn: current == last) { onPick(last) }
                    }
                    option(WorkoutPlace.Kind.home.label, symbol: WorkoutPlace.Kind.home.symbol,
                           detail: "No map — your home stays private", isOn: current?.kind == .home) {
                        onPick(WorkoutPlace(kind: .home, name: WorkoutPlace.Kind.home.label, latitude: nil, longitude: nil))
                    }
                }

                nearby
    }

    @ViewBuilder
    private var nearby: some View {
        switch gyms.state {
        case .idle:
            Button {
                Task { await gyms.search() }
            } label: {
                HStack(spacing: SL.Space.s2) {
                    Image(systemName: "location.fill").font(.system(size: 14, weight: .semibold))
                    Text("Find gyms near me")
                }
            }
            .buttonStyle(SLOutlineButtonStyle())
            Text("Your location is read once, to find gyms. It isn't saved or shared.")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, SL.Space.s1)
        case .searching:
            HStack(spacing: SL.Space.s2) {
                ProgressView().tint(SL.Ink.secondary)
                Text("Looking for gyms nearby…").slBody().foregroundStyle(SL.Ink.secondary)
            }
            .padding(.horizontal, SL.Space.s1)
        case .denied:
            Text("Location is off for Setline. Turn it on in Settings › Setline › Location to find gyms, or pick Home.")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, SL.Space.s1)
        case .failed:
            Text("Couldn't find your location just now.")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .padding(.horizontal, SL.Space.s1)
        case .found(let found):
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                Text("Nearby")
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.horizontal, SL.Space.s1)
                group {
                    if found.isEmpty {
                        Text("No gyms found within 10 km. Search by name above.")
                            .slBody()
                            .foregroundStyle(SL.Ink.secondary)
                            .padding(SL.Space.s4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(found, id: \.self) { gym in
                        option(gym.name, symbol: WorkoutPlace.Kind.gym.symbol, detail: gyms.distances[gym].map(Self.distance), isOn: current == gym) { onPick(gym) }
                    }
                    if let here = gyms.here {
                        option(WorkoutPlace.Kind.outdoors.label, symbol: WorkoutPlace.Kind.outdoors.symbol,
                               detail: "Shown as an area, not a point", isOn: current?.kind == .outdoors) {
                            onPick(WorkoutPlace(kind: .outdoors, name: WorkoutPlace.Kind.outdoors.label,
                                                latitude: here.latitude, longitude: here.longitude))
                        }
                    }
                }
            }
        }
    }

    /// "350 m", "1.2 km".
    private static func distance(_ meters: CLLocationDistance) -> String {
        meters < 1_000
            ? "\(Int((meters / 10).rounded()) * 10) m away"
            : String(format: "%.1f km away", meters / 1_000)
    }

    private func group<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0) { content() }
            .slBorderBox()
            .slListCard(raised: true)
    }

    private func option(_ title: String, symbol: String, detail: String?, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: symbol)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(isOn ? SL.Signal.action : SL.Ink.secondary)
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(isOn ? SL.Signal.actionTint : SL.Surface.raised))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if let detail {
                        Text(detail).slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                }
                Spacer(minLength: SL.Space.s2)
                if isOn {
                    SLGlyph(name: .check, size: 16).foregroundStyle(SL.Signal.action)
                }
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s2)
            .frame(minHeight: 56)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }
}

// MARK: - In the feed

/// A post's place: a real map with the gym pinned, an area for outdoors, and
/// for a home workout only a label — never a map.
struct PostPlaceView: View {
    let place: WorkoutPlace

    var body: some View {
        if place.hasMap, let latitude = place.latitude, let longitude = place.longitude {
            let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
            Button { openInMaps(coordinate) } label: {
                Map(initialPosition: .region(MKCoordinateRegion(
                    center: coordinate,
                    latitudinalMeters: place.kind == .outdoors ? 2_400 : 550,
                    longitudinalMeters: place.kind == .outdoors ? 2_400 : 550
                )), interactionModes: []) {
                    if place.kind == .outdoors {
                        MapCircle(center: coordinate, radius: 600)
                            .foregroundStyle(SL.Signal.action.opacity(0.18))
                            .stroke(SL.Signal.action, lineWidth: 1.5)
                    } else {
                        Annotation(place.name, coordinate: coordinate, anchor: .bottom) {
                            pin
                        }
                        .annotationTitles(.hidden)
                    }
                }
                .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll))
                .environment(\.colorScheme, .dark)
                .allowsHitTesting(false)
                .frame(height: 150)
                // Top, so Apple's Maps mark and Legal link at the bottom stay visible.
                .overlay(alignment: .topLeading) { label.padding(SL.Space.s2) }
                .clipShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .strokeBorder(SL.Surface.hairline, lineWidth: 1)
                )
                .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Trained at \(place.name)")
            .accessibilityHint("Opens the place in Maps")
        } else {
            label
                .accessibilityElement(children: .combine)
        }
    }

    /// The lime map pin, with the day's dumbbell in it.
    private var pin: some View {
        VStack(spacing: -3) {
            Image(systemName: "dumbbell.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(SL.Signal.onAction)
                .frame(width: 32, height: 32)
                .background(Circle().fill(SL.Signal.action))
                .overlay(Circle().strokeBorder(SL.Surface.ground, lineWidth: 2.5))
            Image(systemName: "triangle.fill")
                .font(.system(size: 9))
                .rotationEffect(.degrees(180))
                .foregroundStyle(SL.Signal.action)
        }
        .shadow(color: .black.opacity(0.4), radius: 4, y: 2)
    }

    private var label: some View {
        HStack(spacing: 6) {
            Image(systemName: place.kind.symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(place.kind == .home ? SL.Signal.recovery : SL.Signal.action)
            Text(place.name)
                .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .lineLimit(1)
        }
        .padding(.horizontal, SL.Space.s3)
        .padding(.vertical, 6)
        .background(Capsule().fill(SL.Surface.ground.opacity(place.hasMap ? 0.82 : 1)))
        .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
    }

    private func openInMaps(_ coordinate: CLLocationCoordinate2D) {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = place.name
        item.openInMaps()
    }
}
