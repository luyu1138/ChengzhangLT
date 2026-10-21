import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { _android as android, expect } from "@playwright/test";

const adb =
  process.env.ADB_PATH || "/workspace/.tools/android-sdk/platform-tools/adb";
const app = "cn.chengzhang.blueprint";
const nativeExpect = expect.configure({ timeout: 60000 });
function command(...args: string[]) {
  return execFileSync(adb, args, { encoding: "utf8", timeout: 180000 }).trim();
}
async function connect() {
  const devices = await android.devices({ omitDriverInstall: true });
  const device = devices.find((d) => d.serial().startsWith("emulator-"));
  if (!device)
    throw new Error(
      "Use a dedicated Android emulator for this destructive test",
    );
  console.log("Android device connected");
  device.setDefaultTimeout(120000);
  const webView = await device.webView({ pkg: app }, { timeout: 120000 });
  console.log("WebView discovered");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let page;
  try {
    page = await Promise.race([
      webView.page(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error("WebView did not expose a page within 120 seconds"),
            ),
          120000,
        );
      }),
    ]);
  } catch (error) {
    await device.close();
    throw error;
  } finally {
    clearTimeout(timer);
  }
  console.log("WebView automation attached");
  return { device, page };
}
mkdirSync("test-results", { recursive: true });
if (!command("get-serialno").startsWith("emulator-"))
  throw new Error("Use a dedicated emulator; this test clears app data");
console.log(
  command("install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk"),
);
console.log("Resetting app data on the dedicated test emulator");
command("shell", "pm", "clear", app);
command("shell", "am", "start", "-n", app + "/.MainActivity");
console.log("APK launched; waiting for WebView");
let connection = await connect();
let page = connection.page;
page.setDefaultTimeout(60000);
await nativeExpect(
  page.getByRole("heading", { name: "成长蓝图", exact: true }),
).toBeVisible();
await nativeExpect(
  page.getByRole("button", { name: "建立我的成长档案" }),
).toBeVisible();
await page.getByRole("button", { name: "建立我的成长档案" }).click();
await page.getByLabel("昵称", { exact: true }).fill("设备自测");
await page.getByRole("button", { name: "建立档案", exact: true }).click();
await nativeExpect(page.getByRole("dialog")).toHaveCount(0);
await page.getByRole("button", { name: "记进展", exact: true }).click();
await page
  .getByLabel("有什么进展、收获或阻碍")
  .fill("Android 强制重启后的数据完整性检查");
await page.getByRole("button", { name: "保存进展" }).click();
await nativeExpect(page.getByRole("dialog")).toHaveCount(0);
const before = await page.evaluate(() => {
  const r = JSON.parse(window.BlueprintNative!.load());
  return {
    ok: r.ok,
    persons: r.state.persons.length,
    observations: r.state.observations.length,
    operations: r.state.operations.length,
  };
});
expect(before).toEqual({
  ok: true,
  persons: 1,
  observations: 1,
  operations: 2,
});
await page.screenshot({ path: "test-results/android-debug-home.png" });
await connection.device.close();
command("shell", "am", "force-stop", app);
command("shell", "am", "start", "-n", app + "/.MainActivity");
connection = await connect();
page = connection.page;
page.setDefaultTimeout(60000);
await nativeExpect(page.locator(".person-card")).toContainText("设备自测");
const after = await page.evaluate(() => {
  const r = JSON.parse(window.BlueprintNative!.load());
  return {
    ok: r.ok,
    persons: r.state.persons.length,
    observations: r.state.observations.length,
    operations: r.state.operations.length,
  };
});
expect(after).toEqual(before);
console.log(
  "PASS: Android APK UI, native encrypted persistence, outbox, force-stop and relaunch",
);
await connection.device.close();
