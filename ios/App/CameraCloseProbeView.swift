import SwiftUI
import Photos

struct CameraCloseProbeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var read: CameraCloseProbeRead = .missing
    @State private var authorized = false
    @State private var requesting = false
    @State private var tracking: NewPhotoTrackingLedger?
    @State private var trackingMessage: String?
    @State private var enrolling = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Camera-close test") {
                    Text("This checks whether a Shortcut can run this app's action and read a local photo while the phone is locked.")
                    LabeledContent("Full Photos access", value: authorized ? "Yes" : "Required")
                    if !authorized {
                        Button("Allow Photos for Shortcut Test") {
                            requesting = true
                            Task {
                                _ = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
                                requesting = false
                                refresh()
                            }
                        }
                        .frame(minHeight: 44)
                        .disabled(requesting)
                    }
                }
                Section("New photo tracking") {
                    if let tracking {
                        LabeledContent("Tracking since", value: tracking.enrolledAt.formatted())
                        LabeledContent("Photos tracked", value: String(tracking.stillPhotoCount))
                        LabeledContent("New photos in last scan", value: String(tracking.lastNewPhotoCount))
                        LabeledContent("Unresolved assets", value: String(tracking.unresolvedIdentifiers.count))
                        LabeledContent("Assets retained", value: "\(tracking.assets.count) / \(NewPhotoTrackingLedger.maximumAssets)")
                        LabeledContent("Last scan", value: tracking.lastDiscoveryAt?.formatted() ?? "Not scanned")
                    } else if trackingMessage == nil {
                        Text("Start tracking before taking new test photos. Existing photos are not scanned.")
                        Button("Start New Photo Tracking") {
                            enrolling = true
                            Task {
                                do { try await NewPhotoTrackingRuntime.enroll(); refresh() }
                                catch { trackingMessage = "Could not start tracking. Saved state is preserved." }
                                enrolling = false
                            }
                        }
                        .frame(minHeight: 44)
                        .disabled(!authorized || enrolling)
                    }
                    if let trackingMessage { Text(trackingMessage).foregroundStyle(.red) }
                    Text("For this test, use Discover New Photos in your Camera-close automation. Its text result reports new still photos and unresolved assets. Imports also count; videos do not count as photos. Nothing is uploaded or analyzed.")
                }
                Section("Latest thumbnail check") {
                    switch read {
                    case .valid(let record):
                        LabeledContent("Result", value: record.phase.description)
                        LabeledContent("Run", value: record.runID.uuidString)
                        LabeledContent("Build", value: "\(record.version) (\(record.build))")
                        LabeledContent("Entered", value: record.enteredAt.formatted())
                        LabeledContent("Thumbnail read", value: record.photoReadAt?.formatted() ?? "Not recorded")
                        LabeledContent("Completed", value: record.completedAt?.formatted() ?? "Not recorded")
                    case .missing: Text("No action evidence recorded.")
                    case .invalid: Text("Saved evidence is invalid. It has been preserved.")
                    case .unavailable: Text("Saved evidence is unavailable. This does not prove the action never ran.")
                    }
                    Button("Refresh Shortcut Diagnostics", action: refresh).frame(minHeight: 44)
                }
                Section("Thumbnail test setup") {
                    Text("In Shortcuts, use Camera → Is Closed → Run Immediately. Add Check Camera Photo Access from SociusFit Auto Meals. Its text result can feed Show Notification during the test.")
                    Text("Use one disposable still photo. Compare the run and timestamps after leaving Camera unlocked, then after taking a photo from Lock Screen without unlocking.")
                }
                Section("Scope") {
                    Text("Check Camera Photo Access reads a small thumbnail of the most recent still photo. It does not prove which photo you just took. Discover New Photos tracks additions after enrollment and reads asset metadata only. Neither action classifies food, uploads images, or creates meals. A thumbnail read does not prove full-resolution access.")
                    Text("The Shortcut test does not enable the PhotoKit background extension. Its separate diagnostic tab can retain an enabled extension; disable that through its existing control before a local-only test.")
                }
            }
            .navigationTitle("Camera Shortcut Probe")
            .onAppear(perform: refresh)
            .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
        }
    }

    private func refresh() {
        authorized = PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized
        read = CameraCloseProbeRuntime.store.read()
        do { tracking = try NewPhotoTrackingRuntime.store.load(); trackingMessage = nil }
        catch { tracking = nil; trackingMessage = "Tracking state is unavailable or invalid. It has not been reset." }
    }
}
