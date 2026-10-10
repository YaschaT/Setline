@preconcurrency import AVFoundation
import CoreMotion
import SwiftUI

/// The check-in camera: the same frame every time, wherever the photo is
/// taken.
///
/// Comparing two photos only works when they were taken alike, so the camera
/// gives three things to line up against:
/// - **Ghost** — the last check-in, faint over the live picture: stand where
///   you stood.
/// - **Guide** — a body outline with head and feet lines and a centre line,
///   for the first photo or a new place.
/// - **Level** — the phone upright and straight; the line turns lime when it
///   is, so the angle is the same at any height or in any room.
///
/// A self-timer lets the phone stand on a shelf. The photo is taken at 3:4,
/// the shape every photo on the Photos tab is shown in, and never leaves the
/// phone.
struct PhotoCaptureView: View {
    /// The latest check-in, to line up against. Nil before the first one.
    let ghost: UIImage?
    let onTaken: (Data) -> Void
    let onClose: () -> Void

    @State private var camera = CheckInCamera()
    @State private var level = PhoneLevel()
    @AppStorage("setline.photos.guide") private var guide: Guide = .ghost
    @AppStorage("setline.photos.timer") private var timer: Int = 0
    @State private var countdown: Int?
    @State private var countdownTask: Task<Void, Never>?
    @State private var taken: Data?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum Guide: String, CaseIterable {
        case ghost, outline, off
        var title: String {
            switch self {
            case .ghost: "Last photo"
            case .outline: "Guide"
            case .off: "Off"
            }
        }
    }

    /// Without a last photo there is nothing to ghost: the outline instead.
    private var shownGuide: Guide { guide == .ghost && ghost == nil ? .outline : guide }

    var body: some View {
        VStack(spacing: SL.Space.s3) {
            topBar
            frame
                .frame(maxHeight: .infinity)
            if taken == nil {
                guidePicker
                controls
            } else {
                review
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s3)
        .background(Color.black.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .task {
            await camera.start()
            level.start()
        }
        .onDisappear {
            countdownTask?.cancel()
            camera.stop()
            level.stop()
        }
        .sensoryFeedback(.success, trigger: level.isLevel) { _, now in now }
    }

    // MARK: - Top

    private var topBar: some View {
        HStack(spacing: SL.Space.s3) {
            roundButton(glyph: .close, label: "Close", action: onClose)
            Spacer(minLength: 0)
            VStack(spacing: 2) {
                Text("Check-in photo")
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                Text(hint)
                    .slMeta()
                    .foregroundStyle(level.isLevel ? SL.Signal.action : SL.Ink.secondary)
                    .contentTransition(.opacity)
                    .animation(.easeOut(duration: SL.Motion.base), value: hint)
            }
            .multilineTextAlignment(.center)
            Spacer(minLength: 0)
            Button { camera.flip() } label: {
                Image(systemName: "arrow.triangle.2.circlepath.camera")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                    .background(Circle().fill(SL.Surface.raised2))
                    .contentShape(Circle())
            }
            .buttonStyle(SLPressStyle(scale: 0.9))
            .disabled(taken != nil || !camera.canFlip)
            .opacity(taken != nil || !camera.canFlip ? 0 : 1)
            .accessibilityLabel(camera.position == .front ? "Use the back camera" : "Use the front camera")
        }
    }

    private var hint: String {
        if taken != nil { return "Same spot, same light next time" }
        guard level.isAvailable else {
            return shownGuide == .ghost ? "Stand where you stood last time" : "Head and feet on the lines"
        }
        if level.isLevel {
            return shownGuide == .ghost ? "Level · line up with last time" : "Level · head and feet on the lines"
        }
        return level.advice
    }

    // MARK: - The frame

    private var frame: some View {
        let shape = RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
        return ZStack {
            if let taken, let image = UIImage(data: taken) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else if camera.state == .running {
                CameraPreview(session: camera.session)
            } else {
                unavailable
            }

            if taken == nil || shownGuide != .off {
                guideLayer
                    .opacity(taken == nil ? 1 : 0.6)
            }
            if taken == nil, level.isAvailable {
                LevelLine(roll: level.roll, isLevel: level.isLevel)
            }
            if let countdown {
                Text("\(countdown)")
                    .font(.sl(96, SL.Weight.bold))
                    .monospacedDigit()
                    .foregroundStyle(SL.Signal.action)
                    .shadow(color: .black.opacity(0.6), radius: 12)
                    .contentTransition(.numericText(countsDown: true))
                    .accessibilityLabel("\(countdown) seconds")
            }
        }
        .aspectRatio(3.0 / 4.0, contentMode: .fit)
        .clipShape(shape)
        .overlay(shape.strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder private var guideLayer: some View {
        switch shownGuide {
        case .ghost:
            if let ghost {
                Image(uiImage: ghost)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .opacity(0.35)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
            BodyGuide(showsFigure: false)
        case .outline:
            BodyGuide(showsFigure: true)
        case .off:
            EmptyView()
        }
    }

    private var unavailable: some View {
        ZStack {
            SL.Surface.raised
            VStack(spacing: SL.Space.s2) {
                Image(systemName: camera.state == .denied ? "camera.badge.ellipsis" : "camera")
                    .font(.system(size: 28))
                    .foregroundStyle(SL.Surface.mute)
                if camera.state == .denied {
                    Text("Setline can't use the camera")
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    Text("Allow it in Settings, or pick a photo from your library.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .multilineTextAlignment(.center)
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    }
                    .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                    .foregroundStyle(SL.Signal.action)
                    .frame(minHeight: SL.Space.hitMin)
                } else if camera.state == .missing {
                    Text("No camera on this device")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            .padding(SL.Space.s5)
        }
    }

    // MARK: - Below the frame

    private var guidePicker: some View {
        HStack(spacing: SL.Space.s1) {
            ForEach(Guide.allCases, id: \.self) { option in
                let disabled = option == .ghost && ghost == nil
                Button {
                    withAnimation(.easeOut(duration: SL.Motion.base)) { guide = option }
                } label: {
                    Text(option.title)
                        .font(.sl(SL.TypeSize.meta, shownGuide == option ? SL.Weight.semibold : SL.Weight.regular))
                        .foregroundStyle(shownGuide == option ? SL.Ink.primary : SL.Ink.secondary)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(
                            Capsule().fill(shownGuide == option ? SL.Surface.raised2 : .clear)
                        )
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(disabled)
                .opacity(disabled ? 0.4 : 1)
                .accessibilityAddTraits(shownGuide == option ? .isSelected : [])
            }
        }
        .padding(SL.Space.s1)
        .background(Capsule().fill(SL.Surface.raised))
        .frame(minHeight: SL.Space.hitMin)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Guide")
    }

    private var controls: some View {
        HStack {
            Button {
                timer = timer == 0 ? 3 : timer == 3 ? 10 : 0
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "timer")
                        .font(.system(size: 16, weight: .semibold))
                    Text(timer == 0 ? "Off" : "\(timer)s")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .monospacedDigit()
                }
                .foregroundStyle(timer == 0 ? SL.Ink.secondary : SL.Signal.action)
                .frame(width: 72, height: SL.Space.hitMin)
                .background(Capsule().fill(SL.Surface.raised2))
                .contentShape(Capsule())
            }
            .buttonStyle(SLPressStyle(scale: 0.92))
            .accessibilityLabel("Self-timer")
            .accessibilityValue(timer == 0 ? "Off" : "\(timer) seconds")

            Spacer(minLength: 0)

            Button(action: shutter) {
                ZStack {
                    Circle().strokeBorder(SL.Ink.primary, lineWidth: 3)
                    Circle()
                        .fill(countdown != nil ? SL.Signal.loss : SL.Signal.action)
                        .padding(7)
                    if countdown != nil {
                        RoundedRectangle(cornerRadius: 4).fill(SL.Ink.primary).frame(width: 20, height: 20)
                    }
                }
                .frame(width: 76, height: 76)
                .contentShape(Circle())
            }
            .buttonStyle(SLPressStyle(scale: 0.9, bounces: true))
            .disabled(camera.state != .running || camera.isCapturing)
            .opacity(camera.state == .running || camera.state == .idle ? 1 : 0.35)
            .sensoryFeedback(.impact(weight: .medium), trigger: camera.isCapturing) { _, now in now }
            .accessibilityLabel(countdown != nil ? "Stop the timer" : "Take photo")

            Spacer(minLength: 0)

            // Balances the timer, so the shutter sits in the middle.
            Color.clear.frame(width: 72, height: SL.Space.hitMin)
        }
        .padding(.top, SL.Space.s1)
    }

    private var review: some View {
        HStack(spacing: SL.Space.s3) {
            Button("Retake") {
                taken = nil
                Task { await camera.start() }
            }
            .buttonStyle(SLOutlineButtonStyle())
            Button("Use photo") {
                if let taken { onTaken(taken) }
            }
            .buttonStyle(SLPrimaryButtonStyle())
        }
        .padding(.top, SL.Space.s2)
    }

    private func roundButton(glyph: SLGlyph.Name, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            SLGlyph(name: glyph, size: 16, fixed: true)
                .foregroundStyle(SL.Ink.primary)
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .background(Circle().fill(SL.Surface.raised2))
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    // MARK: - Taking it

    private func shutter() {
        if countdown != nil {
            countdownTask?.cancel()
            countdown = nil
            return
        }
        guard timer > 0 else { capture(); return }
        countdownTask = Task {
            for left in stride(from: timer, through: 1, by: -1) {
                withAnimation(reduceMotion ? nil : .snappy) { countdown = left }
                try? await Task.sleep(for: .seconds(1))
                if Task.isCancelled { return }
            }
            countdown = nil
            capture()
        }
    }

    private func capture() {
        Task {
            guard let data = await camera.capture() else { return }
            taken = data
            camera.stop()
        }
    }
}

// MARK: - The guide

/// Where the body goes: head and feet lines a set distance from the frame's
/// edges and a line down the middle, so a body fills the frame the same way
/// at any distance. With `showsFigure`, an outline to stand in.
private struct BodyGuide: View {
    let showsFigure: Bool

    /// From the top of the frame: the top of the head, then the feet.
    static let head: CGFloat = 0.07
    static let feet: CGFloat = 0.95

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let line = Color.white.opacity(0.55)
            ZStack(alignment: .topLeading) {
                // Thirds, faint, for the arms and hips.
                Path { p in
                    for i in 1...2 {
                        let x = size.width * CGFloat(i) / 3
                        p.move(to: CGPoint(x: x, y: 0)); p.addLine(to: CGPoint(x: x, y: size.height))
                        let y = size.height * CGFloat(i) / 3
                        p.move(to: CGPoint(x: 0, y: y)); p.addLine(to: CGPoint(x: size.width, y: y))
                    }
                }
                .stroke(Color.white.opacity(0.14), lineWidth: 1)

                // The middle.
                Path { p in
                    p.move(to: CGPoint(x: size.width / 2, y: 0))
                    p.addLine(to: CGPoint(x: size.width / 2, y: size.height))
                }
                .stroke(line.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [4, 6]))

                if showsFigure {
                    MuscleFigure(group: nil, highlight: .clear, outline: Color.white.opacity(0.6), lineWidth: 2.5)
                        .frame(height: size.height * (Self.feet - Self.head))
                        .frame(width: size.width)
                        .offset(y: size.height * Self.head)
                }

                mark("Head", y: size.height * Self.head, width: size.width)
                mark("Feet", y: size.height * Self.feet, width: size.width)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func mark(_ title: String, y: CGFloat, width: CGFloat) -> some View {
        ZStack(alignment: .leading) {
            Path { p in
                p.move(to: CGPoint(x: 0, y: 0)); p.addLine(to: CGPoint(x: width, y: 0))
            }
            .stroke(SL.Signal.action.opacity(0.8), style: StrokeStyle(lineWidth: 1.5, dash: [8, 5]))
            .frame(height: 1)
            Text(title.uppercased())
                .font(.sl(10, SL.Weight.bold))
                .tracking(0.8)
                .foregroundStyle(SL.Signal.onAction)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule().fill(SL.Signal.action.opacity(0.9)))
                .padding(.leading, SL.Space.s2)
        }
        .frame(width: width, height: 18)
        .offset(y: y - 9)
    }
}

/// The horizon: a line through the middle that tips with the phone and turns
/// lime once it is upright and straight.
private struct LevelLine: View {
    let roll: Double
    let isLevel: Bool

    var body: some View {
        HStack(spacing: 0) {
            Capsule().frame(width: 40, height: 2)
            Circle().strokeBorder(lineWidth: 2).frame(width: 14, height: 14).padding(.horizontal, 6)
            Capsule().frame(width: 40, height: 2)
        }
        .foregroundStyle(isLevel ? SL.Signal.action : Color.white.opacity(0.8))
        .shadow(color: .black.opacity(0.5), radius: 3)
        .rotationEffect(.degrees(isLevel ? 0 : -roll))
        .animation(.easeOut(duration: SL.Motion.fast), value: roll)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: - The level

/// How the phone is held, from gravity: tipped sideways (roll) and leaning
/// towards or away from the subject (tilt), both in degrees.
@MainActor @Observable
final class PhoneLevel {
    private(set) var roll: Double = 0
    private(set) var tilt: Double = 0
    private(set) var isAvailable = false
    private let motion = CMMotionManager()

    /// Within 2° both ways counts as level.
    var isLevel: Bool { isAvailable && abs(roll) < 2 && abs(tilt) < 3 }

    var advice: String {
        if abs(tilt) >= 3 { return tilt > 0 ? "Tilt the top of the phone back" : "Tilt the top of the phone forward" }
        if abs(roll) >= 2 { return "Straighten the phone" }
        return "Level"
    }

    func start() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        isAvailable = true
        motion.deviceMotionUpdateInterval = 1.0 / 30
        motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
            guard let self, let g = data?.gravity else { return }
            // Upright in portrait, gravity points straight down the screen
            // (y = -1). Sideways tips it into x; leaning tips it into z.
            roll = atan2(g.x, -g.y) * 180 / .pi
            tilt = atan2(g.z, -g.y) * 180 / .pi
        }
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
    }
}

// MARK: - The camera

/// The capture session, kept off the main thread, taking 3:4 portrait photos.
/// The front camera's photo is kept as the preview showed it, mirrored, so
/// the next ghost lines up with what is on the screen.
@MainActor @Observable
final class CheckInCamera: NSObject {
    enum State { case idle, running, denied, missing }

    private(set) var state: State = .idle
    private(set) var position: AVCaptureDevice.Position = .back
    private(set) var isCapturing = false
    private(set) var canFlip = false

    @ObservationIgnored nonisolated(unsafe) let session = AVCaptureSession()
    @ObservationIgnored private let output = AVCapturePhotoOutput()
    @ObservationIgnored private let queue = DispatchQueue(label: "be.setline.camera")
    @ObservationIgnored private var configured = false
    @ObservationIgnored private var pending: CheckedContinuation<Data?, Never>?

    func start() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: break
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else { state = .denied; return }
        default:
            state = .denied
            return
        }
        canFlip = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front) != nil
            && AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil
        if !configured {
            guard configure(position) else { state = .missing; return }
            configured = true
        }
        let session = session
        await withCheckedContinuation { done in
            queue.async {
                if !session.isRunning { session.startRunning() }
                done.resume()
            }
        }
        state = .running
    }

    func stop() {
        let session = session
        queue.async { if session.isRunning { session.stopRunning() } }
    }

    func flip() {
        let next: AVCaptureDevice.Position = position == .back ? .front : .back
        if configure(next) { position = next }
    }

    @discardableResult
    private func configure(_ position: AVCaptureDevice.Position) -> Bool {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: device) else { return false }
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        session.sessionPreset = .photo
        session.inputs.forEach { session.removeInput($0) }
        guard session.canAddInput(input) else { return false }
        session.addInput(input)
        if !session.outputs.contains(output), session.canAddOutput(output) {
            session.addOutput(output)
        }
        if let connection = output.connection(with: .video) {
            if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
            if connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = position == .front
            }
        }
        return true
    }

    func capture() async -> Data? {
        guard state == .running, !isCapturing else { return nil }
        isCapturing = true
        defer { isCapturing = false }
        let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
        return await withCheckedContinuation { continuation in
            pending = continuation
            output.capturePhoto(with: settings, delegate: self)
        }
    }
}

extension CheckInCamera: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let data = error == nil ? photo.fileDataRepresentation() : nil
        Task { @MainActor in
            pending?.resume(returning: data)
            pending = nil
        }
    }
}

/// The live picture, filling its 3:4 frame.
private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.preview.session = session
        view.preview.videoGravity = .resizeAspectFill
        view.backgroundColor = .black
        return view
    }

    func updateUIView(_ view: PreviewView, context: Context) {
        if let connection = view.preview.connection, connection.isVideoRotationAngleSupported(90) {
            connection.videoRotationAngle = 90
        }
    }
}
