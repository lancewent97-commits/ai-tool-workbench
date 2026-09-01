import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("缺少 DATABASE_URL");
if (process.env.PLATFORM_ENV !== "test" || process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("演示数据只能通过测试环境的 db:seed 命令写入");
}
if (/production|formal/i.test(new URL(databaseUrl).pathname)) {
  throw new Error("禁止向正式数据库写入演示数据");
}

type SeedVersion = {
  version: string;
  verification?: "verified" | "partly-verified";
  risks?: string[];
};

type SeedTool = {
  slug: string;
  name: string;
  problem: string;
  result: string;
  principle: string;
  module: "content-production" | "operations";
  extraModules?: Array<"content-production" | "operations">;
  category: string;
  kind: "executable" | "knowledge" | "application" | "composite";
  tags: string[];
  departments: string[];
  roles: string[];
  downloads: number;
  rating: number;
  versions: SeedVersion[];
  parent?: { slug: string; version: string; difference: string };
};

const modules = [
  { slug: "content-production", name: "内容生产", sort: 10 },
  { slug: "operations", name: "产运工具", sort: 20 },
];

const categories = [
  { slug: "pdf-processing", name: "PDF处理", sort: 10 },
  { slug: "audio-video", name: "音视频处理", sort: 20 },
  { slug: "data-processing", name: "数据处理", sort: 30 },
  { slug: "image-text", name: "图文处理", sort: 40 },
  { slug: "composite", name: "组合工具", sort: 50 },
];

const tagNames: Record<string, string> = {
  batch: "批量处理",
  no_install: "无需安装",
  ocr: "OCR",
  possible_cost: "可能产生费用",
  offline: "离线可用",
  english_teaching: "英语教学",
  long_document: "长文档",
  table: "表格",
  format_conversion: "格式转换",
  subtitle: "字幕",
  timeline: "时间轴",
  cleaning: "清洗",
  image: "图片",
  derived: "衍生工具",
  scanned_copy: "扫描件",
  textbook: "教材",
  content_review: "内容审核",
  primary_english: "小学英语",
  slow_reading: "慢速跟读",
  composite: "组合工具",
  teacher_optimized: "教师优化",
  published: "已发布",
  new_tool: "新工具",
  audio_naming: "音频命名",
};

const tools: SeedTool[] = [
  {
    slug: "pdf-content-extractor",
    name: "PDF内容提取工具",
    problem: "从教材和文档中提取结构化文字、表格与章节",
    result: "可编辑的 Markdown、Excel 和结构化 JSON，保留章节与来源页码",
    principle: "本地解析与 OCR 识别文档结构，再按照统一字段输出。",
    module: "content-production",
    category: "pdf-processing",
    kind: "executable",
    tags: ["batch", "no_install", "ocr"],
    departments: ["教学研发", "内容中心", "运营支持"],
    roles: ["教研老师", "内容编辑", "运营专员"],
    downloads: 1248,
    rating: 4.8,
    versions: [{ version: "v2.3" }, { version: "v2.2" }],
  },
  {
    slug: "batch-dubbing",
    name: "批量配音工具",
    problem: "为词表或脚本批量生成音频",
    result: "按章节或条目组织的 MP3 文件",
    principle: "将结构化文本批量送入语音引擎并按命名规则整理。",
    module: "content-production",
    category: "audio-video",
    kind: "executable",
    tags: ["batch", "possible_cost"],
    departments: ["英语教研", "课程制作"],
    roles: ["英语老师", "音频编辑"],
    downloads: 948,
    rating: 4.7,
    versions: [{ version: "v3.1", risks: ["调用第三方语音服务时可能产生费用"] }],
  },
  {
    slug: "phonetic-organizer",
    name: "单词音标整理工具",
    problem: "补全、拆分并规范国际音标",
    result: "标准化单词与音标清单",
    principle: "使用内置词典和规则校正音标字段。",
    module: "content-production",
    category: "data-processing",
    kind: "knowledge",
    tags: ["offline", "english_teaching"],
    departments: ["英语教研"],
    roles: ["英语老师"],
    downloads: 856,
    rating: 4.8,
    versions: [{ version: "v1.8" }],
  },
  {
    slug: "chapter-splitter",
    name: "长文档章节工具",
    problem: "识别章节并按层级拆分文档",
    result: "分章节文件与目录清单",
    principle: "依据标题样式和语义规则检测章节层级。",
    module: "content-production",
    category: "pdf-processing",
    kind: "executable",
    tags: ["long_document", "batch"],
    departments: ["内容中心"],
    roles: ["内容编辑"],
    downloads: 872,
    rating: 4.6,
    versions: [{ version: "v2.3" }],
  },
  {
    slug: "image-text-table",
    name: "图文文字整理工具",
    problem: "提取图片文字并整理为表格",
    result: "可编辑表格",
    principle: "OCR 后按版面关系重建行列。",
    module: "operations",
    category: "image-text",
    kind: "executable",
    tags: ["ocr", "table"],
    departments: ["运营支持"],
    roles: ["运营专员"],
    downloads: 756,
    rating: 4.5,
    versions: [{ version: "v2.0" }],
  },
  {
    slug: "document-converter",
    name: "文档格式转换工具",
    problem: "转换为可编辑结构化文件",
    result: "Markdown、DOCX 或表格",
    principle: "读取源文件结构并映射到目标格式。",
    module: "content-production",
    category: "data-processing",
    kind: "executable",
    tags: ["format_conversion"],
    departments: ["内容中心"],
    roles: ["内容编辑"],
    downloads: 689,
    rating: 4.6,
    versions: [{ version: "v2.3" }],
  },
  {
    slug: "subtitle-slicer",
    name: "字幕切片工具",
    problem: "按时间轴拆分字幕和片段",
    result: "字幕片段与时间清单",
    principle: "解析时间轴并按规则切分。",
    module: "content-production",
    category: "audio-video",
    kind: "executable",
    tags: ["subtitle", "timeline"],
    departments: ["课程制作"],
    roles: ["视频编辑"],
    downloads: 641,
    rating: 4.4,
    versions: [{ version: "v2.3" }],
  },
  {
    slug: "table-cleaner",
    name: "表格数据整理工具",
    problem: "清洗、合并并检查表格数据",
    result: "标准化 Excel",
    principle: "字段映射和数据规则校验。",
    module: "operations",
    category: "data-processing",
    kind: "executable",
    tags: ["table", "cleaning"],
    departments: ["运营支持"],
    roles: ["数据运营"],
    downloads: 612,
    rating: 4.5,
    versions: [{ version: "v2.3" }],
  },
  {
    slug: "image-compressor",
    name: "图片压缩工具",
    problem: "批量压缩并保持清晰度",
    result: "压缩图片文件夹",
    principle: "根据用途选择压缩质量和尺寸。",
    module: "operations",
    category: "image-text",
    kind: "application",
    tags: ["image", "batch"],
    departments: ["运营支持"],
    roles: ["设计运营"],
    downloads: 532,
    rating: 4.3,
    versions: [{ version: "v2.3" }],
  },
  {
    slug: "pdf-scan-precision",
    name: "扫描件精准提取版",
    problem: "提升扫描教材的文字识别准确率",
    result: "带置信度的结构化文档",
    principle: "在主工具前增加图像增强和多轮 OCR。",
    module: "content-production",
    category: "pdf-processing",
    kind: "executable",
    tags: ["derived", "scanned_copy"],
    departments: ["档案中心"],
    roles: ["资料管理员"],
    downloads: 386,
    rating: 4.7,
    versions: [{ version: "v1.2" }],
    parent: {
      slug: "pdf-content-extractor",
      version: "v2.2",
      difference: "增加扫描件增强和置信度检查",
    },
  },
  {
    slug: "pdf-education-table",
    name: "教育表格增强版",
    problem: "识别教材中的单词表和练习表格",
    result: "按教学字段整理的 Excel",
    principle: "在主工具字段模型上增加教材表格模板。",
    module: "content-production",
    category: "pdf-processing",
    kind: "executable",
    tags: ["derived", "textbook"],
    departments: ["英语教研"],
    roles: ["英语老师"],
    downloads: 528,
    rating: 4.9,
    versions: [{ version: "v1.3" }],
    parent: {
      slug: "pdf-content-extractor",
      version: "v2.3",
      difference: "增加单词、音标、例句等教材字段",
    },
  },
  {
    slug: "pdf-content-review",
    name: "内容审核增强版",
    problem: "提取后标记敏感词和异常字段",
    result: "内容表和问题清单",
    principle: "在主工具输出后增加内容规则检查。",
    module: "operations",
    extraModules: ["content-production"],
    category: "pdf-processing",
    kind: "executable",
    tags: ["derived", "content_review"],
    departments: ["内容安全"],
    roles: ["审核专员"],
    downloads: 294,
    rating: 4.5,
    versions: [{ version: "v1.4", verification: "partly-verified" }],
    parent: {
      slug: "pdf-content-extractor",
      version: "v2.3",
      difference: "增加内容审核规则",
    },
  },
  {
    slug: "phonetic-primary",
    name: "音标整理工具 · 小学英语版",
    problem: "按小学英语教学规则补全、拆分并校正音标",
    result: "适合课堂使用的单词与音标清单",
    principle: "在通用音标整理工具上增加小学词表和纠错规则。",
    module: "content-production",
    category: "data-processing",
    kind: "knowledge",
    tags: ["derived", "primary_english"],
    departments: ["小学英语教研"],
    roles: ["英语老师"],
    downloads: 226,
    rating: 4.8,
    versions: [{ version: "v1.2" }],
    parent: {
      slug: "phonetic-organizer",
      version: "v1.8",
      difference: "增加小学英语词表和教师确认规则",
    },
  },
  {
    slug: "batch-dubbing-slow",
    name: "批量配音工具 · 慢速跟读版",
    problem: "为低年级词表生成慢速、留停顿的跟读音频",
    result: "按章节整理的慢速 MP3 文件",
    principle: "在批量配音流程中增加语速、停顿和重读配置。",
    module: "content-production",
    category: "audio-video",
    kind: "executable",
    tags: ["derived", "slow_reading", "possible_cost"],
    departments: ["小学英语教研"],
    roles: ["英语老师", "音频编辑"],
    downloads: 174,
    rating: 4.7,
    versions: [{
      version: "v1.0",
      verification: "partly-verified",
      risks: ["调用第三方语音服务时可能产生费用"],
    }],
    parent: {
      slug: "batch-dubbing",
      version: "v3.1",
      difference: "增加慢速跟读、停顿和重读参数",
    },
  },
  {
    slug: "teacher-material-audio",
    name: "教材单词提取与发音包 · 教师优化版",
    problem: "把教材单词提取、音标整理和跟读配音整合成可复用方案",
    result: "单词表、音标清单与按章节音频文件夹",
    principle: "锁定三个来源组件及其职责，并用统一任务、调整边界和验收文件约束本地 Agent。",
    module: "content-production",
    extraModules: ["operations"],
    category: "composite",
    kind: "composite",
    tags: ["composite", "teacher_optimized", "published"],
    departments: ["教学研发", "英语教研"],
    roles: ["英语老师", "内容编辑"],
    downloads: 128,
    rating: 4.9,
    versions: [{ version: "v1.2" }],
  },
  {
    slug: "dubbing-naming-rules",
    name: "批量发音命名规则",
    problem: "统一批量音频的章节、单词和版本命名",
    result: "可复用的音频命名与目录规则",
    principle: "将经过验证的命名约定沉淀为独立规则组件。",
    module: "content-production",
    category: "data-processing",
    kind: "knowledge",
    tags: ["new_tool", "audio_naming"],
    departments: ["英语教研", "课程制作"],
    roles: ["英语老师", "音频编辑"],
    downloads: 96,
    rating: 4.8,
    versions: [{ version: "v1.0" }],
  },
];

const sql = postgres(databaseUrl, { max: 1 });

function demoArtifact(slug: string, kind: SeedTool["kind"]) {
  const exact: Record<string, string> = {
    "pdf-content-extractor": "pdf-content-extractor.zip",
    "batch-dubbing": "batch-dubbing.zip",
    "phonetic-organizer": "phonetic-organizer.zip",
    "teacher-material-audio": "material-word-audio-package.zip",
  };
  return `/demo-assets/${exact[slug] ?? (kind === "composite"
    ? "composite-tool-example.zip"
    : "tool-template.zip")}`;
}

try {
  const [organization] = await sql`
    INSERT INTO organizations (name)
    VALUES ('工具工作台演示组织')
    ON CONFLICT (lower(name)) DO UPDATE SET updated_at = now()
    RETURNING id
  `;
  if (!organization) throw new Error("无法创建演示组织");

  for (const module of modules) {
    await sql`
      INSERT INTO tool_modules (slug, name, sort_order)
      VALUES (${module.slug}, ${module.name}, ${module.sort})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        status = 'published',
        updated_at = now()
    `;
  }
  for (const category of categories) {
    await sql`
      INSERT INTO tool_categories (slug, name, sort_order)
      VALUES (${category.slug}, ${category.name}, ${category.sort})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        status = 'published',
        updated_at = now()
    `;
  }
  for (const [index, [slug, name]] of Object.entries(tagNames).entries()) {
    await sql`
      INSERT INTO tool_tags (slug, name, sort_order)
      VALUES (${slug}, ${name}, ${index * 10})
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        sort_order = EXCLUDED.sort_order,
        status = 'published',
        updated_at = now()
    `;
  }

  for (const tool of tools) {
    const [category] = await sql`
      SELECT id FROM tool_categories WHERE slug = ${tool.category}
    `;
    const [toolRow] = await sql`
      INSERT INTO tools (
        slug, name, problem, result, principle, kind, status,
        primary_category_id, published_at, origin_type
      )
      VALUES (
        ${tool.slug}, ${tool.name}, ${tool.problem}, ${tool.result}, ${tool.principle},
        ${tool.kind}, 'published', ${category?.id ?? null},
        ${new Date("2026-07-18T09:00:00+08:00")}, 'seed'
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        problem = EXCLUDED.problem,
        result = EXCLUDED.result,
        principle = EXCLUDED.principle,
        kind = EXCLUDED.kind,
        status = 'published',
        primary_category_id = EXCLUDED.primary_category_id,
        origin_type = 'seed',
        updated_at = now()
      RETURNING id
    `;
    if (!toolRow) throw new Error(`无法写入工具 ${tool.slug}`);

    for (const [index, version] of tool.versions.entries()) {
      const [versionRow] = await sql`
        INSERT INTO tool_versions (
          tool_id, version, status, verification, change_summary,
          standard_version, risks, download_url, released_at
        )
        VALUES (
          ${toolRow.id}, ${version.version}, 'published',
          ${version.verification ?? "verified"},
          ${index === 0 ? "当前稳定版本" : "历史版本"},
          'legacy-demo-v1',
          ${sql.json(version.risks ?? [])},
          ${demoArtifact(tool.slug, tool.kind)},
          ${new Date(`2026-07-${18 - index}T09:00:00+08:00`)}
        )
        ON CONFLICT (tool_id, version) DO NOTHING
        RETURNING id
      `;
      const currentVersionRow = versionRow ?? (await sql`
        SELECT id FROM tool_versions
        WHERE tool_id = ${toolRow.id} AND version = ${version.version}
        LIMIT 1
      `)[0];
      if (index === 0 && currentVersionRow) {
        await sql`
          UPDATE tools SET latest_version_id = ${currentVersionRow.id}, updated_at = now()
          WHERE id = ${toolRow.id}
        `;
      }
    }

    await sql`DELETE FROM tool_module_placements WHERE tool_id = ${toolRow.id}`;
    const placements = [tool.module, ...(tool.extraModules ?? [])];
    for (const [index, moduleSlug] of placements.entries()) {
      const [moduleRow] = await sql`
        SELECT id FROM tool_modules WHERE slug = ${moduleSlug}
      `;
      await sql`
        INSERT INTO tool_module_placements (tool_id, module_id, is_primary, sort_order)
        VALUES (${toolRow.id}, ${moduleRow?.id}, ${index === 0}, ${index * 10})
      `;
    }

    await sql`DELETE FROM tool_tag_assignments WHERE tool_id = ${toolRow.id}`;
    for (const tagSlug of tool.tags) {
      const [tag] = await sql`SELECT id FROM tool_tags WHERE slug = ${tagSlug}`;
      await sql`
        INSERT INTO tool_tag_assignments (tool_id, tag_id)
        VALUES (${toolRow.id}, ${tag?.id})
      `;
    }

    await sql`
      INSERT INTO tool_metrics (tool_id, download_count, rating_average, rating_count)
      VALUES (${toolRow.id}, ${tool.downloads}, ${tool.rating}, 20)
      ON CONFLICT (tool_id) DO UPDATE SET
        download_count = EXCLUDED.download_count,
        rating_average = EXCLUDED.rating_average,
        rating_count = EXCLUDED.rating_count,
        updated_at = now()
    `;

    const adoptionCount = Math.max(tool.departments.length, tool.roles.length);
    for (let index = 0; index < adoptionCount; index += 1) {
      const departmentName = tool.departments[index % tool.departments.length]!;
      const roleName = tool.roles[index % tool.roles.length]!;
      const [department] = await sql`
        INSERT INTO departments (organization_id, name)
        VALUES (${organization.id}, ${departmentName})
        ON CONFLICT (organization_id, lower(name))
        DO UPDATE SET status = 'active', updated_at = now()
        RETURNING id
      `;
      const [jobFunction] = await sql`
        INSERT INTO job_functions (organization_id, name)
        VALUES (${organization.id}, ${roleName})
        ON CONFLICT (organization_id, lower(name))
        DO UPDATE SET status = 'active', updated_at = now()
        RETURNING id
      `;
      const eventKey = `seed:${tool.slug}:${departmentName}:${roleName}`;
      await sql`
        INSERT INTO tool_adoption_events (
          id, tool_id, tool_version_id, department_id, job_function_id, event_type
        )
        SELECT
          md5(${eventKey})::uuid,
          t.id,
          t.latest_version_id,
          ${department?.id},
          ${jobFunction?.id},
          'use_report'
        FROM tools t
        WHERE t.id = ${toolRow.id}
        ON CONFLICT (id) DO NOTHING
      `;
    }
  }

  for (const tool of tools) {
    if (!tool.parent) continue;
    const [child] = await sql`SELECT id FROM tools WHERE slug = ${tool.slug}`;
    const [parent] = await sql`SELECT id FROM tools WHERE slug = ${tool.parent.slug}`;
    const [parentVersion] = await sql`
      SELECT id FROM tool_versions
      WHERE tool_id = ${parent?.id} AND version = ${tool.parent.version}
    `;
    await sql`
      INSERT INTO tool_lineage (
        child_tool_id, parent_tool_id, parent_version_id, difference
      )
      VALUES (
        ${child?.id}, ${parent?.id}, ${parentVersion?.id}, ${tool.parent.difference}
      )
      ON CONFLICT (child_tool_id) DO UPDATE SET
        parent_tool_id = EXCLUDED.parent_tool_id,
        parent_version_id = EXCLUDED.parent_version_id,
        difference = EXCLUDED.difference
    `;
  }

  console.log(`Seeded ${tools.length} tools`);
} finally {
  await sql.end({ timeout: 5 });
}
