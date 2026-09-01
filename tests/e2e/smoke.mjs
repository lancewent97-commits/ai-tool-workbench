import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const routes = [
  ["/", "把想做的事"],
  ["/tools", "工具工作台"],
  ["/tools/pdf-content-extractor", "正在读取工具详情"],
  ["/tasks/00000000-0000-4000-8000-000000000001", "登录后继续"],
  ["/packages/drafts/manual/confirm", "登录后继续"],
  ["/packages/00000000-0000-4000-8000-000000000001/ready", "登录后继续"],
  ["/me/tasks", "登录后继续"],
  ["/me/downloads", "登录后继续"],
  ["/me/returns", "登录后继续"],
  ["/me/returns/new", "登录后继续"],
  ["/me/returns/00000000-0000-4000-8000-000000000001", "登录后继续"],
  ["/standards", "工具生产准则"],
  ["/admin", "正在确认维护权限"],
  ["/admin/tools", "正在确认维护权限"],
  ["/admin/tools/upload", "正在确认维护权限"],
  ["/admin/standards", "正在确认维护权限"],
  ["/admin/versions", "正在确认维护权限"],
  ["/admin/publishing", "正在确认维护权限"],
  ["/admin/taxonomy", "正在确认维护权限"],
  ["/admin/content", "正在确认维护权限"],
  ["/admin/content/review", "正在确认维护权限"],
  ["/admin/content/structure", "正在确认维护权限"],
  ["/admin/ai", "正在确认维护权限"],
  ["/admin/ai/evaluation", "正在确认维护权限"],
  ["/admin/ai/prompts", "正在确认维护权限"],
  ["/admin/analytics", "正在确认维护权限"],
  ["/admin/behavior", "正在确认维护权限"],
  ["/admin/users", "正在确认维护权限"],
  ["/admin/roles", "正在确认维护权限"],
  ["/admin/teams", "正在确认维护权限"],
  ["/admin/audit", "正在确认维护权限"],
  ["/admin/changes", "正在确认维护权限"],
  ["/admin/settings", "正在确认维护权限"],
  ["/admin/returns", "正在确认维护权限"],
];

for (const [path, marker] of routes) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200, `${path} should return 200`);
  const body = await response.text();
  assert.ok(body.includes(marker), `${path} should contain ${marker}`);
}

for (const asset of [
  "/demo-assets/material-word-audio-package.zip",
  "/demo-assets/tool-template.zip",
  "/demo-assets/single-tool-example.zip",
  "/demo-assets/composite-tool-example.zip",
]) {
  const response = await fetch(`${baseUrl}${asset}`);
  assert.equal(response.status, 200, `${asset} should be downloadable`);
  assert.ok(Number(response.headers.get("content-length") ?? 0) > 100, `${asset} should not be empty`);
}

console.log(`Smoke check passed: ${routes.length} pages and 4 download assets.`);
