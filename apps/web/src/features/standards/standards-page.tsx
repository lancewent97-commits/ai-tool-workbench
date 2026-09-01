"use client";

import { CheckCircle, DownloadSimple, FileText, Folder, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import {
  productionStandard,
  requiredToolFiles,
  standardDownloads,
} from "./standards-data";
import styles from "./standards-page.module.css";

export function StandardsPage(){const [active,setActive]=useState(0);const sections=["开始前先看","必须包含的文件","身份与来源","输入输出与入口","修改边界","验证与完成报告","净化回传","自动检查","常见问题","版本历史"];
  return <main className={styles.page}><header><div><h1>工具生产准则</h1><p>当前标准 {productionStandard.version} · {productionStandard.status} · 新工具、新版本和衍生工具必须符合提交时的最新标准。</p></div><a href="/demo-source/tool-template/standards/TOOL_PRODUCTION_STANDARD.md" download><DownloadSimple/>下载完整准则</a><a className={styles.primary} href="/demo-assets/tool-template.zip" download><DownloadSimple/>下载标准模板</a></header>
    <div className={styles.layout}><aside className={styles.toc}><strong>本页目录</strong>{sections.map((item,index)=><a href={`#section-${index}`} onClick={()=>setActive(index)} className={active===index?styles.active:undefined} key={item}>{String(index+1).padStart(2,"0")} {item}</a>)}</aside><article className={styles.content}>
      <section id="section-0"><span className={styles.kicker}>01 · 开始前先看</span><h2>让工具可使用，也可安全地继续演化</h2><p>平台不替用户修改工具。生产标准会进入每个单工具包和组合工具包，由本地 Agent 在执行、适配、修改和回传前先读取。</p><div className={styles.principles}><div><ShieldCheck/><strong>通用</strong><span>不绑定任何特定 Agent</span></div><div><Folder/><strong>统一</strong><span>目录、命名和说明一致</span></div><div><FileText/><strong>可追溯</strong><span>版本和衍生来源明确</span></div></div></section>
      <section id="section-1"><span className={styles.kicker}>02 · 必须包含的文件</span><h2>最低完整结构</h2><div className={styles.fileTable}>{requiredToolFiles.map(([name,type,note])=><div key={name}><FileText/><strong>{name}</strong><span>{type}</span><p>{note}</p><CheckCircle/></div>)}</div></section>
      <section id="section-2"><span className={styles.kicker}>03 · 身份与来源</span><h2>每个资产都必须能追到主工具与版本</h2><p>衍生工具记录 `sourceToolId` 和 `sourceVersion`；组合工具同时记录来源关系与组成关系。两类关系不能用普通文件夹复制代替。</p><pre>{`id: pdf-education-table\nversion: 1.3.0\nsourceToolId: pdf-content-extractor\nsourceVersion: 2.3.0`}</pre></section>
      <section id="section-3"><span className={styles.kicker}>04 · 输入输出与入口</span><h2>Agent 不应猜测怎么开始</h2><p>README 和清单必须写清支持的输入、预期输出、主入口、环境、联网、权限、费用及失败处理。</p></section>
      <section id="section-4"><span className={styles.kicker}>05 · 修改边界</span><h2>先配置，再适配，最后修改</h2><ul>{["原始已发布版本保持只读","仅修改参数时保留在组合包内部","修改已有能力时形成衍生工具","目标或边界明显变化时形成新工具","所有实质变化记录原因、验证和回滚方式"].map(item=><li key={item}><CheckCircle/>{item}</li>)}</ul></section>
      <section id="section-5"><span className={styles.kicker}>06 · 验证与完成报告</span><h2>工具运行成功不等于任务成功</h2><p>分别记录运行层检查与业务层验收。允许未实际运行，但必须如实标记“未验证”，不能写成已验证。</p></section>
      <section id="section-6"><span className={styles.kicker}>07 · 净化回传</span><h2>只回传可复用工具资产</h2><p>移除业务结果、个人数据、密钥、Token、运行日志和临时缓存，保留来源、工具、规则、验证与完成报告。</p></section>
      <section id="section-7"><span className={styles.kicker}>08 · 自动检查</span><h2>三级结果只有一类会阻断</h2><div className={styles.checkLevels}><span><b>必须修复</b>阻断提交</span><span><b>风险提醒</b>允许继续但如实保留</span><span><b>优化建议</b>不影响提交</span></div></section>
      <section id="section-8"><span className={styles.kicker}>09 · 常见问题</span><h2>最常见的自动检查问题</h2>{["缺少来源版本","README 没写使用入口","没有 Agent 调整边界","完成报告与验证结果缺失"].map(item=><p className={styles.commonIssue} key={item}><WarningCircle/>{item}<span>使用右侧模板补齐后重新检查</span></p>)}</section>
      <section id="section-9"><span className={styles.kicker}>10 · 版本历史</span><h2>标准 {productionStandard.version}</h2><p>{productionStandard.publishedAt} 建立当前准入基线。旧工具保留原标准版本；新工具、新版本和新衍生工具使用提交时的最新标准。</p></section>
    </article><aside className={styles.templates}><h2>固定下载工具箱</h2><p>分别下载，均可直接交给任意本地 Agent。</p>{standardDownloads.map(([name,meta,url])=><a href={url} download key={name}><FileText/><span><strong>{name}</strong><small>{meta}</small></span><DownloadSimple/></a>)}<div><ShieldCheck/><strong>自动检查说明</strong><p>不达标时只列缺失项，不在线修复，也不把整理工作转给维护人员。</p></div></aside></div>
  </main>;
}
