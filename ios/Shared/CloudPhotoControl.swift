import Foundation

/// Enrollment spans awaits; the short control lock lets disable invalidate it
/// from another process without waiting for a network request to finish.
public struct CloudPhotoControlStore: Sendable {
    public let directory: URL
    public init(directory: URL) { self.directory = directory }

    public func enrollmentLease() throws -> CloudPhotoLease {
        try CloudPhotoLease(directory.appendingPathComponent("enrollment", isDirectory: true))
    }

    private func locked<T>(_ operation: () throws -> T) throws -> T {
        let lease = try CloudPhotoLease(directory)
        defer { withExtendedLifetime(lease) {} }
        return try operation()
    }

    private func readEpoch() throws -> UUID {
        let url = directory.appendingPathComponent("epoch.json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            let epoch = UUID()
            try writeEpoch(epoch)
            return epoch
        }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: 257) ?? Data()
        guard data.count <= 256, let epoch = try? JSONDecoder().decode(UUID.self, from: data) else {
            throw CloudPhotoError.invalid
        }
        return epoch
    }

    private func writeEpoch(_ epoch: UUID) throws {
        let data = try JSONEncoder().encode(epoch)
        let url = directory.appendingPathComponent("epoch.json")
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
    }

    public func begin(_ check: () throws -> Void) throws -> UUID {
        try locked {
            let epoch = try readEpoch()
            try check()
            return epoch
        }
    }

    public func activate(epoch: UUID, _ saveCredential: () throws -> Void) throws {
        try locked {
            guard try readEpoch() == epoch else { throw CloudPhotoError.disabled }
            try saveCredential()
        }
    }

    public func isCurrent(epoch: UUID) throws -> Bool {
        try locked { try readEpoch() == epoch }
    }

    public func disable<T>(_ clearCredential: () throws -> T) throws -> T {
        try locked {
            _ = try readEpoch() // Preserve corrupt or unreadable control evidence.
            try writeEpoch(UUID()) // Invalidate enrollment BEFORE clearing a key.
            return try clearCredential()
        }
    }
}
