import AVFoundation
import AudioToolbox

/// The app's few sounds, each short and quiet, each for a moment that is
/// already marked on screen and in the hand: a set saved, food logged, a
/// record, a workout done.
///
/// They play as ambient audio — the ring/silent switch mutes them and music
/// keeps playing under them — and the Sounds switch in Account turns them
/// off altogether.
@MainActor
enum SLSound: String, CaseIterable {
    /// A set saved: a soft click.
    case tick
    /// Food logged, kudos given: a small rising pop.
    case pop
    /// A record, a goal met, a badge: two bell notes.
    case chime
    /// A workout finished: a short rising arpeggio.
    case success

    static let preferenceKey = "setline.sounds"

    static var isOn: Bool {
        UserDefaults.standard.object(forKey: preferenceKey) as? Bool ?? true
    }

    private static var players: [SLSound: AVAudioPlayer] = [:]
    private static var prepared = false

    func play() {
        guard Self.isOn else { return }
        Self.prepare()
        guard let player = Self.players[self] else { return }
        player.currentTime = 0
        player.play()
    }

    /// The system camera shutter, as every camera on the phone sounds.
    static func shutter() {
        guard isOn else { return }
        AudioServicesPlaySystemSound(1108)
    }

    private static func prepare() {
        guard !prepared else { return }
        prepared = true
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        for sound in allCases {
            guard let url = Bundle.main.url(forResource: sound.rawValue, withExtension: "wav"),
                  let player = try? AVAudioPlayer(contentsOf: url) else { continue }
            player.volume = sound == .tick ? 0.5 : 0.7
            player.prepareToPlay()
            players[sound] = player
        }
    }
}
