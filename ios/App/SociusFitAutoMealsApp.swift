import SwiftUI

@main
struct SociusFitAutoMealsApp: App {
    var body: some Scene {
        WindowGroup {
            TabView {
                CameraCloseProbeView()
                    .tabItem { Label("Camera Shortcut", systemImage: "camera") }
                AutoMealPhotoSetupView()
                    .tabItem { Label("PhotoKit Probe", systemImage: "wrench.and.screwdriver") }
            }
        }
    }
}
