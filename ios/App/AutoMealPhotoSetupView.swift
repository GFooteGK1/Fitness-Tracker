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
                    LabeledContent(
                        "App Group access",
                        value: controller.sharedContainerAvailable ? "Available" : "Unavailable"
                    )
                    LabeledContent("Snapshot", value: controller.diagnosticsRead.category)
                    if let diagnostics = controller.diagnostics {
                        runDiagnostics(diagnostics)
                    } else {
                        Text("Run counters and upload state are unknown. No startup evidence recorded in this snapshot.")
                    }

                    Button("Refresh Diagnostics") {
                        controller.refreshDiagnostics()
                    }
                    .frame(minHeight: 44)
                    if let checkedAt = controller.lastCheckedAt {
                        LabeledContent(
                            "Last checked",
                            value: checkedAt.formatted(date: .abbreviated, time: .standard)
                        )
                    }
                    Text("Refresh reads saved diagnostics. It does not start the extension or upload a photo.")
                    LabeledContent("App version", value: appVersion)
                }

                Section("Extension lifecycle observations") {
                    ForEach(ProtocolProbeLifecycleEvent.allCases, id: \.self) { event in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(event.rawValue).font(.headline)
                            let read = controller.lifecycleReads[event] ?? .unavailable
                            if case .valid(let record) = read {
                                Text("\(record.version) (\(record.build)) — \(record.timestamp.formatted(date: .abbreviated, time: .standard))")
                                Text(record.provenance(current: .current, canaryPreparedAt: controller.diagnostics?.canaryPreparedAt))
                            } else {
                                Text(read.category)
                            }
                        }
                    }
                    Text("Each slot is an independent latest observation. Slots may come from different invocations. Device clock changes prevent strict sequence conclusions. Initialization does not prove processing; processing does not prove upload.")
                }

                Section("Fresh canary") {
                    Text(
                        "Capture the displayed evidence first. Prepare Fresh Canary replaces the library baseline and run snapshot, but preserves lifecycle observations. After Ready for capture, leave the app normally and take exactly one new disposable photo."
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
                        "This diagnostic build uploads at most one newly captured photo per extension run to the private probe. It does not analyze nutrition or log meals. Shared diagnostics contain no filename, asset identifier, location, photo bytes, endpoint URL, or nutrition data. Use disposable test photos only."
                    )
                }

                if let errorMessage = controller.errorMessage {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Text("Capture the displayed evidence before either action. Allow Photos and Enable also replaces the baseline and run snapshot. Turning off changes the run phase. Lifecycle observations are preserved.")
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

    private var appVersion: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Unknown"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "Unknown"
        return "\(version) (\(build))"
    }

    @ViewBuilder
    private func runDiagnostics(_ diagnostics: ProtocolProbeDiagnostics) -> some View {
        LabeledContent("Recorded phase", value: diagnostics.phase.displayName)
        LabeledContent("Recorded invocations", value: String(diagnostics.invocationCount))
        Text("A recorded zero is not proof that iOS never executed the extension. Snapshot counters can lose concurrent updates.")
        LabeledContent("Canary prepared", value: diagnostics.canaryPreparedAt?.formatted(date: .abbreviated, time: .standard) ?? "Unknown (legacy or unprepared snapshot)")
        LabeledContent("Snapshot initialization", value: diagnostics.lastInitializationAt?.formatted() ?? "No startup evidence recorded")
        LabeledContent("Baseline token", value: diagnostics.hasBaselineToken ? "Recorded ready" : "Recorded missing")
        // Initial/reset values do not establish a downstream processing observation.
        if diagnostics.insertedPhotoCount > 0 || [.noInsertedPhotos, .resourceUnavailable, .jobRegistered].contains(diagnostics.phase) {
            LabeledContent("Inserted photos seen", value: String(diagnostics.insertedPhotoCount))
        }
        if let available = diagnostics.originalResourceAvailable {
            LabeledContent("Original resource", value: available ? "Found" : "Unavailable")
        }
        if diagnostics.jobRegistered {
            LabeledContent("Upload job registered", value: "Recorded")
        }
        if let state = diagnostics.lastJobState {
            LabeledContent("Last job state", value: state)
        }
        if let requestID = diagnostics.lastRequestID {
            LabeledContent("Probe receipt", value: requestID)
        }
        if let domain = diagnostics.lastErrorDomain, let code = diagnostics.lastErrorCode {
            LabeledContent("Sanitized error", value: "\(domain) (\(code))")
        }
        if let date = diagnostics.lastUpdatedAt {
            LabeledContent("Last update", value: date.formatted(date: .abbreviated, time: .standard))
        }
    }

}

private extension ProtocolProbePhase {
    var displayName: String {
        switch self {
        case .neverInvoked:
            return "No process entry recorded"
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
