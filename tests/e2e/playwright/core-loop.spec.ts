import { expect, test } from "@playwright/test";

const account = process.env.E2E_ACCOUNT ?? "e2e-admin";
const password = process.env.E2E_PASSWORD ?? "e2e-local-password-123";

test("employee can create, confirm, package, download and start a return", async ({ page }, testInfo) => {
  await page.goto("/");

  await page.getByRole("button", { name: "账号菜单" }).click();
  await page.getByRole("menuitem", { name: "登录后继续" }).click();
  await page.getByLabel("内部账号").fill(account);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录并继续" }).click();
  await expect(page.getByRole("link", { name: /我的任务/ })).toBeVisible();

  await page.getByLabel("任务需求").fill(
    "用PDF教材提取单词，整理音标，再为每个单词生成跟读音频",
  );
  await page.getByRole("button", { name: "创建任务" }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: /任务说明/ })).toBeVisible();

  await page.getByRole("button", { name: "确认任务说明，查看推荐方案" }).click();
  await expect(page.getByText("方案已生成", { exact: true })).toBeVisible();
  await expect(page.getByText("能力覆盖：")).toBeVisible();
  await expect(page.getByText(/完整覆盖当前任务要求|现有工具部分覆盖/)).toBeVisible();

  await page.getByRole("button", { name: "选择此方案，进入打包确认" }).click();
  await expect(page).toHaveURL(/\/packages\/drafts\/ai-[0-9a-f-]{36}\/confirm/);
  await expect(page.getByRole("heading", { name: "确认这个工具包" })).toBeVisible();

  for (let section = 0; section < 4; section += 1) {
    const confirm = page.getByRole("button", { name: "确认本段" });
    await expect(confirm).toBeVisible();
    await confirm.click();
  }

  const risk = page.getByLabel("我已了解以上费用或外部传输风险");
  if (await risk.isVisible().catch(() => false)) await risk.check();

  const downloadEvent = page.waitForEvent("download", { timeout: 45_000 });
  await page.getByRole("button", { name: "确认并生成工具包" }).click();
  const download = await downloadEvent;
  const archivePath = testInfo.outputPath("generated-package.zip");
  await download.saveAs(archivePath);

  await expect(page).toHaveURL(/\/packages\/[0-9a-f-]{36}\/ready/);
  await expect(page.getByText(/已开始下载/)).toBeVisible();
  await page.getByRole("button", { name: "查看下载记录" }).click();
  await expect(page.getByRole("heading", { name: "我的下载" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "下载凭证" })).toBeVisible();

  await page.getByRole("button", { name: "发起回传" }).click();
  await expect(page.getByRole("heading", { name: "新建回传" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(archivePath);
  await expect(page.getByText("这个工具包还差几项，暂时不能提交审核")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("button", { name: "下载 FIX_PROMPT.md" })).toBeVisible();
});
