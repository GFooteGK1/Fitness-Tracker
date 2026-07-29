// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const zxingMocks = vi.hoisted(() => ({
  constructorArgs: [] as Array<[Map<unknown, unknown>, Record<string, number>]>,
  decodeFromStream: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatOneDReader: class BrowserMultiFormatOneDReader {
    constructor(hints: Map<unknown, unknown>, options: Record<string, number>) {
      zxingMocks.constructorArgs.push([hints, options])
    }

    decodeFromStream = zxingMocks.decodeFromStream
  },
}))

vi.mock('@zxing/library', () => ({
  BarcodeFormat: {
    EAN_8: 'EAN_8',
    EAN_13: 'EAN_13',
    UPC_A: 'UPC_A',
    UPC_E: 'UPC_E',
  },
  DecodeHintType: { POSSIBLE_FORMATS: 'POSSIBLE_FORMATS' },
}))

import { startBarcodeDecoder } from '@/app/lib/nutrition/barcode-scanner'

describe('startBarcodeDecoder', () => {
  beforeEach(() => {
    zxingMocks.constructorArgs.length = 0
    zxingMocks.decodeFromStream.mockReset()
    zxingMocks.stop.mockReset()
    zxingMocks.decodeFromStream.mockResolvedValue({ stop: zxingMocks.stop })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the native detector when the browser provides it', async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: '012345678905' }])
    const Detector = vi.fn(function Detector() {
      return { detect }
    })
    vi.stubGlobal('BarcodeDetector', Detector)
    const video = document.createElement('video')
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

  it('lazily falls back to ZXing for UPC and EAN formats', async () => {
    vi.stubGlobal('BarcodeDetector', undefined)
    const stream = {} as MediaStream
    const video = document.createElement('video')
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
    expect(options).toEqual({ delayBetweenScanAttempts: 250, delayBetweenScanSuccess: 500 })
    callback?.({ getText: () => '012345678905' })
    expect(onDetected).toHaveBeenCalledWith('012345678905')

    stop()
    expect(zxingMocks.stop).toHaveBeenCalledTimes(1)
  })
})
