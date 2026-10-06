import SwiftUI

/// A drag that is only ever sideways: a UIKit pan that starts when the finger
/// sets off sideways — by half as much again as up or down. A pull that sets
/// off up or down never becomes it, and the page's own scrolling waits for
/// that answer, so a screen scrolls wherever the finger lands and a sideways
/// drag moves only what it is on. SwiftUI's drag, even beside a scroll view's,
/// held the page still whenever a pull started on it.
///
/// Training's day card swipes with it; Foto's before-and-after slider slides.
struct SidewaysDrag: UIGestureRecognizerRepresentable {
    let onChanged: (CGFloat) -> Void
    let onEnded: (CGFloat) -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ pan: UIPanGestureRecognizer, context: Context) {
        let dx = pan.translation(in: pan.view).x
        switch pan.state {
        case .began, .changed: onChanged(dx)
        case .ended: onEnded(dx)
        case .cancelled, .failed: onEnded(0)
        default: break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return true }
            let move = pan.translation(in: pan.view)
            return abs(move.x) > abs(move.y) * 1.5
        }

        /// The page scrolls once the drag has said no.
        func gestureRecognizer(
            _ recognizer: UIGestureRecognizer,
            shouldBeRequiredToFailBy other: UIGestureRecognizer
        ) -> Bool {
            guard let page = other.view as? UIScrollView else { return false }
            return other === page.panGestureRecognizer
        }
    }
}
