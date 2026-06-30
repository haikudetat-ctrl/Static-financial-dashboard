async function installPdfGeometryGlobals() {
  if (
    typeof globalThis.DOMMatrix !== "undefined" &&
    typeof globalThis.ImageData !== "undefined" &&
    typeof globalThis.Path2D !== "undefined"
  ) {
    return;
  }

  const { DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
  const runtimeGlobals = globalThis as Record<string, unknown>;
  runtimeGlobals.DOMMatrix ??= DOMMatrix;
  runtimeGlobals.ImageData ??= ImageData;
  runtimeGlobals.Path2D ??= Path2D;
}

export async function extractPdfText(buffer: Buffer) {
  await installPdfGeometryGlobals();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
