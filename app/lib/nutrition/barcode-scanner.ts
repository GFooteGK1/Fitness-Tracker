interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorConstructor {
  new(options: { formats: string[] }): BarcodeDetectorInstance
}

type ScannerStop = () => void

const SCAN_INTERVAL_MS = 250
const BARCODE_FORMAT_NAMES = ['ean_8', 'ean_13', 'upc_a', 'upc_e']

function nativeBarcodeDetector(): BarcodeDetectorConstructor | undefined {
  return (globalThis as typeof globalThis & {
    BarcodeDetector?: BarcodeDetectorConstructor
  }).BarcodeDetector
}

async function startNativeDecoder(
  Detector: BarcodeDetectorConstructor,
  stream: MediaStream,
  video: HTMLVideoElement,
  onDetected: (value: string) => void,
): Promise<ScannerStop> {
  const detector = new Detector({ formats: BARCODE_FORMAT_NAMES })
  let active = true
  let timer: ReturnType<typeof setTimeout> | null = null

  video.srcObject = stream
  await video.play()

  const scan = async () => {
    if (!active) return
    try {
      const result = (await detector.detect(video))[0]
      if (result?.rawValue) {
        active = false
        onDetected(result.rawValue)
        return
      }
    } catch {
      // Individual frames often fail while the camera focuses. Keep scanning.
    }
    if (active) timer = setTimeout(() => void scan(), SCAN_INTERVAL_MS)
  }

  void scan()
  return () => {
    active = false
    if (timer !== null) clearTimeout(timer)
  }
}

async function startZxingDecoder(
  stream: MediaStream,
  video: HTMLVideoElement,
  onDetected: (value: string) => void,
): Promise<ScannerStop> {
  const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_8,
    BarcodeFormat.EAN_13,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ])
  const reader = new BrowserMultiFormatOneDReader(hints, {
    delayBetweenScanAttempts: SCAN_INTERVAL_MS,
    delayBetweenScanSuccess: 500,
  })
  const controls = await reader.decodeFromStream(stream, video, result => {
    if (result) onDetected(result.getText())
  })

  return () => {
    void controls.stop()
  }
}

/**
 * Starts UPC/EAN decoding for an already-authorized camera stream.
 *
 * The native detector is preferred when available. Its implementation is
 * still inconsistent across mobile browsers, so construction failures fall
 * back to a lazily loaded ZXing decoder.
 */
export async function startBarcodeDecoder(
  stream: MediaStream,
  video: HTMLVideoElement,
  onDetected: (value: string) => void,
): Promise<ScannerStop> {
  const Detector = nativeBarcodeDetector()
  if (Detector) {
    try {
      return await startNativeDecoder(Detector, stream, video, onDetected)
    } catch {
      // Partially implemented native APIs can reject supported format names.
    }
  }

  return startZxingDecoder(stream, video, onDetected)
}
