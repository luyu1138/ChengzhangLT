import { emptyState, validateState, type State } from "./domain";

declare global {
  interface Window {
    BlueprintNative?: {
      load(): string;
      closeApp(): void;
      save(state: string, expectedRevision: number): string;
      exportFile(name: string, mime: string, base64: string): void;
      importFile(): void;
      importAttachment(): void;
      setPrivacy(enabled: boolean): void;
      appInfo(): string;
      scheduleReminder(hour: number, minute: number): string;
      cancelReminder(): void;
      openPrint(html: string): void;
      reminderStatus(): string;
      enablePlanNotifications(): string;
      requestExactReminders(): void;
      ossStatus(): string;
      configureOss(json: string): string;
      disableOss(): string;
      forgetOss(): string;
      backupNow(): string;
      ossRecoveryCode(): string;
    };
  }
}
const DB = "growth-blueprint-v1",
  AAD = new TextEncoder().encode("GrowthBlueprint/local/v1");
export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("vault");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开本地存储"));
  });
}
function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction("vault").objectStore("vault").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function browserKey(db: IDBDatabase): Promise<CryptoKey> {
  let key = await idbGet<CryptoKey>(db, "key");
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    const k = key;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite");
      tx.objectStore("vault").put(k, "key");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  return key;
}
export async function loadState(): Promise<State> {
  if (window.BlueprintNative) {
    const response = JSON.parse(window.BlueprintNative.load());
    if (!response.ok)
      throw new Error(response.message || "无法解密本地数据，请勿卸载应用");
    return response.state ? validateState(response.state) : emptyState();
  }
  const db = await openDb();
  try {
    const value = await idbGet<{ iv: Uint8Array; data: ArrayBuffer }>(
      db,
      "state",
    );
    if (!value) return emptyState();
    const key = await browserKey(db);
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: value.iv as Uint8Array<ArrayBuffer>,
        additionalData: AAD,
      },
      key,
      value.data,
    );
    return validateState(JSON.parse(new TextDecoder().decode(plain)));
  } catch {
    throw new Error("本地数据无法解密；请使用有效备份恢复，原数据已保留");
  } finally {
    db.close();
  }
}
export async function persistState(
  state: State,
  expectedRevision: number,
  replace = false,
): Promise<void> {
  validateState(state);
  if (window.BlueprintNative) {
    const response = JSON.parse(
      window.BlueprintNative.save(JSON.stringify(state), expectedRevision),
    );
    if (!response.ok)
      throw new Error(response.message || "本机保存失败，未提交更改");
    return;
  }
  const db = await openDb();
  try {
    const key = await browserKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: AAD },
      key,
      new TextEncoder().encode(JSON.stringify(state)),
    );
    const outboxIv = crypto.getRandomValues(new Uint8Array(12));
    const outboxData = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: outboxIv,
        additionalData: new TextEncoder().encode("GrowthBlueprint/outbox/v1"),
      },
      key,
      new TextEncoder().encode(JSON.stringify(state.operations)),
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite");
      const store = tx.objectStore("vault");
      const read = store.get("revision");
      read.onsuccess = () => {
        if ((read.result ?? 0) !== expectedRevision && !replace) {
          tx.abort();
          return;
        }
        store.put({ iv, data }, "state");
        store.put(state.revision, "revision");
        store.put({ iv: outboxIv, data: outboxData }, "outbox");
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(new Error("数据已在另一窗口更新，请重新打开后再试"));
      tx.onerror = () => reject(new Error("存储空间不足或写入失败"));
    });
  } finally {
    db.close();
  }
}
export function download(name: string, mime: string, bytes: Uint8Array) {
  if (window.BlueprintNative) {
    window.BlueprintNative.exportFile(name, mime, toBase64(bytes));
    return;
  }
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export const toBase64 = (bytes: Uint8Array) => {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
};
export const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
