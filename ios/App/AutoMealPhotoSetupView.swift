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
                        "This harness does not inspect or upload photos yet. The finished feature will classify on-device and upload only high-confidence food candidates."
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
