"use client";

import type { AdminAiStatus, ToolTaxonomy } from "@ai-tool-workbench/contracts";
import {
  ArrowRight,
  Brain,
  CirclesFour,
  Code,
  Database,
  GitBranch,
  Lock,
  ShieldCheck,
  Tag,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getAdminAiStatus } from "@/lib/api/admin-client";
import { getCatalogTaxonomy } from "@/lib/api/catalog-client";
import { ErrorPanel, LoadingPanel, PageHeader } from "./admin-ui";
import styles from "./platform-pages.module.css";

const promptNames = {
  "requirement-understanding": "需求理解",
  recommendation: "工具推荐与组包",
  "context-compression": "上下文压缩",
} as const;

export function AdminContentPage() {
  const [taxonomy,setTaxonomy]=useState<ToolTaxonomy|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    void getCatalogTaxonomy().then((response)=>{if(active)setTaxonomy(response)}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"无法读取内容结构")});
    return()=>{active=false};
  },[]);
  const groups=taxonomy?[
    {title:"业务模块",description:"决定工具出现在哪些业务工作台区块",icon:CirclesFour,items:taxonomy.modules},
    {title:"功能分类",description:"用于工具目录筛选和功能归类",icon:Database,items:taxonomy.categories},
    {title:"工具标签",description:"用于关键词筛选、场景和能力表达",icon:Tag,items:taxonomy.tags},
  ]:[];
  return <main className={styles.page}>
    <PageHeader eyebrow="维护系统 / 资产与内容" title="内容与标签" description="统一查看工具业务模块、功能分类和标签。当前数据直接来自真实工具目录。"/>
    {!taxonomy?error?<ErrorPanel message={error}/>:<LoadingPanel text="正在读取内容结构"/>:<>
      <section className={styles.notice}><ShieldCheck/><div><strong>维护边界</strong><p>分类和标签可以作为平台资料独立维护；修改不会进入工具包内部。首版先展示真实配置，创建、重命名和停用接口将在下一批接入。</p></div></section>
      <section className={styles.taxonomyGrid}>{groups.map((group)=>{
        const Icon=group.icon;
        return <article className={styles.taxonomyCard} key={group.title}><header><span><Icon/></span><div><h2>{group.title}</h2><p>{group.description}</p></div><strong>{group.items.length}</strong></header><div>{group.items.map((item)=><p key={item.id}><span>{item.name}</span><small>{item.slug}</small><b>#{item.sortOrder}</b></p>)}</div></article>;
      })}</section>
      <section className={styles.modulePreview}><div><h2>用户侧展示关系</h2><p>模块决定入口，分类和标签负责筛选；一个工具可以出现在多个业务模块。</p></div><div>{taxonomy.modules.map((module)=><span key={module.id}>{module.name}<ArrowRight/></span>)}<Link href="/tools">查看工具工作台</Link></div></section>
    </>}
  </main>;
}

export function AdminAiPage() {
  const [status,setStatus]=useState<AdminAiStatus|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    void getAdminAiStatus().then((response)=>{if(active)setStatus(response)}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"无法读取 AI 状态")});
    return()=>{active=false};
  },[]);
  return <main className={styles.page}>
    <PageHeader
      eyebrow="维护系统 / AI 管理"
      title="AI 服务"
      description="查看模型连接、运行约束、上下文机制与当前生效版本；密钥永远不在页面中展示。"
      action={<div className={styles.headerActions}><Link href="/admin/ai/evaluation">评测与监控</Link><Link href="/admin/ai/prompts">Prompt 管理<ArrowRight/></Link></div>}
    />
    {!status?error?<ErrorPanel message={error}/>:<LoadingPanel text="正在读取 AI 运行状态"/>:<>
      <section className={styles.aiStatus}>
        <article><span className={styles.onlineDot}/><div><small>当前 Provider</small><strong>{status.provider}</strong><p>{status.model}</p></div></article>
        <article><ShieldCheck/><div><small>数据模式</small><strong>{status.externalDataMode==="sanitized-test"?"脱敏测试":"内部/Mock"}</strong><p>{status.keyConfigured?"开发密钥已配置":"未暴露外部密钥"}</p></div></article>
        <article><Brain/><div><small>生效 Prompt</small><strong>{status.prompts.length} 个</strong><p>全部具有明确版本</p></div></article>
        <article><Database/><div><small>上下文压缩</small><strong>{status.constraints.contextCompression?"已启用":"未启用"}</strong><p>保留确认事实和工具版本</p></div></article>
      </section>
      <section className={styles.aiGrid}>
        <article className={styles.panel}><header><div><h2>生效 Prompt</h2><p>运行时实际加载的版本，不是页面演示数据</p></div><span className={styles.readOnly}><Lock/>只读保护</span></header><div className={styles.promptList}>{status.prompts.map((prompt)=><div key={prompt.key}><span><Code/></span><div><strong>{promptNames[prompt.key]}</strong><small>{prompt.key}</small></div><b>{prompt.version}</b><em>生效中</em></div>)}</div></article>
        <article className={styles.panel}><header><div><h2>平台约束</h2><p>不能由单次对话绕过</p></div></header><dl className={styles.constraintList}><div><dt>关键澄清轮次</dt><dd>最多 {status.constraints.maxClarificationRounds} 轮</dd></div><div><dt>每轮问题数量</dt><dd>最多 {status.constraints.maxQuestionsPerRound} 个</dd></div><div><dt>推荐候选保护</dt><dd>{status.constraints.recommendationGuard?"已启用":"未启用"}</dd></div><div><dt>用户手选工具</dt><dd>禁止静默删除</dd></div><div><dt>外部模型数据</dt><dd>仅允许脱敏测试</dd></div></dl></article>
      </section>
      <section className={styles.releaseFlow}><header><GitBranch/><div><h2>Prompt 发布机制</h2><p>在线编辑只有在版本仓库、自动评测和回滚真正接通后才开放。</p></div></header><ol><li><span>1</span><strong>创建草稿</strong><small>新版本不影响线上</small></li><li><span>2</span><strong>自动评测</strong><small>需求、压缩、推荐用例</small></li><li><span>3</span><strong>人工确认</strong><small>检查约束和输出契约</small></li><li><span>4</span><strong>发布与回滚</strong><small>保留完整历史版本</small></li></ol><p className={styles.flowBoundary}><Lock/>当前运行时 Prompt 来自受版本控制的代码目录；本页不会提供一个直接改线上系统 Prompt 的文本框。</p></section>
    </>}
  </main>;
}
