import { describe, expect, it } from 'vitest'
import { buildPdfJsDocumentOptions } from './pdf-js-document-options'

describe('pdf.js document resource options', () => {
  it('resolves CMaps, standard fonts, and WASM beside the document', () => {
    expect(
      buildPdfJsDocumentOptions(new Uint8Array([1]), 'https://dorka.test/web-index.html')
    ).toEqual({
      data: new Uint8Array([1]),
      cMapUrl: 'https://dorka.test/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://dorka.test/standard_fonts/',
      wasmUrl: 'https://dorka.test/wasm/'
    })
  })
})
