import Foundation

/// Whether the set sheet asks for reps in reserve on every set, or — the
/// default, addendum 11R — only on an exercise's last prescribed set.
///
/// How the app asks, not what the account holds, so it stays on the device.
enum RIRPreference {
    private static let key = "setline.rir.everySet"

    static var everySet: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}
