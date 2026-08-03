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

async function startNativeDecoder(
  Detector: BarcodeDetectorConstructor,
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

async function createZxingImageReader() {
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
  return new BrowserMultiFormatOneDReader(hints)
}

/**
 * Decodes a barcode photo without uploading or retaining the image.
 *
 * The photo path is the reliable iPhone fallback for browsers and installed
 * Home Screen apps whose live MediaStream preview is inconsistent.
 */
export async function decodeBarcodeImage(file: Blob): Promise<string | null> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new BarcodeDecoderError())
    })
    image.src = imageUrl
    await loaded

    const reader = await createZxingImageReader()
    try {
      const result = await reader.decodeFromImageElement(image)
      return result.getText() || null
    } catch {
      // A scaled canvas gives the decoder a second bounded attempt for large
      // iPhone photos without retaining or sending the original image.
    }

    const maxDimension = 2_000
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    try {
      const result = reader.decodeFromCanvas(canvas)
      return result.getText() || null
    } catch {
      return null
    }
  } finally {
    URL.revokeObjectURL(imageUrl)
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
    activeStop?.()
    activeStop = null
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
      // Native detection reads our preview directly. ZXing owns the video
      // element on its path, so the two implementations do not both attach
      // and play the same iOS media element.
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      await video.play()
      activeStop = await startNativeDecoder(
        Detector,
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
