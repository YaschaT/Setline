import PhotosUI
import SwiftUI
import SetlineCore

/// Artboard 22 · Foto's.
///
/// Two pictures the same size, far enough apart in time to show something, and
/// the number between them. The photos never leave the phone, which the screen
/// says out loud rather than implying.
struct PhotosHomeView: View {
    @Environment(AppState.self) private var app

    @State private var checkIns: [CheckIn] = []
    @State private var picking: PhotosPickerItem?
    @State private var removing: CheckIn?
    @State private var failure: String?
    @State private var loaded = false
    @Environment(\.dynamicTypeSize) private var typeSize

    private let store = CheckInStore()

    private var gallery: CheckInGallery {
        CheckInGallery.make(checkIns, metrics: LegacyAdapter.metrics(from: app.state ?? LegacyState(raw: [:])))
    }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    if gallery.all.isEmpty {
                        empty
                    } else {
                        pair
                        if let weeks = gallery.weeks, let change = gallery.change {
                            difference(weeks: weeks, change: change).padding(.top, SL.Space.s4)
                        }
                        strip.padding(.top, SL.Space.s5)
                    }

                    Text("Foto's blijven op dit toestel. Nooit gedeeld, nooit geanalyseerd.")
                        .slMeta()
                        .lineSpacing(SL.TypeSize.meta * 0.5)
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, SL.Space.s5)

                    if let failure {
                        Text(failure)
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .padding(.top, SL.Space.s3)
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s6)
                .padding(.bottom, SL.Space.s6)
            }
        }
        .safeAreaInset(edge: .bottom) {
            PhotosPicker(selection: $picking, matching: .images, photoLibrary: .shared()) {
                Text("Check-in toevoegen")
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.bottom, SL.Space.s3)
            .frame(maxWidth: .infinity)
            .background(SL.Surface.ground)
        }
        .task {
            guard !loaded else { return }
            checkIns = await store.load()
            loaded = true
        }
        .onChange(of: picking) { _, item in
            guard let item else { return }
            Task { await add(item) }
        }
        .confirmationDialog(
            "Check-in verwijderen?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible
        ) {
            Button("Verwijder", role: .destructive) {
                if let checkIn = removing { Task { await remove(checkIn) } }
                removing = nil
            }
            Button("Annuleer", role: .cancel) { removing = nil }
        } message: {
            Text("De foto wordt van dit toestel verwijderd.")
        }
        .slRespondsToTextSize()
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Foto's").slTitle().foregroundStyle(SL.Ink.primary)
            Spacer()
            Text(count).slMeta().slNumerals().foregroundStyle(SL.Ink.tertiary)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
    }

    private var count: String {
        gallery.all.count == 1 ? "1 check-in" : "\(gallery.all.count) check-ins"
    }

    // MARK: - The two pictures

    @ViewBuilder
    private var pair: some View {
        HStack(alignment: .top, spacing: SL.Space.s2) {
            if let first = gallery.first {
                slot(first, loud: gallery.latest?.checkIn.id == first.checkIn.id)
            }
            if let latest = gallery.latest, latest.checkIn.id != gallery.first?.checkIn.id {
                slot(latest, loud: true)
            } else {
                // The first check-in keeps the shape of the pair it will be
                // half of, rather than sprawling across the row on its own.
                Color.clear.frame(maxWidth: .infinity)
            }
        }
    }

    private func slot(_ shown: CheckInGallery.Shown, loud: Bool) -> some View {
        VStack(spacing: 0) {
            picture(shown.checkIn)
                .frame(height: 234)
                .frame(maxWidth: .infinity)
                .clipShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .strokeBorder(loud ? SL.Surface.hairlineStrong : SL.Surface.hairline, lineWidth: 1)
                )

            // Side by side until the pair stops lining up, then the date sits
            // above the weight and both columns keep the same shape.
            captionLayout {
                Text(label(shown.date)).slMeta().foregroundStyle(SL.Ink.tertiary)
                if !typeSize.isAccessibilitySize { Spacer() }
                if let weight = shown.weightKg {
                    Text(app.display.kg(weight)).slMeta(SL.Weight.semibold).slNumerals().foregroundStyle(SL.Ink.primary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 10)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "Check-in \(label(shown.date))"
                + (shown.weightKg.map { ", \(app.display.kg($0))" } ?? "")
        )
        .accessibilityActions { Button("Verwijderen") { removing = shown.checkIn } }
        .onLongPressGesture { removing = shown.checkIn }
    }

    /// A rectangle takes the size it is offered and nothing more; the picture
    /// fills it from the inside. Letting the image itself size the view lets a
    /// 4.000pt-wide photo decide how wide the screen is.
    private var captionLayout: AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline))
    }

    private func picture(_ checkIn: CheckIn) -> some View {
        Rectangle()
            .fill(SL.Surface.raised2)
            .overlay {
                if let image = UIImage(contentsOfFile: store.url(for: checkIn).path) {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                }
            }
            .clipped()
    }

    // MARK: - What changed between them

    private func difference(weeks: Int, change: Decimal) -> some View {
        VStack(spacing: 0) {
            SLHairline()
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                SLEyebrow(text: "\(weeks) WEKEN VERSCHIL")
                Spacer()
                Text("\(app.display.signedDelta(change)) kg")
                    .slDisplay()
                    .slNumerals()
                    // Lime is the artboard's, for a number that moved the way a
                    // bulk is meant to move. Downwards it is stated, not judged.
                    .foregroundStyle(change > 0 ? SL.Signal.action : SL.Ink.primary)
            }
            .padding(.top, 14)
        }
    }

    // MARK: - Every check-in

    private var strip: some View {
        VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(text: "ALLE CHECK-INS")
                .padding(.bottom, SL.Space.s3)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: 6) {
                    ForEach(gallery.all, id: \.checkIn.id) { shown in
                        let latest = shown.checkIn.id == gallery.latest?.checkIn.id
                        VStack(spacing: 6) {
                            picture(shown.checkIn)
                                .frame(width: 64, height: 72)
                                .clipShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                        .strokeBorder(latest ? SL.Surface.hairlineStrong : .clear, lineWidth: 1)
                                )
                            Text(label(shown.date))
                                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                                .foregroundStyle(latest ? SL.Ink.secondary : SL.Ink.tertiary)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Check-in \(label(shown.date))")
                        .accessibilityActions { Button("Verwijderen") { removing = shown.checkIn } }
                        .onLongPressGesture { removing = shown.checkIn }
                    }
                }
                .padding(.vertical, 1)
            }
            .scrollClipDisabled()
        }
    }

    private var empty: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            Text("Nog geen check-ins.")
                .slLead()
                .foregroundStyle(SL.Ink.primary)
            Text("Een foto naast een latere foto laat zien wat de weegschaal niet vertelt.")
                .slBody()
                .lineSpacing(SL.TypeSize.body * 0.5)
                .foregroundStyle(SL.Ink.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func label(_ date: Date) -> String {
        app.display.shortDate(date)
    }

    // MARK: - Adding and removing

    private func add(_ item: PhotosPickerItem) async {
        failure = nil
        picking = nil
        do {
            guard let data = try await item.loadTransferable(type: Data.self) else {
                failure = "Die foto kon niet worden gelezen. Probeer een andere."
                return
            }
            checkIns = try await store.add(data, on: Date())
        } catch {
            failure = "De foto kon niet worden bewaard. Er is mogelijk geen ruimte vrij op je toestel."
        }
    }

    private func remove(_ checkIn: CheckIn) async {
        do {
            checkIns = try await store.remove(checkIn)
        } catch {
            failure = "De check-in kon niet worden verwijderd."
        }
    }
}
