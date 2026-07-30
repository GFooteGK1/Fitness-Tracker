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
type ScannerErrorHandler = (error: BarcodeDecoderError) => void

const SCAN_INTERVAL_MS = 250
const MAX_CONSECUTIVE_NATIVE_ERRORS = 3
const BARCODE_FORMAT_NAMES = ['ean_8', 'ean_13', 'upc_a', 'upc_e']

export class BarcodeDecoderError extends Error {
  constructor() {
    super('Barcode recognition could not start.')
    this.name = 'BarcodeDecoderError'
  }
}

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
  onPersistentError: (error: unknown) => void,
): Promise<ScannerStop> {
  const detector = new Detector({ formats: BARCODE_FORMAT_NAMES })
  let active = true
  let consecutiveErrors = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  video.srcObject = stream
  await video.play()

  const scan = async () => {
    if (!active) return
    try {
      const result = (await detector.detect(video))[0]
      consecutiveErrors = 0
      if (result?.rawValue) {
        active = false
        onDetected(result.rawValue)
        return
      }
    } catch (error) {
      consecutiveErrors += 1
      if (consecutiveErrors >= MAX_CONSECUTIVE_NATIVE_ERRORS) {
        active = false
        onPersistentError(error)
        return
      }
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
  hints.set(DecodeHintType.TRY_HARDER, true)
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
 * still inconsistent across mobile browsers, so setup failures and repeated
 * frame failures fall back to a lazily loaded ZXing decoder.
 */
export async function startBarcodeDecoder(
  stream: MediaStream,
  video: HTMLVideoElement,
  onDetected: (value: string) => void,
  onError: ScannerErrorHandler = () => {},
): Promise<ScannerStop> {
  let activeStop: ScannerStop | null = null
  let stopped = false
  let detected = false
  let fallbackStarting = false

  const stop = () => {
    if (stopped) return
    stopped = true
    activeStop?.()
    activeStop = null
  }

  const handleDetected = (value: string) => {
    if (stopped || detected) return
    detected = true
    activeStop?.()
    activeStop = null
    onDetected(value)
  }

  const reportRuntimeError = () => {
    if (stopped || detected) return
    stopped = true
    activeStop?.()
    activeStop = null
    onError(new BarcodeDecoderError())
  }

  const startRuntimeFallback = async () => {
    if (stopped || detected || fallbackStarting) return
    fallbackStarting = true
    try {
      const fallbackStop = await startZxingDecoder(stream, video, handleDetected)
      if (stopped || detected) {
        fallbackStop()
        return
      }
      activeStop = fallbackStop
    } catch {
      reportRuntimeError()
    }
  }

  const Detector = nativeBarcodeDetector()
  if (Detector) {
    try {
      activeStop = await startNativeDecoder(
        Detector,
        stream,
        video,
        handleDetected,
        () => void startRuntimeFallback(),
      )
      return stop
    } catch {
      // Partially implemented native APIs can reject supported format names.
    }
  }

  try {
    const fallbackStop = await startZxingDecoder(stream, video, handleDetected)
    if (stopped || detected) fallbackStop()
    else activeStop = fallbackStop
    return stop
  } catch {
    throw new BarcodeDecoderError()
  }
}
