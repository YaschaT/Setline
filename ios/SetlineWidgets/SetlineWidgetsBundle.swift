import SwiftUI
import WidgetKit

/// Setline's widget extension. For now it holds one thing: the rest
/// countdown as a Live Activity.
@main
struct SetlineWidgetsBundle: WidgetBundle {
    var body: some Widget {
        RestActivityWidget()
    }
}
