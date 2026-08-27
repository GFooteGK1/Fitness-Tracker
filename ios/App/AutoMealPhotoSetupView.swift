import SwiftUI

struct AutoMealPhotoSetupView: View {
    @Environment(\.scenePhase) private var scenePhase
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

                Section("Probe diagnostics") {
                    LabeledContent("Phase", value: controller.diagnostics.phase.displayName)
                    LabeledContent(
                        "Extension invocations",
                        value: String(controller.diagnostics.invocationCount)
                    )
                    LabeledContent(
                        "Baseline token",
                        value: controller.diagnostics.hasBaselineToken ? "Ready" : "Missing"
                    )
                    LabeledContent(
                        "Inserted photos seen",
                        value: String(controller.diagnostics.insertedPhotoCount)
                    )
                    LabeledContent(
                        "Original resource",
                        value: resourceDescription
                    )
                    LabeledContent(
                        "Upload job registered",
                        value: controller.diagnostics.jobRegistered ? "Yes" : "No"
                    )

                    if let state = controller.diagnostics.lastJobState {
                        LabeledContent("Last job state", value: state)
                    }
                    if let requestID = controller.diagnostics.lastRequestID {
                        LabeledContent("Probe receipt", value: requestID)
                    }
                    if let errorDescription {
                        LabeledContent("Sanitized error", value: errorDescription)
                    }
                    if let updatedAt = controller.diagnostics.lastUpdatedAt {
                        LabeledContent("Last update", value: updatedAt.formatted())
                    }

                    Button("Refresh Diagnostics") {
                        controller.refreshDiagnostics()
                    }
                    .frame(minHeight: 44)
                }

                Section("Fresh canary") {
                    Text(
                        "Prepare first. The app records the current library position, then enables the extension. After the status says Ready for capture, close the app and take exactly one new disposable photo."
                    )

                    Button {
                        Task {
                            await controller.prepareFreshCanary()
                        }
                    } label: {
                        if controller.isPreparingCanary {
                            ProgressView()
                        } else {
                            Text("Prepare Fresh Canary")
                        }
                    }
                    .frame(minHeight: 44)
                    .disabled(!controller.canPrepareFreshCanary)
                }

                Section("Privacy") {
                    Text(
                        "This diagnostic build uploads at most one newly captured photo per extension run to the private probe. Shared diagnostics contain no filename, asset identifier, location, photo bytes, endpoint URL, or nutrition data. Use disposable test photos only."
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
                        .frame(minHeight: 44)
                    } else {
                        Button("Allow Photos and Enable") {
                            Task {
                                await controller.requestAccessAndEnable()
                            }
                        }
                        .frame(minHeight: 44)
                    }
                }
            }
            .navigationTitle("SociusFit")
            .onAppear {
                controller.refreshDiagnostics()
            }
            .onChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    controller.refreshDiagnostics()
                }
            }
        }
    }

    private var resourceDescription: String {
        switch controller.diagnostics.originalResourceAvailable {
        case true:
            return "Found"
        case false:
            return "Unavailable"
        case nil:
            return "Not checked"
        }
    }

    private var errorDescription: String? {
        guard let domain = controller.diagnostics.lastErrorDomain,
              let code = controller.diagnostics.lastErrorCode else {
            return nil
        }
        return "\(domain) (\(code))"
    }
}

private extension ProtocolProbePhase {
    var displayName: String {
        switch self {
        case .neverInvoked:
            return "Never invoked"
        case .readyForCapture:
            return "Ready for capture"
        case .extensionInvoked:
            return "Extension invoked"
        case .baselineEstablished:
            return "Baseline established"
        case .noInsertedPhotos:
            return "No new photos"
        case .resourceUnavailable:
            return "Original unavailable"
        case .jobRegistered:
            return "Upload job registered"
        case .jobResultObserved:
            return "Job result observed"
        case .tokenExpired:
            return "Baseline expired"
        case .jobLimitReached:
            return "Upload limit reached"
        case .terminationRequested:
            return "Termination requested"
        case .disabled:
            return "Disabled"
        case .configurationError:
            return "Configuration error"
        case .failed:
            return "Failed"
        }
    }
}
