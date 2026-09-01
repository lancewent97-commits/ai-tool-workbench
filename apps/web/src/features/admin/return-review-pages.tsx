"use client";

import type {
  ReturnAssetCandidate,
  ReturnReviewRecord,
} from "@ai-tool-workbench/contracts";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  DownloadSimple,
  Info,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import {
  adminReturnVersionDownloadUrl,
  decideReturnReview,
  getReturnReview,
  listAllReturnReviews,
} from "@/lib/api/admin-client";
import styles from "./return-review-pages.module.css";

const assetTypeLabel = {
  composite: "组合工具",
  derived: "衍生工具",
  new: "新工具",
} as const;

function dateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function CandidateCard({ candidate }: { candidate: ReturnAssetCandidate }) {
  return <article className={styles.candidate}>
    <div><span>{assetTypeLabel[candidate.type]}</span><strong>{candidate.name}</strong><small>{candidate.version} · {candidate.verification==="verified"?"已验证":candidate.verification==="partly-verified"?"部分验证":"未验证"}</small></div>
    <p>{candidate.reason}</p>
    <dl><div><dt>解决问题</dt><dd>{candidate.problem}</dd></div><div><dt>使用效果</dt><dd>{candidate.result}</dd></div><div><dt>发布文件</dt><dd>{candidate.artifactPath??"完整净化回传包"}</dd></div>{candidate.type==="derived"?<div><dt>来源版本</dt><dd>{candidate.sourceVersionId}</dd></div>:null}</dl>
    {candidate.risks.length?<ul>{candidate.risks.map((risk)=><li key={risk}>{risk}</li>)}</ul>:null}
  </article>;
}

export function ReturnReviewQueuePage() {
  const [items, setItems] = useState<ReturnReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(()=>{
    let active = true;
    void listAllReturnReviews().then((response)=>{
      if (active) setItems(response.items);
    }).catch((cause)=>{
      if (active) setError(cause instanceof Error?cause.message:"无法读取审核队列");
    }).finally(()=>{
      if (active) setLoading(false);
    });
    return()=>{active=false};
  },[]);

  return <main className={styles.page}>
    <header className={styles.heading}><div><span>维护工作台 / 回传审核</span><h1>待审核回传</h1><p>只审核已经通过自动检查并由上传人确认提交的版本。</p></div><div className={styles.count}><strong>{items.length}</strong><span>等待处理</span></div></header>
    <section className={styles.boundary}><Info/><div><strong>审核边界</strong><p>平台不在线整理或修改工具。发现问题请选择“不通过”并说明完成标准；通过后按回传清单自动发布。</p></div></section>
    {loading?<section className={styles.empty}><Clock/><h2>正在读取审核队列</h2></section>:error?<section className={styles.empty}><WarningCircle/><h2>暂时无法读取</h2><p>{error}</p></section>:items.length?<section className={styles.queue}>
      <div className={styles.queueHeader}><span>回传与来源</span><span>提交人</span><span>版本与检查</span><span>提交时间</span><span/></div>
      {items.map(({submission,uploader})=>{
        const version=submission.versions.at(-1);
        const risks=version?.findings.filter((finding)=>finding.level==="risk").length??0;
        return <Link href={`/admin/returns/${submission.id}`} className={styles.queueRow} key={submission.id}>
          <div><strong>{submission.name}</strong><small>来源：{submission.sourceObjectName}</small><small>凭证：{submission.sourceDownloadId}</small></div>
          <div><strong>{uploader.displayName}</strong><small>{uploader.account}</small></div>
          <div><strong>{submission.version}</strong><small>{version?.assetCandidates.length??0} 个发布候选 · {risks} 个风险</small></div>
          <time>{dateTime(version?.submittedAt??submission.updatedAt)}</time>
          <ArrowRight/>
        </Link>;
      })}
    </section>:<section className={styles.empty}><CheckCircle/><h2>当前没有待审核回传</h2><p>新提交通过自动检查后会出现在这里。</p></section>}
  </main>;
}

export function ReturnReviewDetailPage({ returnId }: { returnId: string }) {
  const [review, setReview] = useState<ReturnReviewRecord|null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<"approve"|"reject"|null>(null);
  const decisionDialogRef=useModalDialog<HTMLElement>(dialog!==null,()=>setDialog(null));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(()=>{
    let active=true;
    void getReturnReview(returnId).then((record)=>{
      if(active)setReview(record);
    }).catch((cause)=>{
      if(active)setError(cause instanceof Error?cause.message:"无法读取回传详情");
    });
    return()=>{active=false};
  },[returnId]);

  async function decide(decision:"approved"|"rejected") {
    setBusy(true);
    setError("");
    try {
      const submission=await decideReturnReview(returnId,{
        decision,
        reason:decision==="rejected"?reason:"",
      });
      setReview((current)=>current?{...current,submission}:current);
      setDialog(null);
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error?cause.message:"审核提交失败");
    } finally {
      setBusy(false);
    }
  }

  if(!review)return <main className={styles.page}><Link className={styles.back} href="/admin/returns"><ArrowLeft/>返回审核队列</Link><section className={styles.empty}><Clock/><h1>{error||"正在读取回传详情"}</h1></section></main>;
  const {submission,uploader}=review;
  const version=submission.versions.at(-1);
  const required=version?.findings.filter((finding)=>finding.level==="required")??[];
  const risks=version?.findings.filter((finding)=>finding.level==="risk")??[];
  const suggestions=version?.findings.filter((finding)=>finding.level==="suggestion")??[];
  const decided=submission.state!=="reviewing";

  return <main className={styles.page}>
    <Link className={styles.back} href="/admin/returns"><ArrowLeft/>返回审核队列</Link>
    <header className={styles.detailHeading}><div><span>{submission.state==="reviewing"?"待人工审核":submission.state==="published"?"已通过并发布":"审核未通过"}</span><h1>{submission.name}</h1><p>{uploader.displayName}（{uploader.account}）提交 · {dateTime(version?.submittedAt??submission.updatedAt)}</p></div>{version?.retained?<a href={adminReturnVersionDownloadUrl(submission.id,version.id)} download><DownloadSimple/>下载当前回传包</a>:null}</header>
    {error?<section className={styles.error}><WarningCircle/><span>{error}</span></section>:null}
    <section className={styles.facts}><div><span>来源对象</span><strong>{submission.sourceObjectName}</strong></div><div><span>来源下载凭证</span><strong>{submission.sourceDownloadId}</strong></div><div><span>锁定来源版本</span><strong>{submission.sourcePackageVersion??submission.sourceToolVersion??"未知"}</strong></div><div><span>当前回传版本</span><strong>{submission.version}</strong></div><div><span>历史上传</span><strong>{submission.versions.length} 个版本</strong></div></section>
    <div className={styles.detailGrid}>
      <section className={styles.content}>
        <article className={styles.checkResult}><div><h2>自动检查结果</h2><span>{required.length} 必须修复 · {risks.length} 风险 · {suggestions.length} 建议</span></div>{required.length?<p className={styles.blocked}>当前仍有必须修复项，不能通过审核。</p>:<p className={styles.passed}><CheckCircle/>自动检查已通过；人工审核仍需判断是否可复用、说明是否一致。</p>}{[...risks,...suggestions].map((finding)=><div className={styles.finding} key={finding.id}><strong>{finding.level==="risk"?"风险提醒":"优化建议"}：{finding.title}</strong><p>{finding.completion}</p></div>)}</article>
        <section className={styles.assets}><div><h2>将形成的工具资产</h2><span>{version?.assetCandidates.length??0} 个</span></div>{version?.assetCandidates.length?version.assetCandidates.map((candidate)=><CandidateCard candidate={candidate} key={candidate.id}/>):<p className={styles.blocked}>这是旧规则提交的记录，缺少可发布资产清单，不能直接通过。请不通过并要求上传人按当前模板重新上传。</p>}</section>
        <section className={styles.timeline}><h2>来源与过程记录</h2>{submission.events.map((event)=><div key={event.id}><span className={event.type==="published"?styles.eventPublished:event.type==="review"?styles.eventReview:undefined}>{event.type==="uploaded"?"传":event.type==="precheck"?"自":event.type==="review"?"审":"发"}</span><strong>{event.title}</strong><time>{dateTime(event.at)}</time><p>{event.detail}</p></div>)}</section>
      </section>
      <aside className={styles.decision}>
        <h2>人工审核</h2>
        <p>首期只有通过与不通过。不要在平台内修改上传文件或资产资料。</p>
        <dl><div><dt>上传人</dt><dd>{uploader.displayName}</dd></div><div><dt>当前文件</dt><dd>{version?.fileName}</dd></div><div><dt>文件状态</dt><dd>{version?.retained?"已安全保留":"已删除"}</dd></div><div><dt>发布方式</dt><dd>通过后自动上架</dd></div></dl>
        {!decided&&!version?.assetCandidates.length?<p className={styles.blocked}>缺少资产清单，只能选择“不通过”。</p>:null}
        {decided?<div className={submission.state==="published"?styles.finalApproved:styles.finalRejected}>{submission.state==="published"?<CheckCircle/>:<XCircle/>}<strong>{submission.state==="published"?"已经通过并自动发布":"审核未通过"}</strong>{submission.reviewReason?<p>{submission.reviewReason}</p>:null}{submission.assets.length?<div>{submission.assets.map((asset)=><Link href={`/tools/${asset.slug??asset.toolId}`} key={asset.toolId}>{asset.name}<ArrowRight/></Link>)}</div>:null}</div>:<><button className={styles.approve} disabled={Boolean(required.length)||!version?.assetCandidates.length} onClick={()=>setDialog("approve")}><CheckCircle/>通过并自动发布</button><button className={styles.reject} onClick={()=>setDialog("reject")}><XCircle/>不通过</button></>}
      </aside>
    </div>
    {dialog?<div className={styles.backdrop} role="presentation"><section ref={decisionDialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="decision-title">{dialog==="approve"?<><CheckCircle/><h2 id="decision-title">确认通过并自动发布？</h2><p>将创建 {version?.assetCandidates.length??0} 个正式工具资产，立即上架并成为各自默认最新版本。原回传、来源和审核记录永久保留。</p><div>{version?.assetCandidates.map((candidate)=><span key={candidate.id}>{assetTypeLabel[candidate.type]}：{candidate.name}</span>)}</div><button className={styles.approve} disabled={busy} onClick={()=>void decide("approved")}>{busy?"正在发布…":"本人确认，通过并发布"}</button></>:<><XCircle/><h2 id="decision-title">说明不通过原因</h2><p>上传人会在“我的回传”看到原因，并带回本地 Agent 修正后上传新版本。</p><textarea value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="请说明问题和达到什么程度才可通过" maxLength={2000}/><button className={styles.reject} disabled={busy||reason.trim().length<2} onClick={()=>void decide("rejected")}>{busy?"正在提交…":"确认不通过"}</button></>}<button className={styles.cancel} disabled={busy} onClick={()=>setDialog(null)}>取消</button></section></div>:null}
  </main>;
}
