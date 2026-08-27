import Combine
import Foundation
import Photos

@MainActor
final class PhotoLibraryAuthorizationController: ObservableObject {
    @Published private(set) var authorizationStatus: PHAuthorizationStatus
    @Published private(set) var extensionEnabled: Bool
    @Published private(set) var diagnostics: ProtocolProbeDiagnostics
    @Published private(set) var isPreparingCanary = false
    @Published private(set) var errorMessage: String?

    private let sharedStore: ProtocolProbeSharedStore?

    init(sharedStore: ProtocolProbeSharedStore? = ProtocolProbeSharedStore()) {
        self.sharedStore = sharedStore
        authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        extensionEnabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled
        diagnostics = sharedStore?.loadDiagnostics() ?? ProtocolProbeDiagnostics()
    }

    var statusDescription: String {
        switch authorizationStatus {
        case .authorized:
            "Full Photos access granted"
        case .limited:
            "Limited Photos access — automatic meals stay off"
        case .denied:
            "Photos access denied"
        case .restricted:
            "Photos access restricted"
        case .notDetermined:
            "Photos access not requested"
        @unknown default:
            "Unknown Photos access state"
        }
    }

    func requestAccessAndEnable() async {
        errorMessage = nil
        authorizationStatus = await PHPhotoLibrary.requestAuthorization(for: .readWrite)

        guard authorizationStatus == .authorized else {
            extensionEnabled = false
            return
        }

        await prepareFreshCanary()
    }

    func prepareFreshCanary() async {
        guard canPrepareFreshCanary else {
            return
        }

        isPreparingCanary = true
        errorMessage = nil
        defer {
            isPreparingCanary = false
            refreshDiagnostics()
        }

        guard let sharedStore else {
            extensionEnabled = false
            errorMessage = "The diagnostic App Group is unavailable. Automatic meal photos remain off."
            return
        }

        do {
            try PHPhotoLibrary.shared().setUploadJobExtensionEnabled(false)
            extensionEnabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled

            let tokenData = try NSKeyedArchiver.archivedData(
                withRootObject: PHPhotoLibrary.shared().currentChangeToken,
                requiringSecureCoding: true
            )
            try sharedStore.prepareFreshCanary(tokenData: tokenData)

            try PHPhotoLibrary.shared().setUploadJobExtensionEnabled(true)
            extensionEnabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled

            guard extensionEnabled,
                  sharedStore.loadPersistentChangeTokenData() == tokenData,
                  sharedStore.loadDiagnostics().phase == .readyForCapture else {
                throw NSError(domain: "SociusFit.ProtocolProbe.Setup", code: 1)
            }
        } catch {
            try? PHPhotoLibrary.shared().setUploadJobExtensionEnabled(false)
            extensionEnabled = false
            recordFailure(error, phase: .configurationError)
            errorMessage = "A fresh canary could not be prepared. No photos were uploaded."
        }
    }

    var canPrepareFreshCanary: Bool {
        authorizationStatus == .authorized && !isPreparingCanary
    }

    func refreshDiagnostics() {
        authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        extensionEnabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled
        diagnostics = sharedStore?.loadDiagnostics() ?? ProtocolProbeDiagnostics()
    }

    func disable() {
        errorMessage = nil
        do {
            try PHPhotoLibrary.shared().setUploadJobExtensionEnabled(false)
            extensionEnabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled
            try sharedStore?.updateDiagnostics {
                $0.mark(phase: .disabled, at: Date())
            }
            refreshDiagnostics()
        } catch {
            recordFailure(error)
            errorMessage = "Automatic meal photos could not be disabled. Try again."
        }
    }

    private func recordFailure(
        _ error: Error,
        phase: ProtocolProbePhase = .failed
    ) {
        let nsError = error as NSError
        try? sharedStore?.updateDiagnostics {
            $0.recordFailure(
                phase: phase,
                domain: nsError.domain,
                code: nsError.code,
                at: Date()
            )
        }
        refreshDiagnostics()
    }
}
