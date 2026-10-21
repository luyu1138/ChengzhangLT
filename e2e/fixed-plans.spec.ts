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
    .getByRole("button", { name: "启用每日 OSS 备份", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Android");
  await expect(page.getByText("尚无成功备份")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await page.locator(".local-status").click();
  await expect(page.getByLabel("RAM AccessKey ID")).toHaveValue("");
  await expect(page.getByLabel("RAM AccessKey Secret")).toHaveValue("");
});

test("OSS native status and configuration UI preserve secrets and do not claim success on scheduling", async ({
  page,
}) => {
  await person(page);
  // A bridge contract double for UI only; the transport and Android scheduler have separate tests.
  await page.evaluate(() => {
    const status = {
      ok: true,
      configured: false,
      enabled: false,
      running: false,
      lastSuccessAt: "",
    };
    const bridge = {
      ossStatus: () => JSON.stringify(status),
      configureOss: (raw: string) => {
        const config = JSON.parse(raw);
        if (!config.recoverySaved)
          return JSON.stringify({ ok: false, message: "请保存恢复码" });
        Object.assign(status, {
          configured: true,
          enabled: true,
          bucket: config.bucket,
          region: config.region,
        });
        return '{"ok":true}';
      },
      disableOss: () => {
        status.enabled = false;
        return '{"ok":true}';
      },
      backupNow: () => '{"ok":true}',
      ossRecoveryCode: () => '{"ok":true,"code":"TEST-RECOVERY-CODE"}',
      forgetOss: () => {
        status.configured = false;
        status.enabled = false;
        return '{"ok":true}';
      },
    };
    window.BlueprintNative = bridge as unknown as NonNullable<
      Window["BlueprintNative"]
    >;
  });
  await page.locator(".local-status").click();
  await page.getByLabel("OSS Bucket 名称").fill("blueprint-test-only");
  await page.getByLabel("RAM AccessKey ID").fill("TestOnlyAccessKey1234");
  await page.getByLabel("RAM AccessKey Secret").fill("TestOnlySecret1234");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "启用每日 OSS 备份", exact: true })
    .click();
  await expect(
    page.getByText("已安排 · 等待首次备份", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("尚无成功备份")).toBeVisible();
  await expect(page.getByLabel("RAM AccessKey Secret")).toHaveValue("");
  await page.getByRole("button", { name: "立即备份", exact: true }).click();
  await expect(page.getByText("尚无成功备份")).toBeVisible();
  await page.getByRole("button", { name: "暂停每日备份", exact: true }).click();
  await expect(page.getByText("每日备份已暂停", { exact: true })).toBeVisible();
});
