interface DetectedBarcode {
  rawValue: string
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}

interface BarcodeDetectorConstructor {
  new(options: { formats: string[] }): BarcodeDetectorInstance
  getSupportedFormats?: () => Promise<string[]>
}

type ScannerStop = () => void
type ScannerErrorHandler = (error: BarcodeDecoderError) => void

const SCAN_INTERVAL_MS = 250
const MAX_CONSECUTIVE_NATIVE_ERRORS = 3
const NATIVE_NO_RESULT_TIMEOUT_MS = 3_000
const VIDEO_READY_TIMEOUT_MS = 4_000
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

async function nativeDetectorSupportsRequestedFormats(
  Detector: BarcodeDetectorConstructor,
): Promise<boolean> {
  if (typeof Detector.getSupportedFormats !== 'function') return true

  try {
    const supportedFormats = await Detector.getSupportedFormats()
    return BARCODE_FORMAT_NAMES.some(format => supportedFormats.includes(format))
  } catch {
    // Keep the detector as a candidate when the optional capability probe is
    // unavailable. The bounded no-result fallback below still protects this
    // path from a detector that never recognizes a UPC/EAN.
    return true
  }
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', check)
      video.removeEventListener('canplay', check)
      video.removeEventListener('playing', check)
      clearTimeout(timeout)
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const check = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
        finish()
      }
    }
    const timeout = setTimeout(() => {
      finish(new BarcodeDecoderError())
    }, VIDEO_READY_TIMEOUT_MS)

    video.addEventListener('loadedmetadata', check)
    video.addEventListener('canplay', check)
    video.addEventListener('playing', check)
    check()
  })
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
  const startedAt = Date.now()

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
      if (Date.now() - startedAt >= NATIVE_NO_RESULT_TIMEOUT_MS) {
        active = false
        onPersistentError(new Error('Native barcode detector returned no UPC/EAN result.'))
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
  // Start the preview before loading either decoder. The ZXing fallback is
  // loaded lazily, and installed iOS can otherwise show a black video element
  // while those chunks load even though the camera stream is already active.
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  try {
    await video.play()
    await waitForVideoFrame(video)
  } catch {
    throw new BarcodeDecoderError()
  }

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
  if (Detector && await nativeDetectorSupportsRequestedFormats(Detector)) {
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
