/**
 * Reads a request body while counting the bytes as they arrive, and stops at the
 * first chunk past `limit` (FO-186, se-fb B2). `Request.formData()` / `.arrayBuffer()`
 * buffer the whole body whatever `content-length` says — and a chunked request has
 * no `content-length` at all — so a size check after them comes too late.
 */

/** The body's bytes, or `null` as soon as more than `limit` bytes have arrived (the stream is cancelled). */
export async function readCappedBytes(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
