"use client";

import type {
  AdminToolAssetDetail,
  AdminToolAssetSummary,
  AdminToolAssetVersion,
  ToolTaxonomy,
} from "@ai-tool-workbench/contracts";
import {
  ArrowLeft,
  CaretDown,
  CheckCircle,
  DownloadSimple,
  Eye,
  GitBranch,
  Info,
  MagnifyingGlass,
  Package,
  PencilSimple,
  Plus,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getAdminTool,
  getAdminToolBySlug,
  listAllAdminTools,
  offlineAdminTool,
  offlineAdminToolVersion,
  publishAdminTool,
  publishAdminToolVersion,
  updateAdminTool,
} from "@/lib/api/admin-client";
import { getCatalogTaxonomy } from "@/lib/api/catalog-client";
import { ErrorPanel, LoadingPanel, dateText, verificationText } from "./admin-ui";
import styles from "./asset-console.module.css";

const statusText = {
  draft: "草稿",
  published: "已上架",
  offline: "已下架",
} as const;

const eventText: Record<string, string> = {
  created: "创建工具",
  "metadata-updated": "更新工具资料",
  "version-created": "登记新版本",
  "version-published": "发布版本",
  "version-offline": "下架版本",
  "tool-published": "上架工具",
  "tool-offline": "下架工具",
  "placement-updated": "更新推荐位",
};

function toolType(tool: AdminToolAssetSummary) {
  if (tool.parent) return "衍生工具";
  return tool.kind === "composite" ? "组合工具" : "主工具";
}

function dateShort(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function taxonomyMap(taxonomy: ToolTaxonomy | null) {
  return Object.fromEntries(
    [...(taxonomy?.modules ?? []), ...(taxonomy?.categories ?? []), ...(taxonomy?.tags ?? [])]
      .map((item) => [item.slug, item.name]),
  );
}

function AssetIcon({ tool }: { tool: AdminToolAssetSummary }) {
  return <span className={styles.assetIcon}>
    {tool.parent ? <GitBranch/> : tool.kind === "composite" ? <Package/> : <ShieldCheck/>}
  </span>;
}

function StatusPill({ status }: { status: AdminToolAssetSummary["status"] }) {
  return <span className={`${styles.statusPill} ${styles[`status_${status}`]}`}>
    {status === "published" ? <CheckCircle weight="fill"/> : <WarningCircle weight="fill"/>}
    {statusText[status]}
  </span>;
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return <label className={styles.selectField}>
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, optionLabel]) =>
        <option value={optionValue} key={optionValue}>{optionLabel}</option>
      )}
    </select>
    <CaretDown/>
  </label>;
}

function LineageBoard({
  tool,
  detail,
  derived,
  onSelect,
  compact = false,
}: {
  tool: AdminToolAssetSummary;
  detail: AdminToolAssetDetail | null;
  derived: AdminToolAssetSummary[];
  onSelect?: (tool: AdminToolAssetSummary) => void;
  compact?: boolean;
}) {
  const mainVersion = detail?.latestVersion ?? tool.latestVersion ?? "尚无版本";
  return <div className={`${styles.lineageBoard} ${compact ? styles.lineageCompact : ""}`}>
    <article className={styles.lineageRoot}>
      <AssetIcon tool={tool}/>
      <div><strong>{tool.name}</strong><small>{toolType(tool)}</small></div>
      <dl>
        <div><dt>默认版本</dt><dd>{mainVersion}</dd></div>
        <div><dt>下载事件</dt><dd>{tool.downloads.toLocaleString()}</dd></div>
      </dl>
      <StatusPill status={tool.status}/>
    </article>
    <span className={styles.lineageConnector} aria-hidden="true"/>
    <div className={styles.lineageChildren}>
      {derived.length
        ? derived.map((child) =>
            <article key={child.id}>
              <AssetIcon tool={child}/>
              <div><strong>{child.name}</strong><small>{child.parent?.difference}</small></div>
              <dl>
                <div><dt>来源版本</dt><dd>{child.parent?.version ?? "—"}</dd></div>
                <div><dt>最新版本</dt><dd>{child.latestVersion ?? "—"}</dd></div>
                <div><dt>下载事件</dt><dd>{child.downloads.toLocaleString()}</dd></div>
              </dl>
              <div className={styles.cardActions}>
                <Link href={`/admin/tools/${child.slug}`}>查看详情</Link>
                {onSelect ? <button onClick={() => onSelect(child)}>在此查看</button> : null}
              </div>
            </article>
          )
        : <div className={styles.lineageEmpty}><GitBranch/><span>当前没有衍生工具</span></div>}
    </div>
  </div>;
}

export function AdminToolsPage() {
  const [items, setItems] = useState<AdminToolAssetSummary[]>([]);
  const [detail, setDetail] = useState<AdminToolAssetDetail | null>(null);
  const [taxonomy, setTaxonomy] = useState<ToolTaxonomy | null>(null);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [moduleSlug, setModuleSlug] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [tagSlug, setTagSlug] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([listAllAdminTools(), getCatalogTaxonomy()])
      .then(([assets, taxonomyResult]) => {
        if (!active) return;
        setItems(assets.items);
        setTaxonomy(taxonomyResult);
        setSelectedSlug(
          assets.items.find((tool) => tool.slug === "pdf-content-extractor")?.slug
            ?? assets.items.find((tool) => !tool.parent)?.slug
            ?? assets.items[0]?.slug
            ?? "",
        );
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取工具资产"))
      .finally(() => setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => items.filter((tool) => {
    if (tab === "main" && tool.parent) return false;
    if (tab === "derived" && !tool.parent) return false;
    if (tab === "offline" && tool.status !== "offline") return false;
    if (moduleSlug && !tool.moduleSlugs.includes(moduleSlug)) return false;
    if (categorySlug && tool.categorySlug !== categorySlug) return false;
    if (tagSlug && !tool.tagSlugs.includes(tagSlug)) return false;
    if (status && tool.status !== status) return false;
    return `${tool.name}${tool.problem}${tool.tagSlugs.join("")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  }), [categorySlug, items, moduleSlug, query, status, tab, tagSlug]);

  const ordered = useMemo(() => {
    if (tab === "derived") return filtered;
    const selectedItem = items.find((tool) => tool.slug === selectedSlug);
    const selectedRootId = selectedItem?.parent?.toolId ?? selectedItem?.id;
    const roots = filtered
      .filter((tool) => !tool.parent)
      .sort((left, right) =>
        Number(right.id === selectedRootId) - Number(left.id === selectedRootId)
      );
    return roots.flatMap((root) => [
      root,
      ...filtered.filter((tool) => tool.parent?.toolId === root.id),
    ]);
  }, [filtered, items, selectedSlug, tab]);

  const selected = items.find((tool) => tool.slug === selectedSlug)
    ?? filtered[0]
    ?? items[0];
  const derived = selected
    ? items.filter((tool) => tool.parent?.toolId === selected.id)
    : [];
  const selectedId = selected?.id;

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void getAdminTool(selectedId)
      .then((result) => {
        if (active) setDetail(result.tool);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "无法读取版本详情");
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const counts = {
    all: items.length,
    main: items.filter((tool) => !tool.parent).length,
    derived: items.filter((tool) => tool.parent).length,
    offline: items.filter((tool) => tool.status === "offline").length,
  };

  if (loading) return <main className={styles.page}><LoadingPanel text="正在读取工具资产"/></main>;
  if (error && !items.length) return <main className={styles.page}><ErrorPanel message={error}/></main>;

  return <main className={styles.page}>
    <header className={styles.pageHeading}>
      <div><h1>工具目录</h1><p>统一管理主工具、衍生工具、版本历史和默认下载关系。</p></div>
      <div className={styles.headingActions}>
        <a href="/demo-assets/tool-template.zip" download><DownloadSimple/>下载生产模板</a>
        <Link className={styles.primaryButton} href="/admin/tools/upload"><Plus/>上传新工具</Link>
      </div>
    </header>

    <section className={styles.filterBar}>
      <label className={styles.searchField}><MagnifyingGlass/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索工具名称或关键词"/></label>
      <SelectField label="生产标签" value={tagSlug} onChange={setTagSlug} options={[["", "全部标签"], ...(taxonomy?.tags.map((item) => [item.slug, item.name] as [string, string]) ?? [])]}/>
      <SelectField label="功能分类" value={categorySlug} onChange={setCategorySlug} options={[["", "全部分类"], ...(taxonomy?.categories.map((item) => [item.slug, item.name] as [string, string]) ?? [])]}/>
      <SelectField label="展示模块" value={moduleSlug} onChange={setModuleSlug} options={[["", "全部模块"], ...(taxonomy?.modules.map((item) => [item.slug, item.name] as [string, string]) ?? [])]}/>
      <SelectField label="状态" value={status} onChange={setStatus} options={[["", "全部状态"], ["published", "已上架"], ["draft", "草稿"], ["offline", "已下架"]]}/>
    </section>

    {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
    <section className={styles.directoryWorkspace}>
      <section className={styles.directoryList}>
        <nav className={styles.assetTabs}>
          {([
            ["all", "全部"],
            ["main", "主工具"],
            ["derived", "衍生工具"],
            ["offline", "已下架"],
          ] as const).map(([value, label]) =>
            <button className={tab === value ? styles.activeTab : undefined} onClick={() => setTab(value)} key={value}>
              {label}<span>{counts[value]}</span>
            </button>
          )}
        </nav>
        <div className={styles.directoryHead}><span>工具名称</span><span>默认版本</span><span>衍生</span><span>状态</span></div>
        <div className={styles.directoryRows}>
          {ordered.map((tool) =>
            <button className={`${styles.directoryRow} ${tool.parent ? styles.derivedRow : ""} ${selected?.id === tool.id ? styles.selectedRow : ""}`} onClick={() => setSelectedSlug(tool.slug)} key={tool.id}>
              <span className={styles.toolIdentity}><AssetIcon tool={tool}/><span><strong>{tool.name}</strong><small>{toolType(tool)}</small></span></span>
              <span>{tool.latestVersion ?? "—"}</span>
              <span>{tool.derivedCount || (tool.parent ? "来源" : 0)}</span>
              <StatusPill status={tool.status}/>
            </button>
          )}
          {!ordered.length ? <div className={styles.emptyState}>没有匹配的工具资产</div> : null}
        </div>
        <footer><span>共 {filtered.length} 条</span><span>第 1 / 1 页</span></footer>
      </section>

      <section className={styles.directoryDetail}>
        {selected ? <>
          <header className={styles.selectedToolHeader}>
            <span className={styles.toolIdentity}><AssetIcon tool={selected}/><span><strong>{selected.name}</strong><small>{toolType(selected)}</small></span></span>
            <span>{selected.latestVersion ?? "尚无版本"}</span>
            <StatusPill status={selected.status}/>
            <span className={styles.maintainer}>维护来源：{selected.origin.startsWith("return-") ? "用户回传" : "平台上传"}</span>
            <Link href={`/admin/tools/${selected.slug}`}>查看详情</Link>
          </header>
          <section className={styles.lineageSection}>
            <header><div><h2>版本与衍生谱系</h2><p>衍生工具直接展示，同时固定来源工具与版本。</p></div><Link href={`/admin/tools/${selected.slug}`}><GitBranch/>查看完整谱系</Link></header>
            <LineageBoard tool={selected} detail={detail} derived={derived} onSelect={(tool) => setSelectedSlug(tool.slug)} compact/>
          </section>
          <section className={styles.historySection}>
            <header><div><h2>历史版本</h2><p>默认下载始终指向最新已发布版本，旧版本记录持续保留。</p></div><Link href={`/admin/tools/upload?tool=${encodeURIComponent(selected.slug)}`}><Plus/>发布新版本</Link></header>
            <div className={styles.historyHead}><span>版本号</span><span>发布时间</span><span>变更说明</span><span>状态</span><span>操作</span></div>
            <div className={styles.historyRows}>
              {detail?.versions.map((version) =>
                <div className={styles.historyRow} key={version.id}>
                  <strong>{version.version}</strong>
                  <time>{dateShort(version.releasedAt ?? version.createdAt)}</time>
                  <span>{version.changeSummary}</span>
                  <span className={`${styles.versionState} ${styles[`version_${version.status}`]}`}>{selected.latestVersionId === version.id ? "当前版本" : statusText[version.status]}</span>
                  {version.status === "published"
                    ? <a href={`/api/backend/v1/tools/${encodeURIComponent(selected.slug)}/versions/${encodeURIComponent(version.version)}/download`} download>下载</a>
                    : <span>已保留</span>}
                </div>
              )}
              {!detail ? <div className={styles.loadingRow}>正在读取版本记录…</div> : null}
            </div>
            {detail?.versions.some((version) => version.status === "offline")
              ? <p className={styles.versionNotice}><Info/>已下架版本不会删除；平台会保留替代版本、更新版本和衍生版本提示。</p>
              : null}
          </section>
        </> : <div className={styles.emptyState}>请选择一个工具资产</div>}
      </section>
    </section>
  </main>;
}

export function AdminToolDetailPage({ slug }: { slug: string }) {
  const [tool, setTool] = useState<AdminToolAssetDetail | null>(null);
  const [derived, setDerived] = useState<AdminToolAssetSummary[]>([]);
  const [taxonomy, setTaxonomy] = useState<ToolTaxonomy | null>(null);
  const [activeTab, setActiveTab] = useState<"lineage" | "profile" | "adoption" | "changes">("lineage");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getAdminToolBySlug(slug),
      listAllAdminTools(),
      getCatalogTaxonomy(),
    ])
      .then(([detail, assets, taxonomyResult]) => {
        if (!active) return;
        if (!detail) {
          setError("没有找到这个工具资产");
          return;
        }
        setTool(detail.tool);
        setDerived(assets.items.filter((item) => item.parent?.toolId === detail.tool.id));
        setTaxonomy(taxonomyResult);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取工具详情"));
    return () => {
      active = false;
    };
  }, [slug]);

  async function mutate(key: string, action: () => Promise<{ tool: AdminToolAssetDetail }>) {
    setBusy(key);
    setError("");
    try {
      setTool((await action()).tool);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy("");
    }
  }

  function toggleTool() {
    if (!tool) return;
    if (tool.status === "published") {
      const reason = window.prompt("请说明下架原因。历史版本和下载记录会继续保留。");
      if (!reason?.trim()) return;
      void mutate("tool", () => offlineAdminTool(tool.id, reason.trim()));
    } else {
      void mutate("tool", () => publishAdminTool(tool.id));
    }
  }

  function toggleVersion(version: AdminToolAssetVersion) {
    if (!tool) return;
    if (version.status === "published") {
      const reason = window.prompt("请说明下架该版本的原因。若它是默认版本，平台会自动回退。");
      if (!reason?.trim()) return;
      void mutate(version.id, () => offlineAdminToolVersion(tool.id, version.id, reason.trim()));
    } else {
      void mutate(version.id, () => publishAdminToolVersion(tool.id, version.id));
    }
  }

  function toggleFeatured() {
    if (!tool) return;
    const nextFeatured = !tool.featured;
    void mutate("featured", () => updateAdminTool(tool.id, {
      name: tool.name,
      problem: tool.problem,
      result: tool.result,
      principle: tool.principle,
      kind: tool.kind,
      categorySlug: tool.categorySlug,
      moduleSlugs: tool.moduleSlugs,
      tagSlugs: tool.tagSlugs,
      featured: nextFeatured,
      featuredOrder: nextFeatured ? tool.featuredOrder ?? 100 : null,
    }));
  }

  if (!tool) {
    return <main className={styles.page}>
      <Link className={styles.backLink} href="/admin/tools"><ArrowLeft/>工具目录</Link>
      {error ? <ErrorPanel message={error}/> : <LoadingPanel text="正在读取工具详情"/>}
    </main>;
  }

  const names = taxonomyMap(taxonomy);
  const currentVersion = tool.versions.find((version) => version.id === tool.latestVersionId)
    ?? tool.versions[0]
    ?? null;
  const checks = currentVersion ? [
    ["文件校验值", Boolean(currentVersion.artifactSha256), currentVersion.artifactSha256 ? "SHA-256 已记录" : "缺少校验值"],
    ["生产标准", Boolean(currentVersion.standardVersion), currentVersion.standardVersion || "未登记"],
    ["版本说明", Boolean(currentVersion.changeSummary), currentVersion.changeSummary || "未填写"],
    ["下载地址", Boolean(currentVersion.downloadUrl), currentVersion.downloadUrl ? "受控下载已登记" : "未登记"],
    ["验证状态", currentVersion.verification !== "unverified", verificationText(currentVersion.verification)],
    ["风险声明", true, currentVersion.risks.length ? `${currentVersion.risks.length} 项已记录` : "已声明暂无已知风险"],
  ] as const : [];

  return <main className={styles.page}>
    <Link className={styles.backLink} href="/admin/tools"><ArrowLeft/>工具目录</Link>
    {error ? <p className={styles.inlineError} role="alert">{error}</p> : null}
    <header className={styles.detailIdentity}>
      <span className={styles.detailIcon}><AssetIcon tool={tool}/></span>
      <div><h1>{tool.name}</h1><p>{toolType(tool)} · 默认版本 {tool.latestVersion ?? "—"}</p></div>
      <StatusPill status={tool.status}/>
      <span className={styles.verifiedBadge}><CheckCircle weight="fill"/>{currentVersion ? verificationText(currentVersion.verification) : "尚无版本"}</span>
      <div className={styles.headingActions}>
        {tool.status === "published" ? <Link href={`/tools/${tool.slug}`}><Eye/>预览用户页面</Link> : null}
        <button className={styles.primaryButton} onClick={() => setActiveTab("profile")}><PencilSimple/>工具资料</button>
        <button disabled={busy === "tool" || tool.status === "draft"} onClick={toggleTool}>{busy === "tool" ? "处理中…" : tool.status === "published" ? "下架" : "重新上架"}</button>
      </div>
    </header>

    <nav className={styles.detailTabs}>
      {([
        ["lineage", "版本与衍生"],
        ["profile", "工具资料"],
        ["adoption", "采用与评价"],
        ["changes", "变更记录"],
      ] as const).map(([value, label]) =>
        <button className={activeTab === value ? styles.activeTab : undefined} onClick={() => setActiveTab(value)} key={value}>{label}</button>
      )}
    </nav>

    {activeTab === "lineage" ? <>
      <section className={styles.detailPanel}>
        <header><div><h2>版本与衍生关系</h2><p>主工具版本不可覆盖，衍生工具固定到来源版本。</p></div><Link href={`/admin/tools/upload?tool=${encodeURIComponent(tool.slug)}`}><Plus/>新增版本</Link></header>
        <LineageBoard tool={tool} detail={tool} derived={derived}/>
      </section>
      <section className={styles.detailGrid}>
        <section className={styles.detailPanel}>
          <header><div><h2>版本历史</h2><p>下架只改变可见性，不删除历史文件与记录。</p></div><Link href={`/admin/tools/upload?tool=${encodeURIComponent(tool.slug)}`}><Plus/>发布新版本</Link></header>
          <div className={styles.detailVersionHead}><span>版本</span><span>发布时间</span><span>变更摘要</span><span>验证</span><span>下载</span><span>操作</span></div>
          <div className={styles.detailVersionRows}>
            {tool.versions.map((version) =>
              <div key={version.id}>
                <strong>{version.version}<small>{tool.latestVersionId === version.id ? "当前默认" : version.source === "return" ? "回传版本" : "平台版本"}</small></strong>
                <time>{dateShort(version.releasedAt ?? version.createdAt)}</time>
                <span>{version.changeSummary}</span>
                <span className={styles.checkBadge}>{verificationText(version.verification)}</span>
                {version.status === "published"
                  ? <a href={`/api/backend/v1/tools/${encodeURIComponent(tool.slug)}/versions/${encodeURIComponent(version.version)}/download`} download><DownloadSimple/>下载</a>
                  : <span className={styles.offlineBadge}>已下架</span>}
                <button disabled={busy === version.id} onClick={() => toggleVersion(version)}>{busy === version.id ? "处理中" : version.status === "published" ? "下架" : "上架"}</button>
              </div>
            )}
          </div>
          {tool.versions.some((version) => version.status === "offline")
            ? <p className={styles.versionNotice}><Info/>下架版本会继续显示替代版本、更新版本与衍生版本提示。</p>
            : null}
        </section>
        <aside className={styles.detailStack}>
          <section className={styles.detailPanel}>
            <header><div><h2>当前版本摘要</h2><p>{currentVersion?.version ?? "尚无版本"}</p></div></header>
            <dl className={styles.summaryList}>
              <div><dt>能解决的问题</dt><dd>{tool.problem}</dd></div>
              <div><dt>使用效果</dt><dd>{tool.result}</dd></div>
              <div><dt>实现原理</dt><dd>{tool.principle}</dd></div>
              <div><dt>业务模块</dt><dd>{tool.moduleSlugs.map((item) => names[item] ?? item).join("、")}</dd></div>
              <div><dt>功能标签</dt><dd>{tool.tagSlugs.map((item) => names[item] ?? item).join("、") || "未设置"}</dd></div>
            </dl>
          </section>
          <section className={styles.detailPanel}>
            <header><div><h2>发布完整性</h2><p>只展示平台实际登记和检查到的状态。</p></div><strong className={styles.checkSummary}>{checks.filter((item) => item[1]).length} / {checks.length} 完成</strong></header>
            <div className={styles.completenessGrid}>
              {checks.map(([label, passed, note]) =>
                <span className={passed ? styles.checkPassed : styles.checkPending} title={note} key={label}>
                  {passed ? <CheckCircle weight="fill"/> : <WarningCircle weight="fill"/>}{label}
                </span>
              )}
            </div>
          </section>
          <section className={styles.detailPanel}>
            <header><div><h2>最近发布记录</h2><p>完整历史进入“变更记录”页签。</p></div><button onClick={() => setActiveTab("changes")}>查看全部</button></header>
            {tool.events.slice(0, 2).map((event) =>
              <p className={styles.recentEvent} key={event.id}><time>{dateShort(event.createdAt)}</time><strong>{eventText[event.type] ?? event.type}</strong><span>{event.reason || "系统记录"}</span></p>
            )}
          </section>
        </aside>
      </section>
    </> : null}

    {activeTab === "profile" ? <section className={styles.detailPanel}>
      <header><div><h2>工具资料</h2><p>这些事实信息用于平台展示和 AI 推荐。</p></div></header>
      <dl className={styles.profileGrid}>
        <div><dt>解决问题</dt><dd>{tool.problem}</dd></div>
        <div><dt>使用效果</dt><dd>{tool.result}</dd></div>
        <div><dt>实现原理</dt><dd>{tool.principle}</dd></div>
        <div><dt>工具类型</dt><dd>{toolType(tool)}</dd></div>
        <div><dt>业务模块</dt><dd>{tool.moduleSlugs.map((item) => names[item] ?? item).join("、")}</dd></div>
        <div><dt>功能分类</dt><dd>{tool.categorySlug ? names[tool.categorySlug] ?? tool.categorySlug : "未设置"}</dd></div>
        <div><dt>标签</dt><dd>{tool.tagSlugs.map((item) => names[item] ?? item).join("、") || "未设置"}</dd></div>
        <div><dt>资产来源</dt><dd>{tool.origin.startsWith("return-") ? "用户回传审核入库" : "平台维护上传"}</dd></div>
        <div><dt>平台推荐</dt><dd>{tool.featured ? `首批推荐 · 顺序 ${tool.featuredOrder ?? "未指定"}` : "未进入首批推荐"}</dd></div>
      </dl>
      <div className={styles.profileActions}>
        <button className={tool.featured ? undefined : styles.primaryButton} disabled={busy === "featured" || tool.status !== "published" || currentVersion?.verification === "unverified"} onClick={toggleFeatured}>
          <Sparkle/>{busy === "featured" ? "处理中…" : tool.featured ? "移出首批推荐" : "加入首批推荐"}
        </button>
        {tool.status !== "published"
          ? <small>只有已上架工具可以进入首批推荐。</small>
          : currentVersion?.verification === "unverified"
            ? <small>当前版本仍未验证，至少达到“部分验证”后才可推荐。</small>
            : <small>默认顺序为 100；后续可在推荐位管理中细调排序。</small>}
      </div>
    </section> : null}

    {activeTab === "adoption" ? <section className={styles.detailPanel}>
      <header><div><h2>采用与评价</h2><p>仅记录平台站内可观察事件，不监控本地 Agent 的真实运行。</p></div></header>
      <div className={styles.adoptionMetrics}>
        <article><small>站内下载事件</small><strong>{tool.downloads.toLocaleString()}</strong></article>
        <article><small>用户评分</small><strong>{tool.rating ?? "—"}</strong></article>
        <article><small>评价数量</small><strong>{tool.ratingCount}</strong></article>
        <article><small>衍生资产</small><strong>{tool.derivedCount}</strong></article>
      </div>
      <p className={styles.boundaryNote}><Info/>平台无法确认下载后的实际使用次数、任务成功率或部门采用情况，后续只通过用户评价与主动反馈补充。</p>
    </section> : null}

    {activeTab === "changes" ? <section className={styles.detailPanel}>
      <header><div><h2>变更记录</h2><p>创建、发布、上下架和资料更新均保留事实记录。</p></div></header>
      <div className={styles.eventTimeline}>
        {tool.events.map((event) =>
          <article key={event.id}><span/><time>{dateText(event.createdAt)}</time><strong>{eventText[event.type] ?? event.type}</strong><p>{event.reason || "系统记录"}</p></article>
        )}
      </div>
    </section> : null}
  </main>;
}
