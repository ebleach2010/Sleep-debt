/**
 * Helpers for taking either a raw export.xml or an export.zip from the user
 * and getting back the XML text. Apple's zip contains `apple_health_export/export.xml`.
 *
 * We don't ship a zip library; instead, if the user provides a .zip we parse
 * the local-file headers manually for the single `export.xml` entry. Apple's
 * zip uses DEFLATE — we use the browser's native DecompressionStream.
 */

export async function extractXmlFromFile(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xml')) return await file.text();
  if (lower.endsWith('.zip')) return await readExportXmlFromZip(file);
  // Fallback: try text.
  return await file.text();
}

async function readExportXmlFromZip(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const decoder = new TextDecoder();

  // Walk local file headers (signature 0x04034b50) and find export.xml.
  let i = 0;
  while (i + 30 <= buf.length) {
    const sig = dv.getUint32(i, true);
    if (sig !== 0x04034b50) break;
    const compMethod = dv.getUint16(i + 8, true);
    const compSize = dv.getUint32(i + 18, true);
    const uncompSize = dv.getUint32(i + 22, true);
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const name = decoder.decode(buf.subarray(i + 30, i + 30 + nameLen));
    const dataStart = i + 30 + nameLen + extraLen;

    if (/export\.xml$/i.test(name)) {
      const slice = buf.subarray(dataStart, dataStart + compSize);
      if (compMethod === 0) {
        return decoder.decode(slice);
      }
      if (compMethod === 8) {
        // raw DEFLATE
        const stream = new Response(
          new Blob([slice as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
        );
        return await stream.text();
      }
      throw new Error(`Unsupported zip compression method ${compMethod}`);
    }

    // Skip to next local file header.
    i = dataStart + compSize;
    if (compSize === 0xffffffff || uncompSize === 0xffffffff) {
      throw new Error('ZIP64 export not supported. Re-export from Health.');
    }
  }
  throw new Error('Could not find export.xml inside the zip.');
}
