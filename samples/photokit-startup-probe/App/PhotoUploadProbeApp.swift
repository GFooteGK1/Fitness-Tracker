import Foundation
import Photos
import SwiftUI

@main
struct PhotoUploadProbeApp: App {
    var body: some Scene { WindowGroup { SetupView() } }
}

@MainActor
struct SetupView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var granted = false
    @State private var enabled = false
    @State private var initialized = 0.0
    @State private var calls = 0
    @State private var checkedAt = Date()
    @State private var problem = ""

    var body: some View {
        NavigationStack {
            Form {
                LabeledContent("Full Photos access", value: granted ? "Yes" : "No")
                LabeledContent("Extension enabled", value: enabled ? "Yes" : "No")
                LabeledContent("App Group", value: ProbeState.defaults() == nil ? "Unavailable" : "Available")
                LabeledContent("Initialized", value: initialized > 0 ? Date(timeIntervalSince1970: initialized).formatted() : "Not recorded")
                LabeledContent("Process calls", value: String(calls))
                LabeledContent("Last checked", value: checkedAt.formatted())
                Button("Allow Photos and Enable") { Task { await enable() } }
                Button("Refresh Diagnostics") { refresh() }
                Button("Disable") {
                    do { try PHPhotoLibrary.shared().setUploadJobExtensionEnabled(false) }
                    catch { problem = String(describing: error) }
                    refresh()
                }
                Text("Refresh reads saved markers; it does not launch the extension.")
                Text("This sample does not read image resources or create upload jobs.")
                if !problem.isEmpty { Text(problem) }
            }
            .navigationTitle("Photo Upload Probe")
            .task { refresh() }
            .onChange(of: scenePhase) { _, phase in if phase == .active { refresh() } }
        }
    }

    private func enable() async {
        problem = ""
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        guard status == .authorized else { refresh(); return }
        guard ProbeState.defaults() != nil else { problem = "Configure both targets' App Group first."; return }
        do {
            try PHPhotoLibrary.shared().setUploadJobExtensionEnabled(false)
            try PHPhotoLibrary.shared().setUploadJobExtensionEnabled(true)
        } catch { problem = String(describing: error) }
        refresh()
    }

    private func refresh() {
        granted = PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized
        enabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled
        initialized = ProbeState.defaults()?.double(forKey: "initialized") ?? 0
        calls = ProbeState.defaults()?.integer(forKey: "calls") ?? 0
        checkedAt = Date()
    }
}
