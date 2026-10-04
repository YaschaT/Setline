import Foundation
import ImageIO

/// When a picture was taken, as the camera wrote it into the file.
///
/// A check-in is dated by the day its picture was taken, not the day it was
/// added: a photo from July picked out of the library today is a July
/// check-in, beside July's weigh-in. The camera's own record is read —
/// `DateTimeOriginal`, else the moment it was digitised; never the file's
/// `DateTime`, which an edit moves — as the wall-clock time it states, which
/// is the day the person lived it.
public enum PhotoDate {

    /// `nil` when the picture carries no date, or a date after today: a camera
    /// clock that is wrong is not a check-in from the future.
    public static func taken(in data: Data, calendar: Calendar = .current, now: Date = Date()) -> Date? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
        else { return nil }
        let exif = properties[kCGImagePropertyExifDictionary] as? [CFString: Any]
        guard let stamp = exif?[kCGImagePropertyExifDateTimeOriginal] as? String
            ?? exif?[kCGImagePropertyExifDateTimeDigitized] as? String
        else { return nil }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy:MM:dd HH:mm:ss"
        guard let taken = formatter.date(from: stamp.trimmingCharacters(in: .whitespacesAndNewlines)),
              calendar.startOfDay(for: taken) <= calendar.startOfDay(for: now)
        else { return nil }
        return taken
    }
}
