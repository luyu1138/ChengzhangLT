import { uid, type Attachment } from "./domain";
import { fromBase64, toBase64 } from "./storage";
export async function digest(bytes: Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function prepareAttachment(
  bytes: Uint8Array,
  name: string,
): Promise<Omit<Attachment, "personId" | "observationId">> {
  if (bytes.length < 8 || bytes.length > 5 * 1024 * 1024)
    throw new Error("附件需为不超过 5MB 的 PNG、JPEG、PDF");
  const head = [...bytes.subarray(0, 8)];
  const mime =
    head.slice(0, 4).join(",") === "137,80,78,71"
      ? "image/png"
      : head[0] === 255 && head[1] === 216 && head[2] === 255
        ? "image/jpeg"
        : new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-"
          ? "application/pdf"
          : "";
  if (!mime) throw new Error("文件内容与支持的 PNG、JPEG、PDF 类型不匹配");
  return {
    id: uid(),
    name: name.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 200) || "附件",
    mime,
    size: bytes.length,
    sha256: await digest(bytes),
    data: toBase64(bytes),
  };
}
export async function validateAttachments(attachments: Attachment[]) {
  for (const a of attachments) {
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(a.data);
    } catch {
      throw new Error("附件编码损坏");
    }
    if (bytes.length !== a.size || (await digest(bytes)) !== a.sha256)
      throw new Error("附件摘要校验失败，当前空间未修改");
    await prepareAttachment(bytes, a.name);
  }
}
