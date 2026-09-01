"use client";

import type { AdminToolAssetSummary } from "@ai-tool-workbench/contracts";
import { ArrowRight, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { listAllAdminTools } from "@/lib/api/admin-client";
import styles from "./maintenance-pages.module.css";

type Filter = "全部版本" | "已发布" | "已下架" | "有更新";

function matchesFilter(tool: AdminToolAssetSummary, filter: Filter) {
  if (filter === "已发布") return tool.status === "published";
  if (filter === "已下架") return tool.status === "offline";
  if (filter === "有更新") return tool.versionCount > 1;
  return true;
}

export function AdminVersionsPage() {
  const [filter, setFilter] = useState<Filter>("全部版本");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminToolAssetSummary[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void listAllAdminTools()
      .then((result) => { if (active) setItems(result.items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "无法读取版本"); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => items
    .filter((tool) => matchesFilter(tool, filter))
    .filter((tool) => `${tool.name}${tool.slug}${tool.latestVersion ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [items, filter, query]);

  return <main className={styles.page}>
    <header className={styles.pageHeader}>
      <div><h1>工具版本</h1><p>查看主工具与衍生工具的版本状态、更新关系和历史记录。</p></div>
      <Link className={styles.primaryButton} href="/admin/tools/upload"><Plus/>上传新版本</Link>
    </header>
    {error?<p className={styles.inlineError} role="alert">{error}</p>:null}
    <div className={styles.toolbar}>
      <label className={styles.search}><MagnifyingGlass/><input aria-label="搜索工具或版本" placeholder="搜索工具或版本" value={query} onChange={(event)=>setQuery(event.target.value)}/></label>
      {(["全部版本","已发布","已下架","有更新"] as const).map((item)=><button className={filter===item?styles.activeFilter:undefined} onClick={()=>setFilter(item)} key={item}>{item}</button>)}
    </div>
    <section className={styles.table} style={{ "--table-columns": "minmax(260px,1.6fr) 120px 120px 150px 170px 24px" } as React.CSSProperties}>
      <div className={`${styles.tableRow} ${styles.tableHead}`}>{["工具","默认版本","状态","有效下载事件","更新时间",""].map((header)=><span key={header}>{header}</span>)}</div>
      {visible.map((tool)=><Link className={styles.tableRow} href={`/admin/tools/${tool.slug}`} key={tool.id}>
        <span className={styles.primaryCell}><strong>{tool.name}</strong><small>{tool.parent?"衍生工具":tool.kind==="composite"?"组合工具":"主工具"} · 共 {tool.versionCount} 版</small></span>
        <span>{tool.latestVersion??"尚无版本"}</span>
        <span className={`${styles.status} ${tool.status==="published"?styles.status_green:styles.status_gray}`}>{tool.status==="published"?"已发布":tool.status==="offline"?"已下架":"草稿"}</span>
        <span>{tool.downloads.toLocaleString()} 次</span>
        <span>{new Date(tool.updatedAt).toLocaleString("zh-CN",{hour12:false})}</span>
        <span><ArrowRight/></span>
      </Link>)}
    </section>
    {!visible.length?<p className={styles.emptyText}>没有匹配的工具版本。</p>:null}
  </main>;
}
