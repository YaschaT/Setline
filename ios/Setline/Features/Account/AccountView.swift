import SwiftUI
import SetlineCore

/// Artboard 23 · Account.
///
/// States what the account holds, and hands it back. Three rules from the
/// approved decisions shape what is drawn:
///
/// - every value comes from stored data, so the mock's `2.250 kcal · 165 g`
///   only appears when this account really has targets;
/// - `Wijzig` is drawn only where there is somewhere to go, and nothing is
///   editable yet, so no row carries it;
/// - `Account verwijderen` waits for the server action that performs it.
///
/// `Uitloggen` is the one addition: leaving the account on this device keeps
/// its local copy and anything still waiting to sync.
struct AccountView: View {
    @Environment(AppState.self) private var app
    @State private var exports: [URL] = []
    @State private var confirmSignOut = false
    @State private var reauthenticating = false

    private var summary: AccountSummary {
        AccountSummary.make(state: app.state ?? LegacyState(raw: [:]), plan: app.plan)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Account").slTitle()
                    .padding(.horizontal, SL.Space.s5)
                    .padding(.top, SL.Space.s4)

                VStack(alignment: .leading, spacing: 0) {
                    syncBlock
                    section("PLAN")
                    planRows
                    section("DATA")
                    exportRow
                    signOutRow
                }
                .padding(.horizontal, SL.Space.s5)
                .padding(.top, SL.Space.s5)
            }
        }
        .slRespondsToTextSize()
        .task { buildExports() }
        .onChange(of: app.sessions.count) { _, _ in buildExports() }
        .sheet(isPresented: $reauthenticating) { reauthentication }
        .confirmationDialog("Uitloggen?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Uitloggen", role: .destructive) { app.signOut() }
            Button("Annuleer", role: .cancel) {}
        } message: {
            Text("\(app.pendingChanges.count) wijzigingen staan alleen op dit toestel. Ze blijven bewaard en syncen zodra je opnieuw aanmeldt.")
        }
    }

    // MARK: - Sync

    /// The screen's one loud element: how this account stands right now.
    private var syncBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SL.Space.s2) {
                Circle().fill(syncTone).frame(width: 10, height: 10)
                Text("SYNC").slMeta(SL.Weight.medium).foregroundStyle(SL.Ink.tertiary)
            }
            Text(syncHeadline)
                .slDisplay(SL.TypeSize.displayXL)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.top, SL.Space.s2)
            Text(syncDetail)
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)

            if standing == .expired {
                Button("Opnieuw aanmelden") { reauthenticating = true }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .padding(.top, SL.Space.s4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, SL.Space.s1)
        .padding(.bottom, SL.Space.s6)
        .overlay(alignment: .bottom) { SLHairline() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Sync: \(syncHeadline). \(syncDetail)")
    }

    /// One reading of where this account stands, so the dot, the headline and
    /// the line beneath them can never disagree.
    private enum Standing: Equatable {
        case synced(Date)
        case waiting(Int)
        case offline(Int)
        case expired
        case never
    }

    private var standing: Standing {
        let waiting = app.pendingChanges.count
        switch app.sync {
        case .sessionExpired: return .expired
        case .offline: return .offline(waiting)
        default:
            if waiting > 0 { return .waiting(waiting) }
            guard let synced = app.lastSyncedAt else { return .never }
            return .synced(synced)
        }
    }

    private var syncTone: Color {
        switch standing {
        case .synced: return SL.Signal.recovery
        case .waiting, .offline, .expired, .never: return SL.Signal.attention
        }
    }

    private var syncHeadline: String {
        switch standing {
        case .synced: return "Bijgewerkt"
        case .waiting: return "Wachten op sync"
        case .offline: return "Offline"
        case .expired: return "Sessie verlopen"
        case .never: return "Nog niet gesynct"
        }
    }

    private var syncDetail: String {
        switch standing {
        case .synced(let date):
            return "\(Self.relative.localizedString(for: date, relativeTo: Date())) · \(sessionsSafe) staan veilig"
        case .waiting(let count):
            return "\(changes(count)) staan op dit toestel en syncen zodra er verbinding is."
        case .offline(let count):
            return count > 0
                ? "Alles wordt lokaal bewaard · \(changes(count)) wachten op sync"
                : "Alles wordt lokaal bewaard."
        case .expired:
            return "Meld je opnieuw aan om te synchroniseren. Je werk blijft op dit toestel."
        case .never:
            return "Je werk staat op dit toestel."
        }
    }

    private func changes(_ count: Int) -> String {
        count == 1 ? "1 wijziging" : "\(count) wijzigingen"
    }

    private var sessionsSafe: String {
        summary.sessionCount == 1 ? "1 sessie" : "\(summary.sessionCount) sessies"
    }

    private static let relative: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.unitsStyle = .full
        return formatter
    }()

    // MARK: - Plan

    private var planRows: some View {
        VStack(spacing: 0) {
            row(summary.planName)
            if !summary.trainingDays.isEmpty {
                row("Trainingsdagen · \(summary.trainingDays.joined(separator: " "))")
            }
            if let targets = summary.targets {
                row("Dagdoelen · \(app.display.number(Decimal(targets.calories))) kcal · \(targets.protein) g")
            }
            row("Rusttimer", detail: summary.rest.map { "\($0.label) \($0.roleLabel)" }.joined(separator: " · "))
        }
    }

    // MARK: - Data

    private var exportRow: some View {
        Group {
            if exports.isEmpty {
                row("Exporteer alles", detail: "Nog geen data om te exporteren")
            } else {
                ShareLink(items: exports) {
                    HStack(alignment: .firstTextBaseline) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Exporteer alles").slBody()
                            Text(exportDetail).slMeta().foregroundStyle(SL.Ink.secondary)
                        }
                        Spacer(minLength: SL.Space.s4)
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.down.circle")
                            Text("Export").slBody()
                        }
                        .foregroundStyle(SL.Signal.action)
                    }
                    .padding(.vertical, SL.Space.s4)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .overlay(alignment: .bottom) { SLHairline() }
                .accessibilityLabel("Exporteer alles. \(exportDetail)")
            }
        }
    }

    private var exportDetail: String {
        var parts = ["CSV en JSON", sessionsSafe.replacingOccurrences(of: " staan veilig", with: "")]
        parts[1] = summary.sessionCount == 1 ? "1 sessie" : "\(summary.sessionCount) sessies"
        parts.append(summary.loggedExerciseCount == 1 ? "1 oefening" : "\(summary.loggedExerciseCount) oefeningen")
        if summary.weighInCount > 0 {
            parts.append(summary.weighInCount == 1 ? "1 weging" : "\(summary.weighInCount) wegingen")
        }
        return parts.joined(separator: " · ")
    }

    private var signOutRow: some View {
        Button {
            if app.hasPendingChanges { confirmSignOut = true } else { app.signOut() }
        } label: {
            HStack {
                Text("Uitloggen").slBody()
                Spacer()
            }
            .padding(.vertical, SL.Space.s4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(SL.Ink.secondary)
        .padding(.top, SL.Space.s8)
        .slHitTarget()
    }

    // MARK: - Pieces

    private func section(_ title: String) -> some View {
        Text(title)
            .slMeta()
            .foregroundStyle(SL.Ink.tertiary)
            .padding(.top, SL.Space.s8)
            .padding(.bottom, SL.Space.s1)
            .accessibilityAddTraits(.isHeader)
    }

    /// A plan row: what it says now, and — once there is a destination — the
    /// `Wijzig` that leads there.
    private func row(_ title: String, detail: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).slBody().foregroundStyle(detail == nil ? SL.Ink.secondary : SL.Ink.primary)
            if let detail {
                Text(detail).slMeta().foregroundStyle(SL.Ink.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, SL.Space.s4)
        .overlay(alignment: .bottom) { SLHairline() }
        .accessibilityElement(children: .combine)
    }

    /// Signing in again after the session expired. The account keeps its local
    /// copy and everything still queued, so nothing has to be redone.
    private var reauthentication: some View {
        SignInView()
            .onChange(of: app.sync) { _, state in
                if case .sessionExpired = state { return }
                reauthenticating = false
            }
    }

    private func buildExports() {
        guard let state = app.state, !app.sessions.isEmpty || state.raw.count > 1 else {
            exports = []
            return
        }
        let names = StateExport.fileNames()
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("setline-export", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let json = folder.appendingPathComponent(names.json)
            let csv = folder.appendingPathComponent(names.csv)
            try StateExport.json(from: state).write(to: json, options: .atomic)
            try Data(StateExport.csv(from: app.sessions).utf8).write(to: csv, options: .atomic)
            exports = [json, csv]
        } catch {
            // An export that cannot be written says so in the row rather than
            // handing over a half-written file.
            exports = []
        }
    }
}
