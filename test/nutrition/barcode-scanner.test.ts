// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const zxingMocks = vi.hoisted(() => ({
  constructorArgs: [] as Array<[Map<unknown, unknown>, Record<string, number> | undefined]>,
  decodeFromStream: vi.fn(),
  decodeFromImageElement: vi.fn(),
  decodeFromCanvas: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatOneDReader: class BrowserMultiFormatOneDReader {
    constructor(hints: Map<unknown, unknown>, options?: Record<string, number>) {
      zxingMocks.constructorArgs.push([hints, options])
    }

    decodeFromStream = zxingMocks.decodeFromStream
    decodeFromImageElement = zxingMocks.decodeFromImageElement
    decodeFromCanvas = zxingMocks.decodeFromCanvas
  },
}))

vi.mock('@zxing/library', () => ({
  BarcodeFormat: {
    EAN_8: 'EAN_8',
    EAN_13: 'EAN_13',
    UPC_A: 'UPC_A',
    UPC_E: 'UPC_E',
  },
  DecodeHintType: {
    POSSIBLE_FORMATS: 'POSSIBLE_FORMATS',
    TRY_HARDER: 'TRY_HARDER',
  },
}))

import { decodeBarcodeImage, startBarcodeDecoder } from '@/app/lib/nutrition/barcode-scanner'

function createReadyVideo(): HTMLVideoElement {
  const video = document.createElement('video')
  Object.defineProperties(video, {
    readyState: { configurable: true, value: 4 },
    videoWidth: { configurable: true, value: 1280 },
    videoHeight: { configurable: true, value: 720 },
  })
  return video
}

describe('startBarcodeDecoder', () => {
  beforeEach(() => {
    zxingMocks.constructorArgs.length = 0
    zxingMocks.decodeFromStream.mockReset()
    zxingMocks.decodeFromImageElement.mockReset()
    zxingMocks.decodeFromCanvas.mockReset()
    zxingMocks.stop.mockReset()
    zxingMocks.decodeFromStream.mockResolvedValue({ stop: zxingMocks.stop })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the native detector when the browser provides it', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: '012345678905' }])
    const Detector = vi.fn(function Detector() {
      return { detect }
    })
    vi.stubGlobal('BarcodeDetector', Detector)
    const video = createReadyVideo()
    vi.spyOn(video, 'play').mockResolvedValue()
    const stream = {} as MediaStream
    const onDetected = vi.fn()

    const stop = await startBarcodeDecoder(stream, video, onDetected)
    await vi.waitFor(() => expect(onDetected).toHaveBeenCalledWith('012345678905'))

    expect(Detector).toHaveBeenCalledWith({ formats: ['ean_8', 'ean_13', 'upc_a', 'upc_e'] })
    expect(video.srcObject).toBe(stream)
    expect(zxingMocks.decodeFromStream).not.toHaveBeenCalled()
    stop()
  })

  it('lets ZXing own the live preview when native detection is unavailable', async () => {
    vi.stubGlobal('BarcodeDetector', undefined)
    const stream = {} as MediaStream
    const video = createReadyVideo()
    const onDetected = vi.fn()
    let callback: ((result?: { getText(): string }) => void) | undefined
    zxingMocks.decodeFromStream.mockImplementation(async (_stream, _video, next) => {
      callback = next
      return { stop: zxingMocks.stop }
    })

    const stop = await startBarcodeDecoder(stream, video, onDetected)

    expect(zxingMocks.decodeFromStream).toHaveBeenCalledWith(stream, video, expect.any(Function))
    const [hints, options] = zxingMocks.constructorArgs[0]
    expect(hints.get('POSSIBLE_FORMATS')).toEqual(['EAN_8', 'EAN_13', 'UPC_A', 'UPC_E'])
    expect(hints.get('TRY_HARDER')).toBe(true)
    expect(options).toEqual({ delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 500 })
    callback?.({ getText: () => '012345678905' })
    expect(onDetected).toHaveBeenCalledWith('012345678905')

    stop()
    expect(zxingMocks.stop).toHaveBeenCalledTimes(1)
  })

  it('decodes a captured barcode image in memory and revokes its object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:barcode-photo')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.stubGlobal('Image', class FakeImage {
      naturalWidth = 1200
      naturalHeight = 800
      decoding = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    })
    zxingMocks.decodeFromImageElement.mockResolvedValue({ getText: () => '012345678905' })

    await expect(decodeBarcodeImage(new Blob(['barcode'], { type: 'image/jpeg' }))).resolves.toBe('012345678905')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:barcode-photo')
    expect(zxingMocks.decodeFromImageElement).toHaveBeenCalledTimes(1)
    expect(zxingMocks.decodeFromCanvas).not.toHaveBeenCalled()
  })

  it('keeps native scanning after an isolated frame failure', async () => {
    vi.useFakeTimers()
    const detect = vi.fn()
      .mockRejectedValueOnce(new DOMException('Frame unavailable', 'InvalidStateError'))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rawValue: '012345678905' }])
    const Detector = vi.fn(function Detector() {
      return { detect }
    })
    vi.stubGlobal('BarcodeDetector', Detector)
    const video = createReadyVideo()
    vi.spyOn(video, 'play').mockResolvedValue()
    const onDetected = vi.fn()

    const stop = await startBarcodeDecoder({} as MediaStream, video, onDetected)
    await vi.advanceTimersByTimeAsync(500)

    expect(onDetected).toHaveBeenCalledWith('012345678905')
    expect(zxingMocks.decodeFromStream).not.toHaveBeenCalled()
    stop()
  })

  it('falls back to ZXing when native detection returns no UPC/EAN result', async () => {
    vi.useFakeTimers()
    const detect = vi.fn().mockResolvedValue([])
    const Detector = vi.fn(function Detector() {
      return { detect }
    })
    vi.stubGlobal('BarcodeDetector', Detector)
    const video = createReadyVideo()
    vi.spyOn(video, 'play').mockResolvedValue()
    const onDetected = vi.fn()
    let callback: ((result?: { getText(): string }) => void) | undefined
    zxingMocks.decodeFromStream.mockImplementation(async (_stream, _video, next) => {
      callback = next
      return { stop: zxingMocks.stop }
    })

    const stop = await startBarcodeDecoder({} as MediaStream, video, onDetected)
    await vi.advanceTimersByTimeAsync(3_000)

    expect(detect).toHaveBeenCalled()
    expect(zxingMocks.decodeFromStream).toHaveBeenCalledTimes(1)
    callback?.({ getText: () => '012345678905' })
    expect(onDetected).toHaveBeenCalledWith('012345678905')
    stop()
  })

  it('skips native detection when no requested UPC/EAN format is supported', async () => {
    const detect = vi.fn().mockResolvedValue([])
    const Detector = Object.assign(vi.fn(function Detector() {
      return { detect }
    }), {
      getSupportedFormats: vi.fn().mockResolvedValue(['qr_code']),
    })
    vi.stubGlobal('BarcodeDetector', Detector)
    const video = createReadyVideo()
    vi.spyOn(video, 'play').mockResolvedValue()
    zxingMocks.decodeFromStream.mockResolvedValue({ stop: zxingMocks.stop })

    await startBarcodeDecoder({} as MediaStream, video, vi.fn())

    expect(Detector).not.toHaveBeenCalled()
    expect(zxingMocks.decodeFromStream).toHaveBeenCalledTimes(1)
  })

  it('falls back once to ZXing after repeated native frame failures', async () => {
    vi.useFakeTimers()
    const detect = vi.fn().mockRejectedValue(new DOMException('Unsupported frame', 'NotSupportedError'))
    const Detector = vi.fn(function Detector() {
      return { detect }
    })
    vi.stubGlobal('BarcodeDetector', Detector)
    const video = createReadyVideo()
    vi.spyOn(video, 'play').mockResolvedValue()
    const stream = {} as MediaStream
    const onDetected = vi.fn()
    let callback: ((result?: { getText(): string }) => void) | undefined
    zxingMocks.decodeFromStream.mockImplementation(async (_stream, _video, next) => {
      callback = next
      return { stop: zxingMocks.stop }
    })

    const stop = await startBarcodeDecoder(stream, video, onDetected)
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(zxingMocks.decodeFromStream).toHaveBeenCalledTimes(1))

    expect(detect).toHaveBeenCalledTimes(3)
    expect(zxingMocks.decodeFromStream).toHaveBeenCalledWith(stream, video, expect.any(Function))
    callback?.({ getText: () => '012345678905' })
    expect(onDetected).toHaveBeenCalledWith('012345678905')

    await vi.advanceTimersByTimeAsync(1_000)
    expect(zxingMocks.decodeFromStream).toHaveBeenCalledTimes(1)
    stop()
    expect(zxingMocks.stop).toHaveBeenCalledTimes(1)
  })

  it('stops a ZXing fallback that finishes loading after cancellation', async () => {
    vi.useFakeTimers()
    const detect = vi.fn().mockRejectedValue(new DOMException('Unsupported frame', 'NotSupportedError'))
    const Detector = vi.fn(function Detector() {
      return { detect }
    })
    vi.stubGlobal('BarcodeDetector', Detector)
    const video = createReadyVideo()
    vi.spyOn(video, 'play').mockResolvedValue()
    const onDetected = vi.fn()
    let finishFallback: ((controls: { stop: typeof zxingMocks.stop }) => void) | undefined
    zxingMocks.decodeFromStream.mockImplementation(() => new Promise(resolve => {
      finishFallback = resolve
    }))

    const stop = await startBarcodeDecoder({} as MediaStream, video, onDetected)
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(zxingMocks.decodeFromStream).toHaveBeenCalledTimes(1))

    stop()
    finishFallback?.({ stop: zxingMocks.stop })
    await Promise.resolve()
    await Promise.resolve()

    expect(zxingMocks.stop).toHaveBeenCalledTimes(1)
    expect(onDetected).not.toHaveBeenCalled()
  })

  it('reports when both native and fallback decoding fail', async () => {
    vi.useFakeTimers()
    const detect = vi.fn().mockRejectedValue(new DOMException('Unsupported frame', 'NotSupportedError'))
    const Detector = vi.fn(function Detector() {
      return { detect }
    })
    vi.stubGlobal('BarcodeDetector', Detector)
    const video = createReadyVideo()
    vi.spyOn(video, 'play').mockResolvedValue()
    const onError = vi.fn()
    zxingMocks.decodeFromStream.mockRejectedValue(new Error('ZXing failed'))

    await startBarcodeDecoder({} as MediaStream, video, vi.fn(), onError)
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))

    expect(onError.mock.calls[0][0]).toMatchObject({
      name: 'BarcodeDecoderError',
      message: 'Barcode recognition could not start.',
    })
  })
})
