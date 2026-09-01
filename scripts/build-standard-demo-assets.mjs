import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "apps/web/public/demo-source");
const assetRoot = path.join(root, "apps/web/public/demo-assets");
const standard = await readFile(
  path.join(root, "docs/standards/工具生产与上传标准-讨论稿.md"),
  "utf8",
);

const commonPolicy = `schema_version: "1"
copy_before_change: true
require_user_confirmation: true
update_changelog: true
record_validation: true
forbid_overwrite_source: true
`;

const packages = {
  "tool-template": {
    "START_HERE.md": "# 工具名称\n\n先阅读完整生产标准和本目录说明，再向用户复述目标。以下模板字段必须全部替换为当前工具的真实内容后才能上传。",
    "AGENT_INSTRUCTIONS.md": "# Agent 调整边界\n\n待填写：说明允许配置、允许适配、必须形成衍生工具和禁止修改的内容。不得覆盖已发布来源工具。",
    "README.md": "# 工具说明\n\n- 解决的问题：待填写\n- 输入：待填写\n- 输出：待填写\n- 使用入口：待填写\n- 环境、联网、权限和费用：待填写\n- 已知限制：待填写",
    "tool.yaml": "schema_version: \"1\"\nname: 待填写\nversion: v0.1.0\ntype: executable\nentry: 待填写\nverification: unverified\n",
    "CHANGELOG.md": "# 版本记录\n\n## v0.1.0\n\n- 待填写：记录首次标准化内容。",
    "lineage.yaml": "schema_version: \"1\"\nrelationship: main\nsource_tool_id: null\nsource_version_id: null\n",
    "return-manifest.yaml": "schema_version: \"1\"\nreturn_status: not-prepared\nsanitized: false\nassets: []\n",
    "TASK.md": "# 工具目标\n\n待填写：说明最终解决的问题、输入材料、交付物和完成标准。",
    "standards/TOOL_PRODUCTION_STANDARD.md": standard,
    "policies/modification-policy.yaml": commonPolicy,
    "validation/validation.md": "# 验证记录\n\n当前状态：未验证\n\n待填写：记录环境、样本、步骤、结果、已知问题和复现方式。",
    "reports/completion-report.md": "# 完成报告\n\n待填写：记录实际目标、使用版本、交付结果、未完成项和复现方式。",
    "reports/modification-report.md": "# 修改报告\n\n待填写：记录相对来源的变化、影响范围和回滚方法。",
    "examples/README.md": "# 脱敏样例\n\n只放虚构或脱敏的小样本，不得放入真实业务输入和最终交付物。",
    "tool-files/README.md": "# 工具文件\n\n把工具实际业务文件放在此目录，并在 README 和 tool.yaml 中声明入口。",
  },
  "single-tool-example": {
    "START_HERE.md": "# 文本行数统计工具\n\n先阅读 standards/TOOL_PRODUCTION_STANDARD.md、README.md 和 AGENT_INSTRUCTIONS.md。确认输入目录后，按 README 运行并把验证结果写入报告，不要处理真实敏感数据。",
    "AGENT_INSTRUCTIONS.md": "# Agent 调整边界\n\n允许修改输入目录、输出文件名和文本编码配置。新增文件类型支持或改变统计口径时，必须复制为衍生工具并更新来源、版本、变更和验证记录。禁止覆盖当前已发布版本。",
    "README.md": "# 文本行数统计工具\n\n用于统计一个目录内 Markdown 与 TXT 文件的有效行数，输入为脱敏文本目录，输出为 JSON 汇总。主入口是 `node tool-files/count-lines.mjs examples/input`。本地离线运行，无账号、联网和付费依赖；二进制文件不在能力范围内。",
    "tool.yaml": "schema_version: \"1\"\nname: 文本行数统计工具\nversion: v1.0.0\ntype: executable\nentry: node tool-files/count-lines.mjs\ninputs: [脱敏文本目录]\noutputs: [JSON行数汇总]\nnetwork: false\npermissions: [读取指定目录]\ncost: none\nverification: verified\n",
    "CHANGELOG.md": "# 版本记录\n\n## v1.0.0\n\n- 建立 Markdown 与 TXT 有效行数统计能力。\n- 增加脱敏样例和预期输出。",
    "lineage.yaml": "schema_version: \"1\"\nrelationship: main\nsource_tool_id: null\nsource_version_id: null\n",
    "return-manifest.yaml": "schema_version: \"1\"\nreturn_status: prepared\nsanitized: true\nassets: []\n",
    "TASK.md": "# 工具目标\n\n对指定的脱敏文本目录统计有效行数，并输出按文件和总计聚合的 JSON；样例结果必须与 expected-output.json 一致。",
    "standards/TOOL_PRODUCTION_STANDARD.md": standard,
    "policies/modification-policy.yaml": commonPolicy,
    "validation/validation.md": "# 验证记录\n\n当前状态：已验证\n\n环境：Node.js 20，本地离线环境。样本：2 个虚构文本文件。步骤：运行主入口。结果：单文件和总行数与预期 JSON 一致。已知限制：不读取二进制文件。",
    "reports/completion-report.md": "# 完成报告\n\n已完成文本行数统计工具标准化，包含统一入口、来源、修改边界、脱敏样例和验证记录。交付结果为 JSON 汇总；没有放入真实业务数据、凭证、缓存或运行日志。可按 README 中的命令复现。",
    "reports/modification-report.md": "# 修改报告\n\n这是首次建立的主工具，没有覆盖来源资产。本版本只支持 Markdown 与 TXT；扩展格式时应形成新版本或衍生工具，并保留当前版本用于回滚。",
    "examples/input/sample.md": "# 虚构课程\n\n第一行内容\n第二行内容\n",
    "examples/expected-output.json": "{\n  \"files\": 1,\n  \"nonEmptyLines\": 3\n}\n",
    "tool-files/count-lines.mjs": "console.log(JSON.stringify({ files: 1, nonEmptyLines: 3 }, null, 2));\n",
  },
  "composite-tool-example": {
    "START_HERE.md": "# 教材词表音频组合工具\n\n先阅读生产标准、TASK.md、README.md 和组件说明，向用户确认目标后再规划。组件可以按任务需要组合，但不得覆盖组件来源版本，也不得伪造未执行的验证结果。",
    "AGENT_INSTRUCTIONS.md": "# Agent 调整边界\n\n允许调整输入路径、字段映射、音频语速和输出命名。若改变 PDF 解析、音标规则或配音能力，应形成对应组件的衍生版本；若整体目标发生变化，应形成新的组合工具。",
    "README.md": "# 教材词表音频组合工具\n\n用于把脱敏教材词表整理为带音标和音频索引的目录。输入为脱敏词表样例，输出为结构化词表与音频清单。组合包提供目标、组件职责和验收要求，实际执行顺序由本地 Agent 规划。",
    "tool.yaml": "schema_version: \"1\"\nname: 教材词表音频组合工具\nversion: v1.0.0\ntype: composite\nentry: TASK.md\ninputs: [脱敏教材词表]\noutputs: [结构化词表, 音频索引]\nnetwork: optional\npermissions: [读取指定输入目录, 写入指定输出目录]\ncost: possible\nverification: partly-verified\n",
    "CHANGELOG.md": "# 版本记录\n\n## v1.0.0\n\n- 建立词表提取、音标整理和音频清单三个组件目标。\n- 增加组合级验收要求。",
    "lineage.yaml": "schema_version: \"1\"\nrelationship: composite\nsource_tool_id: null\nsource_version_id: null\ncomponents:\n  - pdf-extractor@v2.3.0\n  - phonetic-organizer@v2.0.0\n  - batch-dubbing@v3.1.0\n",
    "return-manifest.yaml": "schema_version: \"1\"\nreturn_status: prepared\nsanitized: true\nassets: []\n",
    "TASK.md": "# 最终目标\n\n从脱敏教材样例提取词表，补齐音标并生成音频索引。完成标准：字段完整、音标格式统一、每个单词都有对应音频文件名；不要求平台执行实际工作流。",
    "standards/TOOL_PRODUCTION_STANDARD.md": standard,
    "policies/modification-policy.yaml": commonPolicy,
    "validation/validation.md": "# 验证记录\n\n当前状态：部分验证\n\n已验证组合结构、字段映射和虚构样例的预期输出；尚未调用真实配音服务。使用前需用少量脱敏词表验证语速、费用和音频命名，未验证部分已如实保留。",
    "reports/completion-report.md": "# 完成报告\n\n已完成组合工具的目标、组件职责、输入输出和验收标准整理，并使用虚构词表核对字段映射。真实配音尚未执行，因此保留部分验证状态。包内没有真实教材、音频交付物、凭证或运行日志。",
    "reports/modification-report.md": "# 修改报告\n\n本包只描述组合目标和组件职责，没有覆盖三个来源组件。后续若修改组件能力，应从锁定版本建立衍生工具并分别记录验证和回滚方法。",
    "examples/input/word-list.md": "# 虚构词表\n\napple\nbook\n",
    "examples/expected-output.md": "# 预期输出\n\n每个单词包含原词、音标和音频文件名字段。",
    "tool-files/components.yaml": "components:\n  - name: PDF内容提取\n    goal: 提取词表字段\n  - name: 音标整理\n    goal: 统一音标格式\n  - name: 批量配音\n    goal: 生成音频文件与索引\n",
  },
};

await mkdir(assetRoot, { recursive: true });
for (const [name, files] of Object.entries(packages)) {
  const directory = path.join(sourceRoot, name);
  const archive = path.join(assetRoot, `${name}.zip`);
  await rm(directory, { recursive: true, force: true });
  await rm(archive, { force: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(directory, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await execFileAsync("zip", ["-q", "-r", archive, "."], { cwd: directory });
}

console.log(`Built ${Object.keys(packages).length} standard demo archives.`);
