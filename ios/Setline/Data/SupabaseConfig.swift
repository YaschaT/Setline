import Foundation

/// Supabase project configuration, read at runtime.
///
/// Both values are public by design and are already inlined into the web
/// bundle, but they stay out of source here so a fork does not inherit
/// someone else's project. They come from Setline.xcconfig via Info.plist.
///
/// When either is missing the app says accounts are not connected and names
/// the two keys, rather than offering a form that cannot work — the same
/// honest degradation the web login screen does.
struct SupabaseConfig: Sendable {
    let url: URL
    let anonKey: String

    static func fromBundle(_ bundle: Bundle = .main) -> SupabaseConfig? {
        guard
            let urlString = bundle.object(forInfoDictionaryKey: "SUPABASE_URL") as? String,
            let key = bundle.object(forInfoDictionaryKey: "SUPABASE_ANON_KEY") as? String,
            !urlString.isEmpty, !key.isEmpty,
            !urlString.hasPrefix("$("),
            let url = URL(string: urlString.hasPrefix("http") ? urlString : "https://\(urlString)")
        else { return nil }
        return SupabaseConfig(url: url, anonKey: key)
    }
}
