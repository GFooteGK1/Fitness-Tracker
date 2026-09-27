import Foundation

enum ProbeState {
    static let appGroup = "group.com.example.photouploadprobe"

    static func defaults() -> UserDefaults? {
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) != nil else {
            return nil
        }
        return UserDefaults(suiteName: appGroup)
    }
}
