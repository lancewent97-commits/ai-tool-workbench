"use client";

import type {
  AdminToolAssetDetail,
  AdminToolAssetSummary,
  AdminToolUploadResponse,
  ToolKind,
  ToolTaxonomy,
  VerificationState,
} from "@ai-tool-workbench/contracts";
import {
  ArrowRight,
  Check,
  CheckCircle,
  Clock,
  DownloadSimple,
  FileText,
  Info,
  MagnifyingGlass,
  Package,
  RocketLaunch,
  UploadSimple,
  WarningCircle,
  X,
  XCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createAdminTool,
  createAdminToolVersion,
  getAdminTool,
  listAllAdminTools,
  offlineAdminTool,
  publishAdminTool,
  publishAdminToolVersion,
  uploadAdminTool,
} from "@/lib/api/admin-client";
import { getCatalogTaxonomy } from "@/lib/api/catalog-client";
import { ErrorPanel, LoadingPanel, dateText, verificationText } from "./admin-ui";
import { productionStandard, requiredToolFiles } from "@/features/standards/standards-data";
import styles from "./asset-console.module.css";

const statusText = {
  draft: "草稿",
  published: "已上架",
  offline: "已下架",
} as const;

function toolType(tool: AdminToolAssetSummary) {
  if (tool.parent) return "衍生工具";
  return tool.kind === "composite" ? "组合工具" : "主工具";
}

function StatusChip({ status }: { status: AdminToolAssetSummary["status"] }) {
  return <span className={`${styles.lifecycleStatus} ${styles[`lifecycle_${status}`]}`}>
    {status === "published" ? <CheckCircle weight="fill"/> : <WarningCircle weight="fill"/>}
    {statusText[status]}
  </span>;
}

function UploadSteps({ step }: { step: number }) {
  const steps = [
    ["上传工具包", "上传并校验工具压缩包"],
    ["自动检查", "系统自动检查工具包"],
    ["填写工具资料", "完善工具元数据与说明"],
    ["确认发布", "本人确认后立即发布"],
  ];
  return <ol className={styles.uploadSteps}>
    {steps.map(([label, note], index) =>
      <li className={step === index + 1 ? styles.stepCurrent : index + 1 < step ? styles.stepDone : undefined} key={label}>
        <span>{index + 1 < step ? <Check/> : index + 1}</span>
        <div><strong>{label}</strong><small>{note}</small></div>
      </li>
    )}
  </ol>;
}

export function AdminPublishingPage() {
  const [items, setItems] = useState<AdminToolAssetSummary[]>([]);
  const [details, setDetails] = useState<Record<string, AdminToolAssetDetail>>({});
  const [taxonomy, setTaxonomy] = useState<ToolTaxonomy | null>(null);
  const [active, setActive] = useState("published");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [moduleSlug, setModuleSlug] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    void Promise.all([listAllAdminTools(), getCatalogTaxonomy()])
      .then(async ([assets, taxonomyResult]) => {
        if (!mounted) return;
        setItems(assets.items);
        setTaxonomy(taxonomyResult);
        const results = await Promise.all(assets.items.map((tool) =>
          getAdminTool(tool.id).then((result) => [tool.id, result.tool] as const)
        ));
        if (mounted) setDetails(Object.fromEntries(results));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取发布状态"))
      .finally(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  async function toggle(tool: AdminToolAssetSummary) {
    const reason = tool.status === "published"
      ? window.prompt("请说明下架原因。版本、下载和衍生记录会继续保留。")
      : null;
    if (tool.status === "published" && !reason?.trim()) return;
    setBusy(tool.id);
    setError("");
    try {
      const result = tool.status === "published"
        ? await offlineAdminTool(tool.id, reason!.trim())
        : await publishAdminTool(tool.id);
      setItems((current) => current.map((item) => item.id === tool.id ? result.tool : item));
      setDetails((current) => ({ ...current, [tool.id]: result.tool }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布操作失败");
    } finally {
      setBusy("");
    }
  }

  const counts = {
    draft: items.filter((tool) => tool.status === "draft").length,
    published: items.filter((tool) => tool.status === "published").length,
    versions: items.filter((tool) => tool.versionCount > 1).length,
    offline: items.filter((tool) => tool.status === "offline").length,
    abnormal: items.filter((tool) => !tool.latestVersionId && tool.status !== "draft").length,
    all: items.length,
  };

  const visible = useMemo(() => items.filter((tool) => {
    if (active === "draft" && tool.status !== "draft") return false;
    if (active === "published" && tool.status !== "published") return false;
    if (active === "versions" && tool.versionCount <= 1) return false;
    if (active === "offline" && tool.status !== "offline") return false;
    if (active === "abnormal" && (tool.latestVersionId || tool.status === "draft")) return false;
    if (kind === "main" && tool.parent) return false;
    if (kind === "derived" && !tool.parent) return false;
    if (kind === "composite" && tool.kind !== "composite") return false;
    if (moduleSlug && !tool.moduleSlugs.includes(moduleSlug)) return false;
    if (relation === "with-derived" && !tool.derivedCount) return false;
    if (relation === "derived" && !tool.parent) return false;
    return `${tool.name}${tool.latestVersion ?? ""}${tool.problem}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  }), [active, items, kind, moduleSlug, query, relation]);

  if (loading) return <main className={styles.page}><LoadingPanel text="正在读取发布控制台"/></main>;
  if (error && !items.length) return <main className={styles.page}><ErrorPanel message={error}/></main>;

  return <main className={styles.page}>
    <header className={styles.pageHeading}>
      <div><h1>发布管理</h1><p>管理默认下载版本、历史版本、上下架状态和替代关系。</p></div>
      <Link className={styles.headingLink} href="/admin/standards"><FileText/>查看发布规则</Link>
    </header>
    <nav className={styles.releaseTabs}>
      {([
        ["draft", "待发布", counts.draft],
        ["published", "已上架", counts.published],
        ["versions", "多版本", counts.versions],
        ["offline", "已下架", counts.offline],
        ["abnormal", "发布异常", counts.abnormal],
        ["all", "全部", counts.all],
      ] as const).map(([value, label, count]) =>
        <button className={active === value ? styles.releaseTabActive : undefined} onClick={() => setActive(value)} key={value}>{label}<span>{count}</span></button>
      )}
    </nav>
    <section className={styles.releaseFilters}>
      <label><span>名称/关键词</span><span className={styles.releaseSearch}><MagnifyingGlass/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具名称或关键词"/></span></label>
      <label><span>工具类型</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">全部类型</option><option value="main">主工具</option><option value="derived">衍生工具</option><option value="composite">组合工具</option></select></label>
      <label><span>展示模块</span><select value={moduleSlug} onChange={(event) => setModuleSlug(event.target.value)}><option value="">全部模块</option>{taxonomy?.modules.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
      <label><span>主工具/衍生工具</span><select value={relation} onChange={(event) => setRelation(event.target.value)}><option value="">全部关系</option><option value="with-derived">拥有衍生工具</option><option value="derived">仅衍生工具</option></select></label>
      <button onClick={() => { setQuery(""); setKind(""); setModuleSlug(""); setRelation(""); }}>重置</button>
    </section>
    <p className={styles.releaseNotice}><Info/>默认下载指向最新已发布版本；下架记录永久保留，并展示更新版本、替代版本和衍生版本提示。</p>
    {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
    <section className={styles.releaseTable}>
      <div className={styles.releaseHead}><span>工具与版本</span><span>主工具/衍生关系</span><span>发布来源</span><span>展示模块</span><span>默认下载版本</span><span>历史版本状态</span><span>下载事件</span><span>发布时间</span><span>发布状态</span><span>维护操作</span></div>
      <div className={styles.releaseRows}>
        {visible.map((tool) => {
          const detail = details[tool.id];
          const oldVersions = detail?.versions.filter((version) => version.id !== tool.latestVersionId) ?? [];
          return <article key={tool.id}>
            <div className={styles.releaseIdentity}><strong>{tool.name}</strong><small>{tool.latestVersion ?? "尚无版本"}</small></div>
            <span className={styles.relationChip}>{toolType(tool)}</span>
            <span>{tool.origin.startsWith("return-") ? "用户回传" : "平台上传"}</span>
            <span>{taxonomy?.modules.find((module) => tool.moduleSlugs.includes(module.slug))?.name ?? tool.moduleSlugs[0] ?? "未设置"}</span>
            <strong>{tool.latestVersion ?? "—"}<small>{tool.latestVersionId ? "默认最新" : "无默认版本"}</small></strong>
            <span className={styles.oldVersions}>{oldVersions.length ? oldVersions.slice(0, 3).map((version) => <i className={version.status === "published" ? styles.oldAvailable : styles.oldOffline} key={version.id}>{version.version} · {statusText[version.status]}</i>) : "无历史版本"}</span>
            <span>{tool.downloads.toLocaleString()}</span>
            <time>{dateText(tool.publishedAt ?? tool.updatedAt)}</time>
            <StatusChip status={tool.status}/>
            <span className={styles.releaseActions}><Link href={`/admin/tools/${tool.slug}`}>查看发布</Link><button disabled={busy === tool.id || tool.status === "draft"} onClick={() => void toggle(tool)}>{busy === tool.id ? "处理中" : tool.status === "published" ? "下架" : "重新上架"}</button></span>
          </article>;
        })}
        {!visible.length ? <div className={styles.emptyState}>没有匹配的发布记录</div> : null}
      </div>
      <footer><span>共 {visible.length} 条</span><span>20 条/页</span></footer>
    </section>
  </main>;
}

type UploadMode = "new" | "version" | "derived";

export function AdminToolUploadPage() {
  const router = useRouter();
  const search = useSearchParams();
  const requestedSlug = search.get("tool");
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<AdminToolUploadResponse | null>(null);
  const [tools, setTools] = useState<AdminToolAssetSummary[]>([]);
  const [details, setDetails] = useState<Record<string, AdminToolAssetDetail>>({});
  const [taxonomy, setTaxonomy] = useState<ToolTaxonomy | null>(null);
  const [mode, setMode] = useState<UploadMode>("new");
  const [targetId, setTargetId] = useState("");
  const [sourceVersionId, setSourceVersionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saved, setSaved] = useState(false);
  const [fixCopied, setFixCopied] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    slug: "",
    name: "",
    problem: "",
    result: "",
    principle: "",
    kind: "executable" as ToolKind,
    moduleSlug: "",
    categorySlug: "",
    tagSlugs: "",
    version: "v1.0.0",
    verification: "unverified" as VerificationState,
    changeSummary: "首次发布",
    standardVersion: "v0.28",
    risks: "",
    difference: "",
  });

  useEffect(() => {
    let mounted = true;
    void Promise.all([listAllAdminTools(), getCatalogTaxonomy()])
      .then(async ([assets, taxonomyResult]) => {
        if (!mounted) return;
        setTools(assets.items);
        setTaxonomy(taxonomyResult);
        setForm((current) => ({
          ...current,
          moduleSlug: current.moduleSlug || taxonomyResult.modules[0]?.slug || "",
          categorySlug: current.categorySlug || taxonomyResult.categories[0]?.slug || "",
        }));
        const requested = assets.items.find((tool) => tool.slug === requestedSlug);
        if (requested) {
          setMode("version");
          setTargetId(requested.id);
        }
        const roots = assets.items.filter((tool) => !tool.parent);
        const detailPairs = await Promise.all(roots.map((tool) =>
          getAdminTool(tool.id).then((result) => [tool.id, result.tool] as const)
        ));
        if (mounted) setDetails(Object.fromEntries(detailPairs));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取工具配置"));
    return () => {
      mounted = false;
    };
  }, [requestedSlug]);

  const targetTool = tools.find((tool) => tool.id === targetId);
  const sourceVersions = targetTool ? details[targetTool.id]?.versions ?? [] : [];
  const requiredFindings = upload?.findings.filter((item) => item.level === "required") ?? [];
  const selectedModes = [
    ["new", "新建主工具", "上传一个全新的工具，作为独立主工具发布。"],
    ["version", "新版本（升级现有工具）", "基于现有工具发布新版本，保留历史版本。"],
    ["derived", "新建衍生工具", "基于现有工具和版本形成独立衍生资产。"],
  ] as const;

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setUpload(null);
    setFixCopied(false);
    setError("");
    setUploadProgress(0);
  }

  function changeMode(next: UploadMode) {
    setMode(next);
    if (next === "new") {
      setTargetId("");
      setSourceVersionId("");
    }
  }

  function saveDraft() {
    window.localStorage.setItem("admin-tool-upload-draft", JSON.stringify({ mode, targetId, sourceVersionId, form }));
    setSaved(true);
  }

  async function copyFixPrompt() {
    if (!upload?.fixPrompt) return;
    try {
      await navigator.clipboard.writeText(upload.fixPrompt);
      setFixCopied(true);
    } catch {
      setError("复制失败，请使用“下载本次修正提示词”");
    }
  }

  async function advance() {
    setError("");
    if (step === 1) {
      if (!file) return;
      if (mode !== "new" && !targetTool) {
        setError("请选择关联工具");
        return;
      }
      if (mode === "derived" && !sourceVersionId) {
        setError("请选择衍生工具的来源版本");
        return;
      }
      setBusy(true);
      try {
        setUpload(await uploadAdminTool(file, setUploadProgress));
        setStep(2);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "上传失败");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 2) {
      if (upload?.accepted) setStep(3);
      return;
    }
    if (step === 3) {
      const needsMetadata = mode !== "version";
      if (!form.version.trim() || !form.changeSummary.trim()) {
        setError("请填写版本号和版本说明");
        return;
      }
      if (needsMetadata && (!form.slug.trim() || !form.name.trim() || !form.problem.trim() || !form.result.trim() || !form.principle.trim() || !form.moduleSlug)) {
        setError("请补齐工具名称、标识、问题、效果、原理和业务模块");
        return;
      }
      if (mode === "derived" && !form.difference.trim()) {
        setError("请说明衍生工具与来源版本的差异");
        return;
      }
      setStep(4);
      return;
    }
    if (!upload?.accepted || !upload.artifactStorageKey || !upload.downloadUrl) return;
    setBusy(true);
    try {
      const sourceVersion = sourceVersions.find((version) => version.id === sourceVersionId);
      const tool = mode === "version" && targetTool
        ? targetTool
        : (await createAdminTool({
            slug: form.slug.trim(),
            name: form.name.trim(),
            problem: form.problem.trim(),
            result: form.result.trim(),
            principle: form.principle.trim(),
            kind: form.kind,
            categorySlug: form.categorySlug || null,
            moduleSlugs: [form.moduleSlug],
            tagSlugs: form.tagSlugs.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
            lineage: mode === "derived" && targetTool && sourceVersion
              ? { parentToolId: targetTool.id, parentVersionId: sourceVersion.id, difference: form.difference.trim() }
              : null,
          })).tool;
      const created = await createAdminToolVersion(tool.id, {
        version: form.version.trim(),
        verification: form.verification,
        changeSummary: form.changeSummary.trim(),
        standardVersion: form.standardVersion.trim(),
        risks: form.risks.split(/\n|[,，]/).map((item) => item.trim()).filter(Boolean),
        artifactStorageKey: upload.artifactStorageKey,
        artifactSizeBytes: upload.artifactSizeBytes,
        artifactSha256: upload.artifactSha256,
        downloadUrl: upload.downloadUrl,
      });
      const version = created.tool.versions.find((item) => item.version === form.version.trim());
      if (!version) throw new Error("版本已登记，但没有读取到对应版本");
      await publishAdminToolVersion(tool.id, version.id);
      router.push(`/admin/tools/${tool.slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发布失败");
    } finally {
      setBusy(false);
    }
  }

  const checks = [
    ["文件命名", file ? "通过" : "等待文件", Boolean(file)],
    ["压缩格式", file?.name.toLowerCase().endsWith(".zip") ? "ZIP" : "仅支持 ZIP", Boolean(file?.name.toLowerCase().endsWith(".zip"))],
    ["文件大小", file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "单包上限 20GB", Boolean(file)],
    ["企业病毒扫描", "尚未接入，不作为通过依据", false],
    ["哈希校验", upload?.artifactSha256 ? "SHA-256 已记录" : "上传时计算", Boolean(upload?.artifactSha256)],
    ["必要文件预检", upload ? upload.accepted ? "通过" : `${requiredFindings.length} 项缺失` : "等待上传", Boolean(upload?.accepted)],
    ["目录结构预检", upload ? upload.accepted ? "通过" : "需要修正" : "等待上传", Boolean(upload?.accepted)],
  ] as const;

  return <main className={`${styles.page} ${styles.uploadPage}`}>
    <header className={styles.pageHeading}>
      <div><h1>上传新工具</h1><p>平台只负责接收、自动检查、建档与发布，不在线修改工具代码。</p></div>
      <div className={styles.headingActions}>
        <a href="/demo-assets/tool-template.zip" download><DownloadSimple/>下载生产模板</a>
        <Link href="/admin/standards"><FileText/>查看生产准则</Link>
      </div>
    </header>
    <UploadSteps step={step}/>
    {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}

    {step === 1 ? <section className={styles.uploadWorkspace}>
      <div className={styles.uploadMain}>
        <section className={styles.uploadBlock}>
          <header><div><strong>1. 上传工具包</strong><p>支持 ZIP 分片续传，当前单包及解压后体积上限均为 20GB。</p></div></header>
          <label className={`${styles.uploadDrop} ${file ? styles.uploadSelected : ""}`}>
            <input type="file" accept=".zip,application/zip" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}/>
            {file ? <>
              <Package/>
              <span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · 准备上传</small></span>
              <button type="button" aria-label="移除文件" onClick={(event) => { event.preventDefault(); chooseFile(null); }}><X/></button>
            </> : <>
              <UploadSimple/>
              <span><strong>选择 ZIP 文件或拖入此处</strong><small>必须符合 {productionStandard.version} 并包含全部核心文件</small></span>
            </>}
          </label>
          {busy ? <progress className={styles.nativeProgress} max={100} value={uploadProgress}/>: null}
          <p className={styles.uploadBoundary}><CheckCircle/>每 8MB 保存一个分片，断线后可补传缺失分片，完成后校验大小和 SHA-256。</p>
        </section>
        <section className={styles.uploadBlock}>
          <header><div><strong>2. 选择上传类型</strong><p>类型决定是否需要关联来源工具和具体版本。</p></div></header>
          <div className={styles.uploadModes}>
            {selectedModes.map(([value, label, note]) =>
              <label className={mode === value ? styles.uploadModeActive : undefined} key={value}>
                <input type="radio" checked={mode === value} onChange={() => changeMode(value)}/>
                <span><strong>{label}</strong><small>{note}</small></span>
              </label>
            )}
          </div>
          {mode !== "new" ? <div className={styles.sourceSelection}>
            <label>关联主工具<select value={targetId} onChange={(event) => { setTargetId(event.target.value); setSourceVersionId(""); }}><option value="">请选择工具</option>{tools.filter((tool) => !tool.parent).map((tool) => <option value={tool.id} key={tool.id}>{tool.name}</option>)}</select></label>
            {mode === "derived" ? <label>来源版本<select value={sourceVersionId} onChange={(event) => setSourceVersionId(event.target.value)}><option value="">请选择来源版本</option>{sourceVersions.map((version) => <option value={version.id} key={version.id}>{version.version} · {statusText[version.status]}</option>)}</select></label> : null}
          </div> : null}
        </section>
        <section className={styles.uploadBlock}>
          <header><div><strong>3. 包内必须包含（缺一不可）</strong><p>完整清单以当前生产准则为准。</p></div></header>
          <div className={styles.requiredFiles}>{requiredToolFiles.map(([path]) => <span key={path}><FileText/><strong>{path}</strong><CheckCircle/></span>)}</div>
          <small>完整清单与规范要求，请参阅 <Link href="/admin/standards">《生产准则》</Link>。</small>
        </section>
      </div>
      <aside className={styles.uploadAside}>
        <section className={styles.uploadBlock}>
          <header><div><strong>上传前检查</strong><p>上传完成后自动执行静态检查。</p></div></header>
          <div className={styles.preflightList}>
            {checks.map(([label, note, passed]) =>
              <span key={label}><strong>{label}</strong><small>{note}</small>{passed ? <CheckCircle className={styles.passIcon}/> : <Clock/>}</span>
            )}
          </div>
        </section>
        <section className={styles.uploadBlock}>
          <header><div><strong>不达标怎么处理</strong></div></header>
          <ol><li>平台只列出缺失项与完成标准，不在线修改工具。</li><li>下载检查结果，带回本地 Agent 修正。</li><li>修正完成后重新上传，再次执行自动检查。</li></ol>
          <a href="/demo-assets/FIX_PROMPT.md" download><DownloadSimple/>下载修正提示词模板</a>
        </section>
      </aside>
    </section> : null}

    {step === 2 ? <section className={styles.checkResultWorkspace}>
      <section className={styles.resultSummary}>
        {upload?.accepted ? <CheckCircle/> : <XCircle/>}
        <div><h2>{upload?.accepted ? "自动检查通过" : "自动检查未通过"}</h2><p>{upload?.accepted ? "文件已保存并记录哈希，可以继续补充平台资料。" : "平台不会在线修改，请按缺失项带回本地 Agent 修正后重新上传。"}</p></div>
      </section>
      <div className={styles.findingList}>
        {upload?.findings.length ? upload.findings.map((finding) =>
          <article key={finding.id}>{finding.level === "required" ? <XCircle/> : finding.level === "risk" ? <WarningCircle/> : <Info/>}<div><strong>{finding.title}</strong><p>{finding.completion}</p></div><span>{finding.level === "required" ? "必须修复" : finding.level === "risk" ? "风险" : "建议"}</span></article>
        ) : <article><CheckCircle/><div><strong>目录、安全、说明与生产标准检查通过</strong><p>没有发现必须修复项。</p></div><span>通过</span></article>}
      </div>
      {!upload?.accepted ? <div className={styles.resultActions}><button onClick={() => { setStep(1); chooseFile(null); }}>重新选择文件</button>{upload?.fixPrompt ? <><button onClick={() => void copyFixPrompt()}>{fixCopied ? <Check/> : <FileText/>}{fixCopied ? "修正提示词已复制" : "复制修正提示词"}</button><a href={`data:text/markdown;charset=utf-8,${encodeURIComponent(upload.fixPrompt)}`} download="FIX_PROMPT.md"><DownloadSimple/>下载本次修正提示词</a></> : null}</div> : null}
    </section> : null}

    {step === 3 ? <section className={styles.metadataForm}>
      <header><div><h2>填写工具资料</h2><p>资料用于平台展示、检索和 AI 推荐；不会修改 ZIP 内的工具代码。</p></div></header>
      {mode === "version" ? <p className={styles.existingTarget}><Package/>正在为 <strong>{targetTool?.name}</strong> 登记新版本。</p> : null}
      <div className={styles.metadataGrid}>
        {mode !== "version" ? <>
          <label>工具名称<input value={form.name} onChange={(event) => setField("name", event.target.value)}/></label>
          <label>工具标识<input value={form.slug} onChange={(event) => setField("slug", event.target.value.toLowerCase())} placeholder="pdf-content-extractor"/></label>
          <label className={styles.fullField}>能解决的问题<textarea value={form.problem} onChange={(event) => setField("problem", event.target.value)}/></label>
          <label className={styles.fullField}>使用效果<textarea value={form.result} onChange={(event) => setField("result", event.target.value)}/></label>
          <label className={styles.fullField}>实现原理<textarea value={form.principle} onChange={(event) => setField("principle", event.target.value)}/></label>
          <label>工具类型<select value={form.kind} onChange={(event) => setField("kind", event.target.value as ToolKind)}><option value="executable">可执行工具</option><option value="knowledge">知识工具</option><option value="template">模板</option><option value="application">应用</option><option value="composite">组合工具</option></select></label>
          <label>业务模块<select value={form.moduleSlug} onChange={(event) => setField("moduleSlug", event.target.value)}>{taxonomy?.modules.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
          <label>功能分类<select value={form.categorySlug} onChange={(event) => setField("categorySlug", event.target.value)}>{taxonomy?.categories.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>
          <label>标签标识<input value={form.tagSlugs} onChange={(event) => setField("tagSlugs", event.target.value)} placeholder="多个标签用逗号分隔"/></label>
          {mode === "derived" ? <label className={styles.fullField}>与来源版本的差异<textarea value={form.difference} onChange={(event) => setField("difference", event.target.value)}/></label> : null}
        </> : null}
        <label>版本号<input value={form.version} onChange={(event) => setField("version", event.target.value)}/></label>
        <label>验证状态<select value={form.verification} onChange={(event) => setField("verification", event.target.value as VerificationState)}><option value="verified">已验证</option><option value="partly-verified">部分验证</option><option value="unverified">未验证</option></select></label>
        <label className={styles.fullField}>版本说明<textarea value={form.changeSummary} onChange={(event) => setField("changeSummary", event.target.value)}/></label>
        <label>生产标准版本<input value={form.standardVersion} onChange={(event) => setField("standardVersion", event.target.value)}/></label>
        <label>风险说明<input value={form.risks} onChange={(event) => setField("risks", event.target.value)} placeholder="多个风险用逗号分隔"/></label>
      </div>
    </section> : null}

    {step === 4 ? <section className={styles.confirmPanel}>
      <RocketLaunch/>
      <h2>确认发布</h2>
      <p>本人确认后立即创建不可变版本、上架并设为默认最新版本。</p>
      <dl>
        <div><dt>发布资产</dt><dd>{mode === "version" ? targetTool?.name : form.name}</dd></div>
        <div><dt>版本</dt><dd>{form.version}</dd></div>
        <div><dt>类型</dt><dd>{mode === "new" ? "新建主工具" : mode === "version" ? "现有工具新版本" : "新建衍生工具"}</dd></div>
        <div><dt>验证状态</dt><dd>{verificationText(form.verification)}</dd></div>
        <div><dt>上传文件</dt><dd>{upload?.fileName}</dd></div>
        <div><dt>校验记录</dt><dd>SHA-256 已记录</dd></div>
      </dl>
    </section> : null}

    <footer className={styles.uploadFooter}>
      <button onClick={saveDraft}><FileText/>{saved ? "草稿已保存" : "保存草稿"}</button>
      <span>{step === 1 ? "上传完成后自动检查；通过后进入资料填写。" : step === 2 && !upload?.accepted ? "请修正后重新上传。" : "当前进度已保留。"}</span>
      <button className={styles.previousButton} disabled={step === 1 || busy} onClick={() => setStep((value) => Math.max(1, value - 1))}>上一步</button>
      <button className={styles.primaryButton} disabled={busy || (step === 1 && !file) || (step === 2 && !upload?.accepted)} onClick={() => void advance()}>
        {busy ? step === 1 ? "正在上传并检查…" : "正在发布…" : step === 4 ? "本人确认，立即发布" : step === 1 ? "下一步：自动检查" : "下一步"}
        {!busy ? <ArrowRight/> : null}
      </button>
    </footer>
  </main>;
}
