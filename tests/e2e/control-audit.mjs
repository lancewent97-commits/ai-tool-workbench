import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "../..");
const sourceRoot = path.join(root, "apps/web/src");
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "apps/web/node_modules/typescript"));

function collectFiles(directory, extension, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(fullPath, extension, output);
    else if (entry.name.endsWith(extension)) output.push(fullPath);
  }
  return output;
}

const sourceFiles = collectFiles(sourceRoot, ".tsx");
const deadButtons = [];
let buttonCount = 0;
let linkCount = 0;

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "button") {
      buttonCount += 1;
      const attributes = node.openingElement.attributes.properties.filter(ts.isJsxAttribute);
      const hasClick = attributes.some((attribute) => attribute.name.getText(ast) === "onClick");
      const isSubmit = attributes.some(
        (attribute) => attribute.name.getText(ast) === "type" && attribute.initializer?.getText(ast).includes("submit"),
      );
      if (!hasClick && !isSubmit) {
        const position = ast.getLineAndCharacterOfPosition(node.getStart(ast));
        deadButtons.push(`${path.relative(root, file)}:${position.line + 1}`);
      }
    }
    if (
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.openingElement?.tagName?.getText(ast) === "Link"
    ) {
      linkCount += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(ast);
}

assert.deepEqual(deadButtons, [], `Visible buttons without click or submit behavior:\n${deadButtons.join("\n")}`);

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const catalogResponse = await fetch(`${baseUrl}/api/backend/v1/tools?page=1&pageSize=100`);
assert.equal(catalogResponse.status, 200, "catalog API should return 200");
const catalog = await catalogResponse.json();
const toolIds = Array.isArray(catalog.items)
  ? catalog.items.map((item) => item.slug).filter(Boolean)
  : [];
const routes = [
  "/",
  "/home",
  "/tools",
  "/tasks",
  "/downloads",
  "/returns",
  "/standards",
  "/admin",
  "/admin/tools",
  "/admin/tools/pdf-content-extractor",
  "/admin/tools/upload",
  "/admin/versions",
  "/admin/publishing",
  "/admin/taxonomy",
  "/admin/content",
  "/admin/content/new",
  "/admin/content/content-1",
  "/admin/content/review",
  "/admin/content/structure",
  "/admin/ai",
  "/admin/ai/evaluation",
  "/admin/ai/prompts",
  "/admin/ai/prompts/new",
  "/admin/ai/prompts/prompt-1",
  "/admin/analytics",
  "/admin/behavior",
  "/admin/users",
  "/admin/roles",
  "/admin/teams",
  "/admin/audit",
  "/admin/audit/log-1",
  "/admin/changes",
  "/admin/changes/change-1",
  "/admin/settings",
  "/admin/returns",
  "/me/tasks",
  "/me/downloads",
  "/me/returns",
  "/me/returns/new",
  "/tasks/00000000-0000-4000-8000-000000000001",
  "/packages/drafts/manual/confirm",
  "/packages/00000000-0000-4000-8000-000000000001/ready",
  ...toolIds.map((id) => `/tools/${id}`),
];

for (const route of routes) {
  const response = await fetch(`${baseUrl}${route}`);
  assert.equal(response.status, 200, `${route} should return 200`);
  assert.ok((await response.text()).length > 500, `${route} should render a complete page`);
}

const assets = [
  "/demo-assets/material-word-audio-package.zip",
  "/demo-assets/tool-template.zip",
  "/demo-assets/single-tool-example.zip",
  "/demo-assets/composite-tool-example.zip",
  "/demo-assets/pdf-content-extractor.zip",
  "/demo-assets/phonetic-organizer.zip",
  "/demo-assets/batch-dubbing.zip",
  "/demo-assets/FIX_PROMPT.md",
  "/demo-source/material-word-audio/TOOL_PRODUCTION_STANDARD.md",
];

for (const asset of assets) {
  const response = await fetch(`${baseUrl}${asset}`);
  assert.equal(response.status, 200, `${asset} should be downloadable`);
  assert.ok((await response.arrayBuffer()).byteLength > 20, `${asset} should not be empty`);
}

console.log(
  `Control audit passed: ${buttonCount} buttons, ${linkCount} links, ${routes.length} routes, ${assets.length} assets.`,
);
