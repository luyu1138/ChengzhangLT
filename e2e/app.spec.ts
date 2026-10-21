import { test, expect, type Page } from "@playwright/test";
async function person(page: Page, name = "我", first = true) {
  if (first)
    await page.getByRole("button", { name: "建立我的成长档案" }).click();
  else await page.getByRole("button", { name: /添加一个成长档案/ }).click();
  await page.getByLabel("昵称", { exact: true }).fill(name);
  const consent = page.getByRole("checkbox");
  if (await consent.count()) await consent.check();
  await page.getByRole("button", { name: "建立档案", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function goal(page: Page, title = "读完十二本专业书") {
  await page.getByRole("button", { name: "规划", exact: true }).click();
  await page.getByRole("button", { name: "建立目标", exact: true }).click();
  await page.getByLabel("希望实现什么").fill(title);
  await page.getByLabel("初始基线").fill("2");
  await page.getByLabel("目标值", { exact: true }).fill("12");
  await page.getByLabel("单位", { exact: true }).fill("本");
  await page.getByRole("button", { name: "保存为草稿" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(title) }).click();
  await page.getByRole("button", { name: "确认并激活" }).click();
  await expect(page.getByText("进行中", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
}
async function progress(page: Page, value: string) {
  await page.getByRole("button", { name: /读完十二本专业书/ }).click();
  await page.getByRole("button", { name: "记成果", exact: true }).click();
  await page.getByLabel("当前指标数值（本）").fill(value);
  await page.getByLabel("有什么进展、收获或阻碍").fill("完成了认真阅读与笔记");
  await page.getByRole("button", { name: "保存进展" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "成长蓝图", exact: true }),
  ).toBeVisible();
});

test("multi-person CRUD and encrypted persistence across full reload", async ({
  page,
}) => {
  await person(page);
  await person(page, "家人A", false);
  await person(page, "家人B", false);
  await expect(page.locator(".person-card")).toHaveCount(3);
  await page.getByLabel("搜索人物").fill("家人A");
  await expect(page.locator(".person-card")).toHaveCount(1);
  await page.getByLabel("清空搜索").click();
  await page.reload();
  await expect(page.locator(".person-card")).toHaveCount(3);
  const raw = await page.evaluate(async () => {
    return new Promise<string>((resolve, reject) => {
      const req = indexedDB.open("growth-blueprint-v1", 1);
      req.onsuccess = () => {
        const r = req.result
          .transaction("vault")
          .objectStore("vault")
          .get("state");
        r.onsuccess = () => resolve(JSON.stringify(r.result));
        r.onerror = reject;
      };
    });
  });
  expect(raw).not.toContain("家人A");
  await page.screenshot({ path: "test-results/01-home.png", fullPage: true });
});
test("nonzero baseline result progress and manual acceptance", async ({
  page,
}) => {
  await person(page);
  await goal(page);
  await progress(page, "7");
  await expect(page.locator(".goal-number strong")).toHaveText("50%");
  await page.getByRole("button", { name: "首页", exact: true }).click();
  await expect(page.locator(".annual-block strong")).toHaveText("50%");
  await page.getByRole("button", { name: "规划", exact: true }).click();
  await progress(page, "12");
  await page.getByRole("button", { name: /读完十二本专业书/ }).click();
  await page.getByRole("button", { name: "确认完成", exact: true }).click();
  await page.getByRole("button", { name: "确认继续" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".goal-card")).toContainText("已完成");
});
test("task completion, undo and reload preserve independent action progress", async ({
  page,
}) => {
  await person(page);
  await page.getByRole("button", { name: "行动", exact: true }).click();
  await page.getByRole("button", { name: "添加行动", exact: true }).click();
  await page.getByLabel("下一步做什么").fill("阅读半小时");
  await page
    .getByRole("button", { name: "添加行动", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("完成阅读半小时", { exact: true }).click();
  await expect(page.getByText("已完成 1/1")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "行动", exact: true }).click();
  await expect(page.getByText("已完成 1/1")).toBeVisible();
  await page.getByLabel("撤销阅读半小时", { exact: true }).click();
  await expect(page.getByText("已完成 0/1")).toBeVisible();
});
test("published review remains frozen after new observations and adjustment", async ({
  page,
}) => {
  await person(page);
  await goal(page);
  await progress(page, "7");
  await page.getByRole("button", { name: "复盘", exact: true }).click();
  await page.getByRole("button", { name: "开始复盘" }).click();
  await page.getByLabel("最有价值的进展").fill("阅读方法开始发挥作用");
  await page.getByLabel("下周期最多三个重点").fill("整理读书笔记");
  await page.getByRole("button", { name: "发布复盘", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "规划", exact: true }).click();
  await progress(page, "10");
  await page.getByRole("button", { name: "复盘", exact: true }).click();
  await page.locator(".review-card").click();
  await expect(page.locator(".fact-panel")).toContainText("50%");
  await expect(page.locator(".fact-panel")).not.toContainText("80%");
  await expect(
    page.getByRole("dialog").getByText("阅读方法开始发挥作用", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/02-review.png" });
});
test("encrypted export, wrong-key rejection and authenticated restore preview", async ({
  page,
}) => {
  await person(page);
  await page.getByLabel("设置", { exact: true }).click();
  await page.getByRole("button", { name: /创建加密备份/ }).click();
  const code = await page.getByLabel("此备份的独立恢复码").inputValue();
  expect(code).toHaveLength(43);
  await page.getByRole("checkbox").check();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "生成并保存加密文件" }).click();
  const file = await pending;
  const path = await file.path();
  await page.getByLabel("关闭", { exact: true }).click();
  await page.getByLabel("设置", { exact: true }).click();
  await page.getByRole("button", { name: /备份恢复/ }).click();
  await page.locator("input[type=file]").setInputFiles(path!);
  await page.getByLabel("输入完整恢复码").fill("a".repeat(43));
  await page.getByRole("button", { name: "校验并预览" }).click();
  await expect(page.getByRole("alert")).toContainText("恢复码错误");
  await page.getByLabel("输入完整恢复码").fill(code);
  await page.getByRole("button", { name: "校验并预览" }).click();
  await expect(page.getByText("认证校验通过")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "确认恢复此空间" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".person-card")).toHaveCount(1);
});
test("archive, trash and restore retain history; cloud state stays honest", async ({
  page,
}) => {
  await person(page);
  await page.getByLabel("管理我", { exact: true }).click();
  await page.getByRole("button", { name: "删除档案", exact: true }).click();
  await page.getByRole("button", { name: "确认继续" }).click();
  await expect(page.locator(".person-card")).toHaveCount(0);
  await page.getByLabel("设置", { exact: true }).click();
  await page.getByRole("button", { name: /归档与回收站/ }).click();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await page.getByLabel("关闭", { exact: true }).click();
  await expect(page.locator(".person-card")).toHaveCount(1);
  await page.getByRole("button", { name: /仅保存在本机/ }).click();
  await expect(page.getByText("阿里云盘同步未开放")).toBeVisible();
});
test("large text layout keeps navigation and forms operable without horizontal overflow", async ({
  page,
}) => {
  await person(page);
  await page.addStyleTag({ content: ":root{font-size:32px}" });
  await expect(page.locator(".person-card")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("设置", { exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /创建加密备份/ }).click();
  await expect(page.getByLabel("此备份的独立恢复码")).toBeVisible();
  await page.screenshot({ path: "test-results/03-large-text.png" });
});

test("goal adjustment previews the effect and preserves a visible version history", async ({
  page,
}) => {
  await person(page);
  await goal(page);
  await progress(page, "7");
  await page.getByRole("button", { name: /读完十二本专业书/ }).click();
  await page.getByRole("button", { name: "调整目标", exact: true }).click();
  await page.getByLabel("目标值", { exact: true }).fill("22");
  await page
    .getByLabel("调整原因", { exact: true })
    .fill("增加了学习资源，调整计划");
  await page.getByRole("button", { name: "查看调整影响" }).click();
  await expect(page.getByText("调整影响预览", { exact: true })).toBeVisible();
  await expect(page.locator(".detail-facts")).toContainText("50% → 25%");
  await page.getByRole("button", { name: "确认生成新版本" }).click();
  await expect(page.locator(".goal-number strong")).toHaveText("25%");
  await page.getByRole("button", { name: /读完十二本专业书/ }).click();
  await page.getByText("目标调整历史 · 2 个版本").click();
  await expect(
    page.getByText("增加了学习资源，调整计划", { exact: true }),
  ).toBeVisible();
});

test("evidence attachment is person-scoped and included in authenticated backup", async ({
  page,
}) => {
  await person(page);
  await page.getByRole("button", { name: "记进展", exact: true }).click();
  await page.getByLabel("有什么进展、收获或阻碍").fill("保存一份成果证据");
  await page.locator("input[type=file]").setInputFiles({
    name: "成果.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBn8AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.getByText("成果.png", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "保存进展" }).click();
  await page.getByLabel("管理我", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: /导出 成果.png/ }),
  ).toBeVisible();
  await page.getByLabel("关闭", { exact: true }).click();
  await person(page, "家人", false);
  await page
    .getByRole("button", { name: "记进展", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toContainText("所属人物");
  await expect(page.getByRole("dialog")).not.toContainText("成果.png");
});
