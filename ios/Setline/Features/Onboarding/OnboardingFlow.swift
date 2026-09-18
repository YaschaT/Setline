import SwiftUI
import SetlineCore

/// What happens between making an account and the first session.
///
/// Artboards 02a, 02b and 03–06, in the order the handoff sets out. A
/// returning account never comes through here: the promise has been read, the
/// questions have been answered, and the week is already waiting.
struct OnboardingFlow: View {
    let onFinish: () -> Void

    @State private var stage: Stage = .howItWorks

    private enum Stage { case howItWorks, intro, intake }

    var body: some View {
        Group {
            switch stage {
            case .howItWorks:
                HowItWorksView(onContinue: { stage = .intro })
            case .intro:
                IntakeIntroView(
                    onBegin: { stage = .intake },
                    onSkip: { onFinish() }
                )
            case .intake:
                IntakeFlow(onFinish: onFinish)
            }
        }
        .animation(.easeOut(duration: SL.Motion.base), value: stage)
    }
}
