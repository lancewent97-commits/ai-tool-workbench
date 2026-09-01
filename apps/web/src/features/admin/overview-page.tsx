"use client";

import type {
  AdminAiStatus,
  AdminToolAssetSummary,
  ReturnReviewRecord,
  ToolCatalogItem,
  ToolTaxonomy,
} from "@ai-tool-workbench/contracts";
import {
  ArrowRight,
  Brain,
  Clock,
  FolderOpen,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getAdminAiStatus, listAllAdminTools, listAllReturnReviews } from "@/lib/api/admin-client";
import { getCatalogTaxonomy, listAllCatalogTools } from "@/lib/api/catalog-client";
import { ErrorPanel, LoadingPanel, PageHeader, dateText } from "./admin-ui";
import styles from "./platform-pages.module.css";

type OverviewData = {
  tools: ToolCatalogItem[];
  adminTools: AdminToolAssetSummary[];
  returns: ReturnReviewRecord[];
  taxonomy: ToolTaxonomy;
  ai: AdminAiStatus;
};

export function AdminOverviewPage() {
  const [data,setData]=useState<OverviewData|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    let active=true;
    void Promise.all([
      listAllCatalogTools(),
      listAllAdminTools(),
      listAllReturnReviews(),
      getCatalogTaxonomy(),
      getAdminAiStatus(),
    ]).then(([tools,adminTools,returns,taxonomy,ai])=>{
      if(active)setData({tools:tools.items,adminTools:adminTools.items,returns:returns.items,taxonomy,ai});
    }).catch((cause)=>{
      if(active)setError(cause instanceof Error?cause.message:"无法读取维护总览");
    });
    return()=>{active=false};
  },[]);

  return <main className={styles.page}>
    <PageHeader eyebrow="维护系统 / 今日工作" title="今日工作" description="先处理影响发布和用户使用的事项，再查看平台状态。"/>
    {!data?error?<ErrorPanel message={error}/>:<LoadingPanel text="正在汇总平台状态"/>:<>
      <section className={styles.metrics}>
        <Link href="/admin/returns"><span><Clock/></span><div><strong>{data.returns.length}</strong><small>待审核回传</small></div><ArrowRight/></Link>
        <Link href="/admin/publishing"><span><FolderOpen/></span><div><strong>{data.adminTools.filter(tool=>tool.status==="draft").length}</strong><small>待发布工具</small></div><ArrowRight/></Link>
        <Link href="/admin/tools"><span><FolderOpen/></span><div><strong>{data.tools.length}</strong><small>已上架工具</small></div><ArrowRight/></Link>
        <Link href="/admin/ai"><span><Brain/></span><div><strong>{data.ai.keyConfigured?"正常":"待配置"}</strong><small>AI 服务状态</small></div><ArrowRight/></Link>
      </section>
      <section className={styles.overviewGrid}>
        <article className={styles.panel}>
          <header><div><h2>今日优先队列</h2><p>具体处理仍回到对应业务页面完成</p></div></header>
          <div className={styles.priorityQueue}>
            <Link href="/admin/returns"><span className={styles.reviewMark}><Clock/></span><div><strong>处理待审核回传</strong><small>{data.returns.length} 项 · 已通过自动预检查</small></div><b>立即处理</b><ArrowRight/></Link>
            <Link href="/admin/publishing"><span className={styles.assetMark}><FolderOpen/></span><div><strong>确认待发布工具</strong><small>{data.adminTools.filter(tool=>tool.status==="draft").length} 个工具仍为草稿状态</small></div><b>本周</b><ArrowRight/></Link>
            <Link href="/admin/ai"><span className={styles.assetMark}><Brain/></span><div><strong>检查 AI 服务与约束</strong><small>{data.ai.provider} · {data.ai.model}</small></div><b>{data.ai.keyConfigured?"正常":"待配置"}</b><ArrowRight/></Link>
          </div>
        </article>
        <article className={styles.panel}>
          <header><div><h2>最近发布</h2><p>平台中的最新工具资产</p></div><Link href="/admin/tools">查看全部<ArrowRight/></Link></header>
          <div className={styles.compactList}>{data.tools.slice(0,5).map((tool)=><Link href={`/admin/tools/${tool.slug}`} key={tool.id}><span className={styles.assetMark}>{tool.kind==="composite"?"组":"工"}</span><div><strong>{tool.name}</strong><small>{tool.latestVersion.version} · {tool.modules[0]?.name??"未分类"}</small></div><time>{dateText(tool.publishedAt).split(" ")[0]}</time><ArrowRight/></Link>)}</div>
        </article>
      </section>
      <section className={styles.healthStrip}>
        <div><span className={styles.onlineDot}/><strong>AI 服务</strong><p>{data.ai.provider} · {data.ai.model}</p></div>
        <div><span className={styles.onlineDot}/><strong>推荐约束</strong><p>候选限制与版本保护已启用</p></div>
        <div><span className={styles.onlineDot}/><strong>上下文</strong><p>压缩与历史恢复已启用</p></div>
        <Link href="/admin/ai">查看 AI 服务<ArrowRight/></Link>
      </section>
    </>}
  </main>;
}
