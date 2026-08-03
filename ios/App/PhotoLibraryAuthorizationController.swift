import Combine
import Photos

@MainActor
final class PhotoLibraryAuthorizationController: ObservableObject {
    @Published private(set) var authorizationStatus: PHAuthorizationStatus
    @Published private(set) var extensionEnabled: Bool
    @Published private(set) var errorMessage: String?

    init() {
        authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        extensionEnabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled
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

        do {
            try PHPhotoLibrary.shared().setUploadJobExtensionEnabled(true)
            extensionEnabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled
        } catch {
            extensionEnabled = false
            errorMessage = "Automatic meal photos could not be enabled. No photos were uploaded."
        }
    }

    func disable() {
        errorMessage = nil
        do {
            try PHPhotoLibrary.shared().setUploadJobExtensionEnabled(false)
            extensionEnabled = PHPhotoLibrary.shared().uploadJobExtensionEnabled
        } catch {
            errorMessage = "Automatic meal photos could not be disabled. Try again."
        }
    }
}
