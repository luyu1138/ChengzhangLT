import { SCHEMA, validateState, type State, type Review } from "./domain";
import { toBase64, fromBase64 } from "./storage";
import { validateAttachments } from "./attachments";
const enc = new TextEncoder();
const aad = enc.encode("GrowthBlueprint/backup/v1");
export function recoveryCode() {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
async function keyFrom(code: string) {
  const clean = code
    .replaceAll(" ", "")
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  let raw: Uint8Array;
  try {
    raw = fromBase64(clean);
  } catch {
    throw new Error("恢复码格式不正确");
  }
  if (raw.length !== 32)
    throw new Error("恢复码需为导出时生成的完整 43 位恢复码");
  return crypto.subtle.importKey(
    "raw",
    raw as Uint8Array<ArrayBuffer>,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptBackup(
  state: State,
  code: string,
): Promise<Uint8Array> {
  validateState(state);
  const key = await keyFrom(code),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = enc.encode(JSON.stringify(state));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    key,
    plain,
  );
  const result = enc.encode(
    JSON.stringify({
      format: "GrowthBlueprint",
      version: SCHEMA,
      algorithm: "AES-256-GCM",
      iv: toBase64(iv),
      data: toBase64(new Uint8Array(data)),
      createdAt: new Date().toISOString(),
    }),
  );
  if (result.length > 20 * 1024 * 1024)
    throw new Error(
      "备份超过当前版本的 20MB 上限，请先导出附件并精简空间后重试",
    );
  return result;
}
export async function decryptBackup(
  bytes: Uint8Array,
  code: string,
): Promise<State> {
  if (bytes.length > 20 * 1024 * 1024)
    throw new Error("备份超过 20MB，无法导入");
  let envelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("文件不是有效备份");
  }
  if (
    envelope.format !== "GrowthBlueprint" ||
    envelope.version !== SCHEMA ||
    envelope.algorithm !== "AES-256-GCM"
  )
    throw new Error("备份格式不兼容，当前空间未修改");
  const key = await keyFrom(code);
  let plain: ArrayBuffer;
  try {
    const iv = fromBase64(envelope.iv);
    if (iv.length !== 12) throw new Error();
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      fromBase64(envelope.data),
    );
  } catch {
    throw new Error("恢复码错误或文件已损坏，当前空间未修改");
  }
  const state = validateState(JSON.parse(new TextDecoder().decode(plain)));
  await validateAttachments(state.attachments);
  return state;
}
export function reviewMarkdown(review: Review, name: string) {
  const s = review.snapshot;
  return `# ${name}的成长复盘\n\n${review.start} ～ ${review.end} · 第 ${review.revision} 版\n\n## 本期事实\n\n已完成 ${s.completed}/${s.due} 项到期行动\n\n${s.goalProgress.map((g) => `- ${g.title}：${g.progress === null ? "待补充" : Math.round(g.progress * 100) + "%"}（目标版本 ${g.version}）`).join("\n")}\n\n## 最有价值的进展\n\n${review.wins}\n\n## 主要阻碍及原因\n\n${review.obstacles}\n\n## 保留或停止的方法\n\n${review.methods}\n\n## 下周期重点\n\n${review.next.map((t) => "- " + t).join("\n")}\n\n---\n冻结于 ${s.capturedAt}；时区 ${s.timezone}；计算规则 ${s.calcVersion}。\n`;
}
export function observationsCsv(state: State, personId: string) {
  const safe = (v: unknown) => {
    let text = String(v ?? "");
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const person = state.persons.find((p) => p.id === personId);
  return (
    "\ufeff" +
    [
      ["人物", "发生时间", "录入时间", "目标", "指标数值", "记录"],
      ...state.observations
        .filter((o) => o.personId === personId)
        .map((o) => [
          person?.name,
          o.eventTime,
          o.recordedAt,
          state.goals.find((g) => g.id === o.goalId)?.title ?? "",
          o.value ?? "",
          o.text,
        ]),
    ]
      .map((row) => row.map(safe).join(","))
      .join("\r\n")
  );
}
