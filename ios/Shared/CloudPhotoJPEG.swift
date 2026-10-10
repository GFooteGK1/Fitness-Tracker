import Foundation

/// Strip APP and comment segments from a newly encoded pixel image, including
/// segments between progressive scans. Never apply this to a Photos resource.
public enum CloudPhotoJPEG {
    public static func withoutMetadata(_ data: Data) throws -> Data {
        let bytes = [UInt8](data)
        guard bytes.count <= 1024 * 1024, bytes.count >= 4,
              bytes[0] == 255, bytes[1] == 216 else { throw CloudPhotoError.invalid }
        var output = Data(bytes.prefix(2))
        var index = 2
        var inScan = false
        var sawScan = false
        while index < bytes.count {
            let start = index
            if inScan {
                while index < bytes.count && bytes[index] != 255 { index += 1 }
                output.append(contentsOf: bytes[start..<index])
            }
            let markerStart = index
            guard index < bytes.count, bytes[index] == 255 else { throw CloudPhotoError.invalid }
            while index < bytes.count && bytes[index] == 255 { index += 1 }
            guard index < bytes.count else { throw CloudPhotoError.invalid }
            let marker = bytes[index]; index += 1
            if inScan && (marker == 0 || (208...215).contains(marker)) {
                output.append(contentsOf: bytes[markerStart..<index]); continue
            }
            inScan = false
            if marker == 217 {
                guard sawScan, index == bytes.count else { throw CloudPhotoError.invalid }
                output.append(contentsOf: [255, 217]); return output
            }
            guard marker != 0, marker != 216, !(208...215).contains(marker), index + 2 <= bytes.count else { throw CloudPhotoError.invalid }
            let length = Int(bytes[index]) * 256 + Int(bytes[index + 1])
            guard length >= 2, index + length <= bytes.count else { throw CloudPhotoError.invalid }
            index += length
            if !(224...239).contains(marker) && marker != 254 {
                output.append(contentsOf: bytes[markerStart..<index])
            }
            if marker == 218 { inScan = true; sawScan = true }
        }
        throw CloudPhotoError.invalid
    }
}
