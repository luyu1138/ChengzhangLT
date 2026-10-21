import { test, expect, type Page } from "@playwright/test";

async function person(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "建立我的成长档案" }).click();
  await page.getByLabel("昵称", { exact: true }).fill("我的固定计划");
  await page.getByRole("button", { name: "建立档案", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("sky-blue fixed daily, weekly and monthly plans keep completion history after reload", async ({
  page,
}) => {
  await person(page);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
    ),
  ).toBe("#0878b5");
  await page.getByRole("button", { name: "行动", exact: true }).click();
  for (const [kind, title] of [
    ["daily", "每日阅读"],
    ["weekdays", "每周整理"],
    ["monthly", "每月复查"],
  ]) {
    await page
      .getByRole("button", { name: "添加固定计划", exact: true })
      .click();
    await page.getByLabel("下一步做什么").fill(title);
    await page.getByLabel("重复规则").selectOption(kind);
    const date = await page.getByLabel("计划日期").inputValue();
    if (kind === "monthly")
      await page.getByLabel("每月几号").fill(String(Number(date.slice(8))));
    if (kind === "weekdays") {
      const weekday = new Date(date + "T12:00:00Z").getUTCDay();
      const buttons = page
        .getByRole("group", { name: "重复星期" })
        .getByRole("button");
      for (let i = 0; i < 7; i++)
        if (
          ((await buttons.nth(i).getAttribute("aria-pressed")) === "true") !==
          (i === weekday)
        )
          await buttons.nth(i).click();
    }
    await page.getByLabel("此计划提醒时间").fill("10:15");
    await page
      .getByRole("button", { name: "添加行动", exact: true })
      .last()
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByLabel("完成" + title, { exact: true }).click();
  }
  await page.getByRole("button", { name: "完成记录", exact: true }).click();
  await expect(page.locator(".history-list .list-row")).toHaveCount(3);
  await expect(page.locator(".history-list")).toContainText("完成于");
  await page.reload();
  await page.getByRole("button", { name: "行动", exact: true }).click();
  await page.getByRole("button", { name: "完成记录", exact: true }).click();
  await expect(page.locator(".history-list .list-row")).toHaveCount(3);
  await page.screenshot({
    path: "test-results/sky-blue-history.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "固定计划", exact: true }).click();
  await expect(page.locator(".action-list")).toContainText("10:15 提醒");
  await page.getByLabel("暂停每日阅读").click();
  await expect(page.getByLabel("恢复每日阅读")).toBeVisible();
  const personId = await page.getByLabel("当前人物").inputValue();
  await page.getByRole("button", { name: "首页", exact: true }).click();
  await page.evaluate(
    (personId) =>
      window.dispatchEvent(
        new CustomEvent("blueprint-open-actions", {
          detail: { personId, date: "2026-10-20" },
        }),
      ),
    personId,
  );
  await expect(page.getByLabel("查看行动日期")).toHaveValue("2026-10-20");
  await expect(page.getByLabel("当前人物")).toHaveValue(personId);
});

test("OSS setup requires an independently saved recovery code and stays honest in browser preview", async ({
  page,
}) => {
  await person(page);
  await page.locator(".local-status").click();
  await expect(page.getByText("尚无成功备份")).toBeVisible();
  await expect(page.getByLabel("OSS 备份恢复码")).toHaveValue(
    /^[A-Za-z0-9_-]{43}$/,
  );
  await page.getByLabel("OSS Bucket 名称").fill("blueprint-test-only");
  await page.getByLabel("RAM AccessKey ID").fill("TestOnlyAccessKey1234");
  await page.getByLabel("RAM AccessKey Secret").fill("TestOnlySecret1234");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "保存 OSS 配置", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Android");
  await expect(page.getByText("尚无成功备份")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await page.locator(".local-status").click();
  await expect(page.getByLabel("RAM AccessKey ID")).toHaveValue("");
  await expect(page.getByLabel("RAM AccessKey Secret")).toHaveValue("");
});

async function installCloudBridge(page: Page, configured = false) {
  // UI bridge contract double; Android scheduling and verified transport are tested separately.
  await page.evaluate((configured) => {
    const status = {
      ok: true,
      configured,
      enabled: false,
      running: false,
      bucket: configured ? "blueprint-test-only" : "",
      region: "cn-hangzhou",
      lastSuccessAt: "",
      lastError: "",
      manualRequestId: "",
      manualState: "",
      manualSuccessAt: "",
      manualError: "",
    };
    let requests = 0;
    window.BlueprintNative = {
      ossStatus: () => JSON.stringify(status),
      configureOss: (raw: string) => {
        const config = JSON.parse(raw);
        if (!status.configured && !config.recoverySaved)
          return JSON.stringify({ ok: false, message: "请保存恢复码" });
        Object.assign(status, {
          configured: true,
          bucket: config.bucket,
          region: config.region,
        });
        return '{"ok":true}';
      },
      setOssAutoBackup: (enabled: boolean) => {
        status.enabled = enabled;
        return '{"ok":true}';
      },
      backupNow: () => {
        Object.assign(status, {
          manualRequestId: `request-${++requests}`,
          manualState: "queued",
          manualSuccessAt: "",
          manualError: "",
          lastError: "",
        });
        return JSON.stringify({ ok: true, requestId: status.manualRequestId });
      },
      ossRecoveryCode: () => '{"ok":true,"code":"TEST-RECOVERY-CODE"}',
      forgetOss: () => {
        Object.assign(status, { configured: false, enabled: false });
        return '{"ok":true}';
      },
    } as unknown as NonNullable<Window["BlueprintNative"]>;
    window.addEventListener("oss-test-update", (event) => {
      Object.assign(status, (event as CustomEvent).detail);
      window.dispatchEvent(new Event("focus"));
    });
    window.dispatchEvent(new Event("focus"));
  }, configured);
}
async function updateCloud(page: Page, fields: Record<string, unknown>) {
  await page.evaluate(
    (detail) =>
      window.dispatchEvent(new CustomEvent("oss-test-update", { detail })),
    fields,
  );
}

test("OSS switch persists across panel reopen and manual backup stays available with automatic backup off", async ({
  page,
}) => {
  await person(page);
  await installCloudBridge(page);
  await page.locator(".local-status").click();
  const toggle = page.getByRole("switch", { name: "每日自动备份" });
  await expect(toggle).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "立即备份", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("OSS Bucket 名称").fill("blueprint-test-only");
  await page.getByLabel("RAM AccessKey ID").fill("TestOnlyAccessKey1234");
  await page.getByLabel("RAM AccessKey Secret").fill("TestOnlySecret1234");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "保存 OSS 配置", exact: true })
    .click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByLabel("RAM AccessKey Secret")).toHaveValue("");
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(
    page.getByText("已安排 · 等待首次备份", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.locator(".local-status").click();
  await expect(toggle).toBeChecked();
  await page
    .getByRole("button", { name: "保存 OSS 配置", exact: true })
    .click();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.getByRole("button", { name: "立即备份", exact: true }).click();
  await expect(page.getByText("尚无成功备份")).toBeVisible();
  await expect(page.locator(".backup-success")).toHaveCount(0);
  await expect(
    page.getByText("立即备份已排队，等待网络和系统调度…"),
  ).toBeVisible();
});

test("manual success is prominent only after this request verifies, and clears for a new request", async ({
  page,
}) => {
  await person(page);
  await installCloudBridge(page, true);
  await page.locator(".local-status").click();
  const backup = page.getByRole("button", { name: "立即备份", exact: true });
  await backup.click();
  // An old/automatic success timestamp must not complete a pending manual request.
  await updateCloud(page, { lastSuccessAt: "2026-10-20T06:00:00Z" });
  await expect(page.locator(".backup-success")).toHaveCount(0);
  await updateCloud(page, { running: true, manualState: "running" });
  await expect(backup).toBeDisabled();
  await expect(page.locator(".backup-success")).toHaveCount(0);
  await updateCloud(page, {
    running: false,
    manualState: "success",
    lastSuccessAt: "2026-10-21T07:34:00Z",
    manualSuccessAt: "2026-10-21T07:34:00Z",
  });
  const success = page.locator(".backup-success");
  await expect(success).toContainText("立即备份成功");
  await expect(success).toContainText("通过下载回读校验");
  await expect(success).toBeFocused();
  await expect(success.locator("time")).toHaveAttribute(
    "datetime",
    "2026-10-21T07:34:00Z",
  );
  await expect(
    page.getByRole("switch", { name: "每日自动备份" }),
  ).not.toBeChecked();
  await page.screenshot({
    path: "test-results/oss-backup-success.png",
    fullPage: true,
  });
  await page.addStyleTag({ content: ":root{font-size:32px}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await backup.click();
  await expect(success).toHaveCount(0);
  await expect(
    page.getByText("立即备份已排队，等待网络和系统调度…"),
  ).toBeVisible();
});

test("OSS failure retains diagnostics and never claims manual success", async ({
  page,
}) => {
  await person(page);
  await installCloudBridge(page, true);
  await page.locator(".local-status").click();
  await page.getByRole("switch", { name: "每日自动备份" }).click();
  await page.getByRole("button", { name: "立即备份", exact: true }).click();
  const error =
    "HTTP 403 · 上传（PUT） · AccessDenied：检查 oss:PutObject 权限。\n请求编号：0123456789ABCDEF01234567";
  await updateCloud(page, {
    manualState: "failed",
    lastError: error,
    manualError: error,
  });
  await expect(
    page.getByText("最近备份失败 · 等待重试", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("已安排 · 等待首次备份", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".backup-success")).toHaveCount(0);
  await expect(page.getByRole("alert").first()).toContainText("立即备份未成功");
  await expect(page.getByRole("alert").first()).toContainText(
    "0123456789ABCDEF01234567",
  );
  await expect(page.getByText("尚无成功备份")).toBeVisible();
  await page.addStyleTag({ content: ":root{font-size:32px}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("a rejected automatic switch change keeps the saved state", async ({
  page,
}) => {
  await person(page);
  await installCloudBridge(page, true);
  await page.evaluate(() => {
    window.BlueprintNative!.setOssAutoBackup = () =>
      '{"ok":false,"message":"系统未接受每日备份任务，请重试"}';
  });
  await page.locator(".local-status").click();
  const toggle = page.getByRole("switch", { name: "每日自动备份" });
  await expect(toggle).toBeEnabled();
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole("alert")).toContainText("系统未接受");
  await expect(
    page.getByRole("button", { name: "立即备份", exact: true }),
  ).toBeEnabled();
});
