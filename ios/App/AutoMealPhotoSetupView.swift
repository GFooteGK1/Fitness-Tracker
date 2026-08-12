import SwiftUI

struct AutoMealPhotoSetupView: View {
    @StateObject private var controller = PhotoLibraryAuthorizationController()

    var body: some View {
        NavigationStack {
            Form {
                Section("Automatic meal photos") {
                    Text(controller.statusDescription)
                    LabeledContent(
                        "Background extension",
                        value: controller.extensionEnabled ? "Enabled" : "Off"
                    )
                }

                Section("Privacy") {
                    Text(
                        "This probe stays disabled until a private HTTPS test endpoint is configured. It baselines the library first, then uploads at most one newly captured photo per extension run. Use disposable test photos only."
                    )
                }

                if let errorMessage = controller.errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    if controller.extensionEnabled {
                        Button("Turn Off Automatic Meal Photos", role: .destructive) {
                            controller.disable()
                        }
                    } else {
                        Button("Allow Photos and Enable") {
                            Task {
                                await controller.requestAccessAndEnable()
                            }
                        }
                    }
                }
            }
            .navigationTitle("SociusFit")
        }
    }
}
