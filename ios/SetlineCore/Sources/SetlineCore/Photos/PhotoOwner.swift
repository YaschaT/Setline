import CryptoKit
import Foundation

/// Whose progress photos these are, on this device.
///
/// Photos never leave the phone, and on the phone every account keeps them in
/// a folder of its own, named after its user id — the id Supabase gave the
/// account, which never changes, where an address can. An account that signs
/// in after another on the same phone sees only its own photos. A demo account
/// has a folder apart from every real account's.
public struct PhotoOwner: Hashable, Sendable {
    public enum Kind: String, Sendable {
        case account
        case demo
    }

    public let kind: Kind
    public let id: String

    public init(kind: Kind, id: String) {
        self.kind = kind
        self.id = id
    }

    public static func account(_ userID: String) -> PhotoOwner {
        PhotoOwner(kind: .account, id: userID)
    }

    public static func demo(_ id: String) -> PhotoOwner {
        PhotoOwner(kind: .demo, id: id)
    }

    /// The owner's folder, relative to where the photos are kept:
    /// `accounts/<user id>`, or `demo/<id>`.
    public var folder: String {
        "\(kind == .account ? "accounts" : "demo")/\(Self.pathSafe(id))"
    }

    /// A user id is a UUID. Anything that is not a plain identifier is named
    /// by its digest instead, so no id can point outside its own folder.
    static func pathSafe(_ id: String) -> String {
        let plain = id.unicodeScalars.allSatisfy { scalar in
            scalar.isASCII && (CharacterSet.alphanumerics.contains(scalar) || scalar == "-")
        }
        if !id.isEmpty, plain { return id }
        return "h-" + SHA256.hash(data: Data(id.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

extension PhotoOwner {

    /// Whether the photos the app kept before photos had owners can be given
    /// to this account.
    ///
    /// They were taken by whoever used the phone, and the phone never noted
    /// who. So only a real account takes them, and only while it is the one
    /// real account this phone keeps training data for. Otherwise nobody
    /// does, and they stay where they are, untouched. Demo accounts do not
    /// count: their rows can outlive the debug build that wrote them.
    ///
    /// `accountsOnDevice` are the addresses the device's local store is kept
    /// under — the only record of who has used this phone. The photos
    /// themselves are filed by user id, never by address.
    public func mayAdoptUnownedPhotos(email: String, accountsOnDevice: [String]) -> Bool {
        guard kind == .account else { return false }
        let own = email.lowercased()
        return accountsOnDevice.allSatisfy { other in
            let address = other.lowercased()
            return address == own || Self.isDemoAddress(address)
        }
    }

    /// `demo@setline.be`, and the further demo accounts `demo-<name>@setline.be`.
    public static func isDemoAddress(_ email: String) -> Bool {
        let address = email.lowercased()
        return address == "demo@setline.be" || (address.hasPrefix("demo-") && address.hasSuffix("@setline.be"))
    }
}
