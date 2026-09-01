"use client";

import type { DownloadKind, DownloadRecord, ReturnRecord, ReturnSubmission, ReturnState, TaskStage } from "@ai-tool-workbench/contracts";
import { ArrowLeft, ArrowRight, ArrowSquareOut, ArrowsDownUp, CheckCircle, Clock, Copy, DownloadSimple, FilePdf, FileText, Folder, Info, LockKey, MagnifyingGlass, Package, Plus, SpeakerHigh, Star, UploadSimple, WarningCircle, Waveform, Wrench, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getReturn, precheckReturn, resumeReturnPrecheck, returnVersionDownloadUrl, submitDownloadFeedback, submitReturn, toReturnSubmission, updateReturnListing } from "@/lib/api/workspace-client";
import { copyText, downloadFile } from "@/lib/download";
import { useWorkbench } from "@/lib/workbench-store";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import styles from "./personal-pages.module.css";

function PageHeading({title,note,action}:{title:string;note:string;action?:React.ReactNode}){return <header className={styles.heading}><div><h1>{title}</h1><p>{note}</p></div>{action}</header>}
const stageLabel:Record<TaskStage,string>={clarifying:"需求梳理中","brief-review":"任务说明待确认",recommended:"方案已生成","package-review":"工具包待确认",ready:"工具包已生成",completed:"已完成"};
const stageRoute=(id:string,stage:TaskStage,packageVersionIds:string[]=[])=>stage==="clarifying"?`/tasks/${id}`:stage==="brief-review"?`/tasks/${id}?mode=brief`:stage==="recommended"?`/tasks/${id}?mode=recommend`:stage==="package-review"?`/packages/drafts/ai-${id}/confirm`:stage==="completed"?`/tasks/${id}?mode=result`:stage==="ready"&&packageVersionIds.at(-1)?`/packages/${packageVersionIds.at(-1)}/ready`:`/tasks/${id}?mode=recommend`;

export function MyTasks(){
  type Filter = "all" | "action" | "progress" | "generated" | "completed";
  const router=useRouter();
  const search=useSearchParams();
  const {state,loadMoreTasks}=useWorkbench();
  const [loadingMore,setLoadingMore]=useState(false);
  const [query,setQuery]=useState(search.get("q")??"");
  const [filter,setFilter]=useState<Filter>(()=>["all","action","progress","generated","completed"].includes(search.get("filter")??"")?search.get("filter") as Filter:"all");
  const [latest,setLatest]=useState(search.get("order")!=="oldest");
  useEffect(()=>{
    const params=new URLSearchParams(search.toString());
    if(query)params.set("q",query);else params.delete("q");
    if(filter!=="all")params.set("filter",filter);else params.delete("filter");
    if(latest)params.delete("order");else params.set("order","oldest");
    const next=params.toString();
    if(next!==search.toString())router.replace(`/me/tasks${next?`?${next}`:""}`,{scroll:false});
  },[filter,latest,query,router,search]);
  const matchesFilter=(stage:TaskStage,needsAction:boolean)=>{
    if(filter==="all")return true;
    if(filter==="action")return needsAction;
    if(filter==="progress")return ["clarifying","brief-review","recommended","package-review"].includes(stage);
    if(filter==="generated")return stage==="ready";
    return stage==="completed";
  };
  const visible=state.tasks
    .filter(task=>`${task.name}${task.goal}`.toLowerCase().includes(query.toLowerCase()))
    .filter(task=>matchesFilter(task.stage,task.needsUserAction))
    .sort((a,b)=>latest?b.updatedAt.localeCompare(a.updatedAt):a.updatedAt.localeCompare(b.updatedAt));
  const actionItems=state.tasks.filter(task=>task.needsUserAction);
  const counts:Record<Filter,number>={
    all:state.taskTotal,
    action:actionItems.length,
    progress:state.tasks.filter(task=>["clarifying","brief-review","recommended","package-review"].includes(task.stage)).length,
    generated:state.tasks.filter(task=>task.stage==="ready").length,
    completed:state.tasks.filter(task=>task.stage==="completed").length,
  };
  const tabs:Array<[Filter,string]>=[["all","全部"],["action","需要我处理"],["progress","进行中"],["generated","已生成工具包"],["completed","已完成"]];
  return <main className={`${styles.page} ${styles.tasksPage}`}>
    <PageHeading title="我的任务" note="查看并继续你的 AI 组包任务" action={<div className={styles.headingActions}><label className={styles.headingSearch}><MagnifyingGlass/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索任务名称或目标"/></label><Link className={styles.primaryButton} href="/"><Plus/>新建任务</Link></div>}/>
    <section className={styles.taskToolbar}>
      <div className={styles.taskTabs}>{tabs.map(([id,label])=><button className={filter===id?styles.taskTabActive:undefined} onClick={()=>setFilter(id)} key={id}>{label}<span>{counts[id]}</span></button>)}</div>
      <button className={styles.taskSort} onClick={()=>setLatest(value=>!value)}><ArrowsDownUp/>{latest?"最近更新":"最早更新"}</button>
    </section>
    <section className={styles.actionPanel}>
      <div className={styles.sectionHeader}><h2>需要我处理 <span>({actionItems.length})</span></h2></div>
      {actionItems.map(task=><article className={styles.actionRow} key={task.id}>
        <span className={task.stage==="package-review"?styles.actionIconGreen:styles.actionIcon}><ClipboardIcon stage={task.stage}/></span>
        <div className={styles.actionIdentity}><strong>{task.name}</strong><p>{task.goal}</p></div>
        <div className={styles.actionState}><span>{task.stage==="brief-review"?"确认任务说明":"确认工具包"}</span><p>{task.stage==="brief-review"?"需求已梳理，等待你检查任务说明":"工具已选好，等待确认联网提醒"}</p></div>
        <time>{formatTaskTime(task.updatedAt)}</time>
        <Link href={stageRoute(task.id,task.stage,task.packageVersionIds)}>继续确认</Link>
      </article>)}
    </section>
    <section className={styles.allTasksPanel}>
      <div className={styles.sectionHeader}><h2>所有任务 <span>({visible.length})</span></h2></div>
      {visible.map(task=><Link className={styles.allTaskRow} href={stageRoute(task.id,task.stage,task.packageVersionIds)} key={task.id}>
        <span className={task.stage==="completed"?styles.taskFileOrange:task.stage==="ready"?styles.taskFileGreen:styles.taskFile}><FileText/></span>
        <div className={styles.taskIdentity}><strong>{task.name}</strong><small>{task.goal}</small></div>
        <span className={taskStatusClass(task.stage)}>{stageLabel[task.stage]}</span>
        <span className={styles.taskProgress}>{task.stage==="brief-review"?"已梳理需求，待完善细节":task.stage==="recommended"?"方案已生成，待查看":`已生成 ${task.packageVersionIds.length} 个工具包`}</span>
        <time>{new Date(task.updatedAt).toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-")}</time>
        <span className={styles.rowAction}>{task.stage==="ready"?"重新下载":task.stage==="completed"?"查看结果":"继续任务"}</span>
      </Link>)}
      {!visible.length?<p className={styles.emptyLine}>没有符合当前条件的任务。</p>:null}
      {state.tasks.length<state.taskTotal?<button className={styles.loadMoreButton} disabled={loadingMore} onClick={()=>{setLoadingMore(true);void loadMoreTasks().finally(()=>setLoadingMore(false))}}>{loadingMore?"正在加载…":`加载更多任务（${state.tasks.length}/${state.taskTotal}）`}</button>:null}
    </section>
    <p className={styles.pageHint}><Info/>点击任务会恢复当时的需求、对话、任务说明和方案状态，不会重新开始。</p>
  </main>;
}

function ClipboardIcon({stage}:{stage:TaskStage}) {
  return stage==="package-review"?<Folder/>:<Clock/>;
}

function formatTaskTime(value:string) {
  const date=new Date(value);
  const today=new Date();
  const sameDay=date.getFullYear()===today.getFullYear()&&date.getMonth()===today.getMonth()&&date.getDate()===today.getDate();
  return sameDay?`今天 ${date.toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false})}`:date.toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).replaceAll("/","-");
}

function taskStatusClass(stage:TaskStage) {
  if(stage==="completed")return styles.taskStatusDone;
  if(stage==="recommended")return styles.taskStatusGreen;
  return styles.taskStatus;
}

const kindLabel:Record<DownloadKind,string>={tool:"单工具","ai-package":"AI组合包","manual-package":"手动组合包",historical:"历史版本",derived:"衍生工具"};
function packageVersionLabel(entry:DownloadRecord){
  if(entry.packageVersion)return entry.packageVersion;
  const legacy=entry.packageVersionId?.match(/-v(\d+)$/);
  return legacy?`v${legacy[1]}`:entry.packageVersionId?"历史版本":"v1";
}
function toolVersionLabel(entry:DownloadRecord){
  if(entry.toolVersion)return entry.toolVersion;
  const detail=entry.lockedToolDetails?.[0];
  if(detail?.version)return detail.version;
  return "未知版本";
}
function toolVersionState(entry:DownloadRecord){
  const locked=toolVersionLabel(entry);
  const status=entry.lockedToolStatuses?.[0];
  if(status?.status==="offline"||status?.status==="missing")return `${locked} · 已下架，原版本仍可下载`;
  if(status?.latestVersion&&status.latestVersion!==locked)return `${locked} · 可更新至 ${status.latestVersion}`;
  if(status?.derivedCount)return `${locked} · 有 ${status.derivedCount} 个衍生版本`;
  return `${locked} · 当前锁定版本`;
}
export function MyDownloads(){
  const router=useRouter();
  const search=useSearchParams();
  const {state,refreshDownloads,loadMoreDownloads,updateDownload,updateTask}=useWorkbench();
  const [loadingMore,setLoadingMore]=useState(false);
  const [selectedId,setSelectedId]=useState(state.downloads[0]?.id??"");
  const [query,setQuery]=useState(search.get("q")??"");
  const [kind,setKind]=useState<"all"|DownloadKind>(()=>["tool","ai-package","manual-package","historical","derived"].includes(search.get("kind")??"")?search.get("kind") as DownloadKind:"all");
  const [latest,setLatest]=useState(search.get("order")!=="oldest");
  const [panel,setPanel]=useState<"feedback"|"rating"|null>(null);
  const [feedback,setFeedback]=useState<"complete"|"partial"|"failed">("complete");
  const [rating,setRating]=useState(5);
  const [feedbackComment,setFeedbackComment]=useState("");
  const [feedbackError,setFeedbackError]=useState("");
  const [feedbackBusy,setFeedbackBusy]=useState(false);
  const feedbackDialogRef=useModalDialog<HTMLElement>(panel!==null,()=>setPanel(null));
  useEffect(()=>{
    const params=new URLSearchParams(search.toString());
    if(query)params.set("q",query);else params.delete("q");
    if(kind!=="all")params.set("kind",kind);else params.delete("kind");
    if(latest)params.delete("order");else params.set("order","oldest");
    const next=params.toString();
    if(next!==search.toString())router.replace(`/me/downloads${next?`?${next}`:""}`,{scroll:false});
  },[kind,latest,query,router,search]);
  const visible=state.downloads
    .filter(entry=>entry.objectName.toLowerCase().includes(query.toLowerCase()))
    .filter(entry=>kind==="all"||entry.kind===kind)
    .sort((a,b)=>latest?b.downloadedAt.localeCompare(a.downloadedAt):a.downloadedAt.localeCompare(b.downloadedAt));
  const item=visible.find(entry=>entry.id===selectedId)??visible[0];
  const groups=groupDownloads(visible);
  const selectedToolSlug=item?.lockedToolDetails?.[0]?.toolSlug??item?.lockedTools[0]?.toolId;
  const redownload=()=>{
    if(!item)return;
    downloadFile(item.downloadUrl,`${item.objectName}.zip`);
    window.setTimeout(()=>void refreshDownloads().catch(()=>undefined),500);
  };
  const submitFeedback=async()=>{
    if(!item)return;
    setFeedbackBusy(true);setFeedbackError("");
    try{
      await submitDownloadFeedback(item.id,{result:feedback,comment:feedbackComment});
      updateDownload(item.id,{feedbackState:"submitted",feedbackResult:feedback,feedbackComment,feedbackSubmittedAt:new Date().toISOString()});
      if(item.sourceTaskId)updateTask(item.sourceTaskId,{result:feedback,stage:"completed",needsUserAction:false});
      await refreshDownloads();
      setPanel(null);
    }catch(cause){setFeedbackError(cause instanceof Error?cause.message:"反馈提交失败，请重试");}
    finally{setFeedbackBusy(false)}
  };
  const submitRating=async()=>{
    if(!item)return;
    setFeedbackBusy(true);setFeedbackError("");
    try{
      await submitDownloadFeedback(item.id,{rating,comment:feedbackComment});
      updateDownload(item.id,{feedbackState:"submitted",feedbackRating:rating,feedbackComment,feedbackSubmittedAt:new Date().toISOString()});
      await refreshDownloads();
      setPanel(null);
    }catch(cause){setFeedbackError(cause instanceof Error?cause.message:"评价提交失败，请重试");}
    finally{setFeedbackBusy(false)}
  };
  return <main className={`${styles.page} ${styles.downloadsPage}`}>
    <PageHeading title="我的下载" note="按时间查看每一次下载及其锁定内容"/>
    <div className={styles.downloadLayout}>
      <section className={styles.downloadHistory}>
        <div className={styles.downloadFilters}>
          <label className={styles.downloadSearch}><MagnifyingGlass/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索工具包或工具名称..."/></label>
          <label className={styles.selectControl}><span className="sr-only">下载类型</span><select value={kind} onChange={event=>setKind(event.target.value as "all"|DownloadKind)}><option value="all">全部类型</option><option value="tool">单工具</option><option value="ai-package">AI组合包</option><option value="manual-package">手动组合包</option><option value="derived">衍生工具</option></select></label>
          <button className={styles.dateSort} onClick={()=>setLatest(value=>!value)}><ArrowsDownUp/>{latest?"按时间 · 最新在前":"按时间 · 最早在前"}</button>
        </div>
        <p className={styles.credentialInfo}><Info/>每条下载凭证永久保留当时的工具和版本</p>
        {groups.map(group=><section className={styles.downloadGroup} key={group.label}>
          <h2>{group.label} <span>· {group.date}</span></h2>
          <div className={styles.downloadRows}>{group.items.map(entry=><button className={item?.id===entry.id?styles.credentialRowActive:styles.credentialRow} onClick={()=>setSelectedId(entry.id)} key={entry.id}>
            <time>{new Date(entry.downloadedAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit",hour12:false})}</time>
            <span className={entry.kind==="tool"?styles.pdfDownloadIcon:styles.packageDownloadIcon}>{entry.kind==="tool"?<FilePdf/>:<Package/>}</span>
            <span className={styles.downloadIdentity}><strong>{entry.objectName}</strong><small>{entry.kind==="tool"?toolVersionState(entry):`${entry.lockedTools.length} tools · package ${packageVersionLabel(entry)} · ${entry.feedbackState==="none"?"待反馈":"已评价"}`}</small></span>
            <span className={entry.kind==="manual-package"?styles.kindOrange:entry.kind==="derived"?styles.kindBlue:styles.kindPurple}>{kindLabel[entry.kind]}</span>
            <span className={styles.redownloadLabel}><DownloadSimple/>重新下载</span>
          </button>)}</div>
        </section>)}
        {!visible.length?<p className={styles.emptyLine}>没有符合当前条件的下载记录。</p>:null}
        {state.downloads.length<state.downloadTotal?<button className={styles.loadMoreButton} disabled={loadingMore} onClick={()=>{setLoadingMore(true);void loadMoreDownloads().finally(()=>setLoadingMore(false))}}>{loadingMore?"正在加载…":`加载更多下载记录（${state.downloads.length}/${state.downloadTotal}）`}</button>:null}
      </section>
      {item?<aside className={styles.credentialDetail}>
        <div className={styles.credentialTitle}><h2>下载凭证</h2><span>{item.feedbackState==="none"?"待反馈":"已反馈"}</span></div>
        <dl className={styles.credentialFacts}>
          <div><dt>下载 ID</dt><dd>{item.id}<Copy/></dd></div>
          <div><dt>下载时间</dt><dd>{new Date(item.downloadedAt).toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-")}</dd></div>
          <div><dt>类型</dt><dd><span>{kindLabel[item.kind]}</span></dd></div>
          <div><dt>关联任务</dt><dd>{item.sourceTaskId??"手动下载"}{item.sourceTaskId?<ArrowSquareOut/>:null}</dd></div>
          <div><dt>{item.packageVersionId?"包版本（锁定）":"工具版本（锁定）"}</dt><dd>{item.packageVersionId?packageVersionLabel(item):toolVersionLabel(item)}<LockKey/></dd></div>
        </dl>
        <section className={styles.lockedTools}>
          <h3>包含工具（锁定版本）</h3>
          {item.lockedTools.map((selection,index)=>{
            const detail=item.lockedToolDetails?.[index];
            const status=item.lockedToolStatuses?.find(entry=>entry.toolId===selection.toolId);
            const name=detail?.toolName??"未知工具";
            const version=detail?.version??"未知版本";
            const Icon=index===0?FilePdf:index===1?Waveform:SpeakerHigh;
            const note=status?.status==="offline"||status?.status==="missing"?"已下架":status?.latestVersion&&status.latestVersion!==version?`有更新 ${status.latestVersion}`:status?.derivedCount?`${status.derivedCount} 个衍生版`:version;
            return <div key={selection.toolId}><span><Icon/></span><strong>{name.replace("工具","")}</strong><em>{note}</em></div>;
          })}
          {!item.lockedTools.length?<p>这个历史包没有可显示的组件明细。</p>:null}
        </section>
        <div className={styles.credentialStatus}><span>状态</span><strong>{item.feedbackState==="none"?"待反馈":"已反馈"}</strong></div>
        <button className={styles.credentialPrimary} onClick={redownload}><DownloadSimple/>{item.packageVersionId?"重新下载原包":"重新下载原版本"}</button>
        <div className={styles.credentialActions}>
          <button onClick={()=>router.push(item.sourceTaskId?stageRoute(item.sourceTaskId,"ready",item.packageVersionId?[item.packageVersionId]:[]):selectedToolSlug?`/tools/${selectedToolSlug}`:"/tools")}>{item.sourceTaskId?"查看任务":"查看工具"}<ArrowSquareOut/></button>
          <button onClick={()=>{setFeedbackComment(item.feedbackComment??"");setFeedbackError("");setPanel(item.kind==="tool"||item.kind==="derived"?"rating":"feedback")}}>{item.kind==="tool"||item.kind==="derived"?"评价工具":"结果反馈"}</button>
          <button onClick={()=>router.push(`/me/returns/new?download=${item.id}`)}>发起回传</button>
        </div>
        <p className={styles.lockNotice}><Info/>即使工具发布新版，这条凭证仍重新下载原锁定内容。</p>
      </aside>:null}
    </div>
    {panel?<div className={styles.modalBackdrop} role="presentation"><section ref={feedbackDialogRef} tabIndex={-1} className={styles.feedbackDialog} role="dialog" aria-modal="true" aria-labelledby="download-feedback-title"><button className={styles.closeButton} type="button" aria-label="关闭反馈" onClick={()=>setPanel(null)}><X/></button>{panel==="feedback"?<><h2 id="download-feedback-title">这次任务完成得怎么样？</h2><div className={styles.choiceRow}>{[["complete","全部完成"],["partial","部分完成"],["failed","未完成"]].map(([id,label])=><button className={feedback===id?styles.choiceActive:undefined} aria-pressed={feedback===id} onClick={()=>setFeedback(id as typeof feedback)} key={id}>{label}</button>)}</div><textarea value={feedbackComment} onChange={event=>setFeedbackComment(event.target.value)} placeholder="可以补充失败信息，继续调整时会带回原任务。"/><button className={styles.primaryButton} disabled={feedbackBusy} onClick={submitFeedback}>{feedbackBusy?"正在提交…":"提交任务反馈"}</button></>:<><h2 id="download-feedback-title">评价这个工具版本</h2><div className={styles.stars} aria-label={`当前评分 ${rating} 星`}>{[1,2,3,4,5].map(value=><button aria-label={`${value} 星`} aria-pressed={value===rating} onClick={()=>setRating(value)} key={value}><Star weight={value<=rating?"fill":"regular"}/></button>)}</div><textarea value={feedbackComment} onChange={event=>setFeedbackComment(event.target.value)} placeholder="说说实际使用效果或遇到的问题"/><button className={styles.primaryButton} disabled={feedbackBusy} onClick={submitRating}>{feedbackBusy?"正在提交…":"提交评价"}</button></>}{feedbackError?<p role="alert" className={styles.feedbackError}>{feedbackError}</p>:null}</section></div>:null}</main>;
}

function groupDownloads(items:DownloadRecord[]) {
  if(!items.length)return [];
  const dateKey=(value:Date)=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
  const today=new Date();
  const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
  const todayKey=dateKey(today);
  const yesterdayKey=dateKey(yesterday);
  const orderedDates=[...new Set(items.map(item=>item.downloadedAt.slice(0,10)))].sort((a,b)=>b.localeCompare(a));
  return orderedDates.map((date)=>({
    label:date===todayKey?"今天":date===yesterdayKey?"昨天":"更早",
    date,
    items:items.filter(item=>item.downloadedAt.startsWith(date)),
  })).reduce<Array<{label:string;date:string;items:DownloadRecord[]}>>((groups,group)=>{
    if(group.label!=="更早")return [...groups,group];
    const earlier=groups.find(entry=>entry.label==="更早");
    if(earlier){earlier.items.push(...group.items);return groups;}
    return [...groups,group];
  },[]);
}

const returnLabel:Record<ReturnState,string>={"precheck-failed":"自动检查未通过","precheck-passed":"待确认提交",prechecking:"自动检查中",reviewing:"人工审核中","review-rejected":"审核未通过",published:"已发布",offline:"已下架"};
function downloadTextFile(name:string,content:string){
  const url=URL.createObjectURL(new Blob([content],{type:"text/markdown;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download=name;
  anchor.click();
  URL.revokeObjectURL(url);
}
export function MyReturns(){
  const search=useSearchParams();
  const processingOnly=search.get("view")==="processing";
  const {state,setReturns,loadMoreReturns}=useWorkbench();
  const [loadingMore,setLoadingMore]=useState(false);
  const needs=state.returns.filter(item=>item.state==="precheck-failed"||item.state==="precheck-passed"||item.state==="review-rejected");
  const published=state.returns.filter(item=>item.state==="published"||item.state==="offline");
  const processing=state.returns.filter(item=>item.state==="prechecking"||item.state==="reviewing");
  const [recentFirst,setRecentFirst]=useState(true);
  const [changingId,setChangingId]=useState("");
  const [toggleError,setToggleError]=useState("");
  const orderedPublished=[...published].sort((a,b)=>recentFirst?b.updatedAt.localeCompare(a.updatedAt):a.updatedAt.localeCompare(b.updatedAt));
  const toggle=async(item:ReturnSubmission)=>{
    setChangingId(item.id);
    setToggleError("");
    try{
      const next=toReturnSubmission(await updateReturnListing(item.id,item.state!=="published"));
      setReturns(items=>items.map(current=>current.id===item.id?next:current));
    }catch(cause){
      setToggleError(cause instanceof Error?cause.message:"上下架操作失败，请稍后重试");
    }finally{
      setChangingId("");
    }
  };
  return <main className={`${styles.page} ${styles.returnsPage}`}>
    <PageHeading title={processingOnly?"处理中的回传":"我的回传"} note={processingOnly?"查看正在自动检查或等待维护人员审核的全部记录":"维护你贡献的工具与版本"} action={<div className={styles.returnHeadingAction}>{processingOnly?<Link className={styles.secondaryButton} href="/me/returns"><ArrowLeft/>返回全部</Link>:<Link className={styles.primaryButton} href="/me/returns/new"><Plus/>新建回传</Link>}<span><Info/>仅上传 return-package，不含业务文件</span></div>}/>
    {!processingOnly?<section className={styles.needsPanel}>
      <div className={styles.returnSectionTitle}><h2>需要你处理 <span>({needs.length})</span></h2></div>
      <div className={styles.needsGrid}>{needs.map(item=><article className={item.state==="review-rejected"?styles.rejectedCard:styles.precheckCard} key={item.id}>
        <span className={styles.problemIcon}>{item.state==="review-rejected"?<X/>:<WarningCircle/>}</span>
        <div className={styles.problemInfo}>
          <div><strong>{returnLabel[item.state]}</strong><span>{item.state==="precheck-passed"?"可以提交审核":item.state==="review-rejected"?"存在问题":`必须修复 ${item.findings.filter(finding=>finding.level==="required").length} 项`}</span></div>
          <h3>{item.name} <em>{item.version}</em> <small>· {new Date(item.updatedAt).toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-")}</small></h3>
          <p>{item.state==="precheck-passed"?"自动检查已经通过，请确认后提交维护人员审核。":item.state==="review-rejected"?`审核原因：${item.reviewReason||"请查看详情并上传修正后的新版本。"}`:`缺少：${item.findings.filter(finding=>finding.level==="required").map(finding=>finding.title.replace("缺少 ","")).join("、")}`}</p>
        </div>
        <Link href={item.state==="precheck-passed"?`/me/returns/new?download=${item.sourceDownloadId}&return=${item.id}`:`/me/returns/${item.id}`}>{item.state==="precheck-passed"?"继续提交":item.state==="review-rejected"?"重新上传版本":"查看修正要求"}<ArrowRight/></Link>
      </article>)}</div>
    </section>:null}
    {!processingOnly?<section className={styles.contributionsPanel}>
      <div className={styles.contributionHeader}><h2>已发布的贡献 <span>({published.length})</span></h2><p>通过审核后自动发布，成为平台默认最新版本</p><button onClick={()=>setRecentFirst(value=>!value)}>{recentFirst?"按最近更新排序":"按最早发布排序"}⌄</button></div>
      {toggleError?<div className={styles.issueBanner}><WarningCircle/><div><strong>上下架没有完成</strong><p>{toggleError}</p></div></div>:null}
      <div className={styles.contributionGrid}>{orderedPublished.map(item=>{
        const compositeCount=item.assets.filter(asset=>asset.type==="composite").length;
        const derivedCount=item.assets.filter(asset=>asset.type==="derived").length;
        const newCount=item.assets.filter(asset=>asset.type==="new").length;
        const publishedAsset=item.assets.find(asset=>asset.type==="composite")??item.assets[0];
        return <article className={styles.contributionCard} key={item.id}>
          <div className={styles.contributionName}>
            <span className={styles.contributionIconPurple}><Package/></span>
            <div><h3>{item.name.replace(/ · 回传版$/,"")}</h3><p>来源下载凭证：{item.sourceDownloadId}</p></div>
            <label>{item.state==="published"?"上架中":"已下架"}<input type="checkbox" checked={item.state==="published"} disabled={changingId===item.id} onChange={()=>void toggle(item)}/><i/></label>
          </div>
          <div className={styles.assetSummary}><div><span>回传版本</span><strong>{item.version}</strong><small>· {new Date(item.updatedAt).toLocaleDateString("zh-CN").replaceAll("/","-")} 更新</small></div><div><span>发布资产</span><strong>{item.assets.length} 个</strong><small>{compositeCount} 组合 · {derivedCount} 衍生 · {newCount} 新增</small></div></div>
          <div className={styles.adoptionMetrics}>
            <div><span>站内采用</span><strong>{item.adoptedCount.toLocaleString()}</strong><small>下载或组包记录</small></div>
            <div><span>组合工具</span><strong>{compositeCount}</strong><small>本次审核发布</small></div>
            <div><span>衍生工具</span><strong>{derivedCount}</strong><small>回归主工具谱系</small></div>
            <div><span>新增工具</span><strong>{newCount}</strong><small>本次识别并发布</small></div>
          </div>
          <p className={styles.contributionMetricNote}><Info/>站内采用只统计平台下载与组包记录，不代表本地 Agent 已实际运行。</p>
          <div className={styles.contributionActions}>{publishedAsset?.slug?<Link href={`/tools/${publishedAsset.slug}`}>查看已发布工具<ArrowSquareOut/></Link>:<Link href={`/me/returns/${item.id}`}>查看回传详情<ArrowSquareOut/></Link>}<Link href={`/me/returns/new?download=${item.sourceDownloadId}`}>上传新版本</Link><button disabled={changingId===item.id} onClick={()=>void toggle(item)}>{changingId===item.id?"处理中…":item.state==="published"?"下架":"重新上架"}</button></div>
        </article>;
      })}</div>
    </section>:null}
    <section className={styles.processingPanel}>
      <div className={styles.processingHeader}><h2>处理中 <span>({processing.length})</span></h2><p>我的回传正在审核或自动检查中</p><Link href="/me/returns?view=processing">查看全部<ArrowRight/></Link></div>
      {processing.map(item=><Link className={styles.processingRow} href={`/me/returns/${item.id}`} key={item.id}>
        <span className={styles.processingStatus}><Clock/>{returnLabel[item.state]}</span>
        <strong>{item.name} <em>{item.version}</em></strong>
        <span>来源凭证：{item.sourceDownloadId}</span>
        <time>提交时间：{new Date(item.updatedAt).toLocaleString("zh-CN",{hour12:false}).replaceAll("/","-")}</time>
        <span>{item.state==="prechecking"?"自动检查中":"等待维护人员处理"}<ArrowRight/></span>
      </Link>)}
    </section>
    {state.returns.length<state.returnTotal?<button className={styles.loadMoreButton} disabled={loadingMore} onClick={()=>{setLoadingMore(true);void loadMoreReturns().finally(()=>setLoadingMore(false))}}>{loadingMore?"正在加载…":`加载更多回传记录（${state.returns.length}/${state.returnTotal}）`}</button>:null}
  </main>;
}

export function ReturnNew(){
  const router=useRouter();
  const search=useSearchParams();
  const existingId=search.get("return")??undefined;
  const existingJobId=search.get("job")??undefined;
  const {state,setReturns,refreshReturns}=useWorkbench();
  const fileRef=useRef<HTMLInputElement>(null);
  const [sourceId,setSourceId]=useState(search.get("download")??state.downloads[0]?.id??"");
  const [fileName,setFileName]=useState("");
  const [status,setStatus]=useState<"upload"|"checking"|"failed"|"passed">(existingJobId&&!existingId?"checking":"upload");
  const [record,setRecord]=useState<ReturnRecord|null>(null);
  const [error,setError]=useState("");
  const [uploadProgress,setUploadProgress]=useState(0);
  const [dragging,setDragging]=useState(false);
  const findings=record?.findings??[];
  const fixPrompt=record?.fixPrompt??"";

  const syncRecord=(next:ReturnRecord)=>{
    setRecord(next);
    setReturns(items=>[
      toReturnSubmission(next),
      ...items.filter(item=>item.id!==next.id),
    ]);
  };

  useEffect(()=>{
    if(!existingId)return;
    let active=true;
    void getReturn(existingId).then(next=>{
      if(!active)return;
      syncRecord(next);
      setSourceId(next.sourceDownloadId);
      setFileName(next.versions.at(-1)?.fileName??"");
      setStatus(next.state==="precheck-failed"?"failed":next.state==="precheck-passed"?"passed":"upload");
    }).catch(cause=>{
      if(active)setError(cause instanceof Error?cause.message:"无法读取回传记录");
    });
    return()=>{active=false};
  // syncRecord intentionally only adapts the fetched record into local presentation state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[existingId]);

  useEffect(()=>{
    if(!existingJobId||existingId)return;
    let active=true;
    void resumeReturnPrecheck(existingJobId).then(next=>{
      if(!active)return;
      syncRecord(next);
      setSourceId(next.sourceDownloadId);
      setFileName(next.versions.at(-1)?.fileName??"");
      setStatus(next.state==="precheck-passed"?"passed":"failed");
      router.replace(`/me/returns/new?download=${next.sourceDownloadId}&return=${next.id}`);
    }).catch(cause=>{
      if(!active)return;
      setError(cause instanceof Error?cause.message:"无法恢复自动检查，请重新上传");
      setStatus("upload");
    });
    return()=>{active=false};
  // syncRecord only adapts the completed server job into page state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[existingId,existingJobId,router]);

  const choose=async(file?:File)=>{
    if(!file)return;
    if(!sourceId){setError("请先选择来源下载凭证");return}
    setFileName(file.name);
    setError("");
    setStatus("checking");
    setUploadProgress(0);
    try{
      const next=await precheckReturn(
        file,
        sourceId,
        record?.id??existingId,
        setUploadProgress,
        jobId=>router.replace(`/me/returns/new?download=${sourceId}&job=${jobId}`),
      );
      syncRecord(next);
      setStatus(next.state==="precheck-passed"?"passed":"failed");
      router.replace(`/me/returns/new?download=${next.sourceDownloadId}&return=${next.id}`);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"上传或检查失败，请重新尝试");
      setStatus("upload");
    }
  };

  const submit=async()=>{
    if(!record)return;
    setError("");
    try{
      const next=await submitReturn(record.id);
      syncRecord(next);
      await refreshReturns();
      router.push(`/me/returns/${next.id}`);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"提交审核失败");
    }
  };

  const downloadFixPrompt=()=>downloadTextFile("FIX_PROMPT.md",fixPrompt);

  return <main className={styles.page}><Link className={styles.backLink} href="/me/returns"><ArrowLeft/>返回我的回传</Link><PageHeading title={status==="upload"?"新建回传":"修正回传包"} note={status==="failed"?"不用自己改代码，把平台整理好的修正要求交给本地 Agent 即可。":"自动检查通过前不会进入维护人员审核队列。"}/>
    <section className={styles.sourcePanel}><label>来源下载凭证<select value={sourceId} onChange={e=>setSourceId(e.target.value)}>{state.downloads.map(item=><option value={item.id} key={item.id}>{item.id} · {item.objectName}</option>)}</select></label><p>平台会用来源版本识别完整组合工具、修改后的衍生工具和新增组件。</p></section>
    {error?<div className={styles.issueBanner}><WarningCircle/><div><strong>暂时无法继续</strong><p>{error}</p></div></div>:null}
    {status==="upload"?<section className={`${styles.uploadZone} ${dragging?styles.uploadZoneDragging:""}`} onClick={()=>fileRef.current?.click()} onDragEnter={event=>{event.preventDefault();setDragging(true)}} onDragOver={event=>event.preventDefault()} onDragLeave={event=>{event.preventDefault();if(event.currentTarget===event.target)setDragging(false)}} onDrop={event=>{event.preventDefault();setDragging(false);void choose(event.dataTransfer.files[0])}}><UploadSimple/><h2>{dragging?"松开即可上传":"选择或拖入净化后的 return-package.zip"}</h2><p>不要上传业务结果、密钥、Token、客户资料和无关日志。支持 8MB 分片续传，单包及解压后体积上限均为 20GB。</p><button type="button" onClick={(event)=>{event.stopPropagation();fileRef.current?.click()}}>选择 ZIP 文件</button></section>:status==="checking"?<section className={styles.checking}><Clock/><h2>正在上传并检查结构、安全、来源和完成报告…</h2><progress max={100} value={uploadProgress}/><p>{fileName?`${fileName} · `:""}{uploadProgress>0?`已上传 ${uploadProgress}%，完成后自动执行静态检查。`:"后台检查正在进行，刷新页面后也会自动恢复进度。"}</p></section>:status==="failed"?<><div className={styles.issueBanner}><WarningCircle/><div><strong>这个工具包还差几项，暂时不能提交审核</strong><p>平台只列出问题和完成标准，修正仍在你的本地 Agent 中完成。</p></div></div><section className={styles.returnFlow}><article><span>1</span><CheckCircle/><h2>平台已检查</h2><p>{fileName} · {findings.filter(item=>item.level==="required").length} 项必须修复</p><button onClick={()=>fileRef.current?.click()}>重新选择文件</button></article><ArrowRight className={styles.flowArrow}/><article><span>2</span><Wrench/><h2>交给本地 Agent</h2><p>同一份修正要求适用于任意支持上传文件的 Agent。</p><button onClick={()=>copyText(fixPrompt)}><Copy/>复制给 Agent</button></article><ArrowRight className={styles.flowArrow}/><article><span>3</span><UploadSimple/><h2>修正后回来</h2><p>上传修正后的净化回传包并自动复查。</p><button onClick={()=>fileRef.current?.click()}>上传修正后的 ZIP</button></article></section><Findings findings={findings} onDownloadFixPrompt={downloadFixPrompt}/></>:<section className={styles.passedPanel}><CheckCircle/><h2>自动检查已通过，可以提交人工审核</h2><p>0 个必须修复项 · {findings.filter(item=>item.level==="risk").length} 个风险提醒 · {findings.filter(item=>item.level==="suggestion").length} 个优化建议</p><div><strong>检查结果</strong><span>来源版本已对应</span><span>必备结构已齐全</span><span>敏感内容静态检查通过</span></div><button className={styles.primaryButton} onClick={submit}>确认并提交审核</button></section>}
    <input ref={fileRef} className={styles.hiddenInput} type="file" accept=".zip,application/zip" onChange={e=>{void choose(e.target.files?.[0]);e.currentTarget.value=""}}/></main>;
}

function Findings({findings,onDownloadFixPrompt}:{findings:ReturnSubmission["findings"];onDownloadFixPrompt?:()=>void}){return <section className={styles.issuePanel}><div><h2>自动检查结果</h2><span>{findings.filter(item=>item.level==="required").length} 必须修复 · {findings.filter(item=>item.level==="risk").length} 风险 · {findings.filter(item=>item.level==="suggestion").length} 建议</span></div><ul>{findings.map(item=><li key={item.id}><strong>{item.level==="required"?"必须修复":item.level==="risk"?"风险提醒":"优化建议"}：{item.title}</strong><p>完成标准：{item.completion}</p></li>)}</ul>{onDownloadFixPrompt?<button onClick={onDownloadFixPrompt}>下载 FIX_PROMPT.md</button>:null}<a href="/demo-assets/tool-template.zip" download>下载标准模板</a><Link href="/standards">查看完整生产准则</Link></section>}

export function ReturnDetail({returnId}:{returnId:string}){
  const router=useRouter();
  const {state}=useWorkbench();
  const [item,setItem]=useState<ReturnRecord|null>(null);
  const [eventId,setEventId]=useState("");
  const [loadError,setLoadError]=useState("");

  useEffect(()=>{
    let active=true;
    void getReturn(returnId).then(record=>{
      if(!active)return;
      setItem(record);
      setEventId(record.events.at(-1)?.id??"");
    }).catch(cause=>{
      if(active)setLoadError(cause instanceof Error?cause.message:"无法读取回传详情");
    });
    return()=>{active=false};
  },[returnId]);

  if(!item)return <main className={styles.page}><Link className={styles.backLink} href="/me/returns"><ArrowLeft/>返回我的回传</Link><PageHeading title={loadError?"无法打开回传记录":"正在读取回传记录"} note={loadError||"正在从服务端读取版本、检查结果和审核状态。"} /></main>;

  const sourceDownload=state.downloads.find(download=>download.id===item.sourceDownloadId);
  const event=item.events.find(entry=>entry.id===eventId)??item.events.at(-1);
  const sourceVersion=item.sourcePackageVersion??item.sourceToolVersion??"未知版本";
  const currentVersion=item.versions.at(-1);
  const selectedVersion=item.versions.find(version=>event?.id.startsWith(version.id))??currentVersion;
  const reupload=()=>router.push(`/me/returns/new?download=${item.sourceDownloadId}&return=${item.id}`);
  const downloadFixPrompt=()=>downloadTextFile("FIX_PROMPT.md",selectedVersion?.fixPrompt??item.fixPrompt);
  return <main className={styles.page}><Link className={styles.backLink} href="/me/returns"><ArrowLeft/>返回我的回传</Link><PageHeading title={item.name} note={`来源 ${item.sourceDownloadId} · 当前提交 ${item.version} · ${new Date(item.updatedAt).toLocaleString("zh-CN")}`} action={<span className={item.state==="published"?styles.publishedStatus:item.state==="precheck-failed"?styles.warningStatus:styles.reviewStatus}>{returnLabel[item.state]}</span>}/>
    {item.state==="review-rejected"?<div className={styles.issueBanner}><WarningCircle/><div><strong>维护人员审核未通过</strong><p>{item.reviewReason||"请查看审核事件，并带回本地 Agent 修正后上传新版本。"}</p></div></div>:null}
    <section className={styles.submissionFacts}><div><span>来源任务或工具</span><strong>{sourceDownload?.objectName??item.sourceObjectName}</strong></div><div><span>来源下载凭证</span><strong>{item.sourceDownloadId}</strong></div><div><span>原始锁定版本</span><strong>{sourceVersion}</strong></div><div><span>历次上传</span><strong>{item.versions.length} 个版本</strong></div><div><span>首次提交时间</span><strong>{new Date(item.createdAt).toLocaleString("zh-CN")}</strong></div></section>
    <div className={styles.returnDetailLayout}><aside className={styles.versionPanel}><h2>过程时间线</h2>{item.events.map(entry=><button className={eventId===entry.id?styles.versionActive:undefined} onClick={()=>setEventId(entry.id)} key={entry.id}><span>{entry.type==="precheck"?"自":entry.type==="review"?"审":entry.type==="published"?"发":"传"}</span>{entry.title}<small>{new Date(entry.at).toLocaleString("zh-CN")}</small></button>)}</aside>
      <section className={styles.returnMain}><div className={styles.panelHeader}><h2>{event?.title}</h2><span>{event?.type==="precheck"?"自动检查事件":event?.type==="review"?"人工审核事件":"历史事实"}</span></div><p className={styles.description}>{event?.detail}</p>{selectedVersion?.findings.length?<Findings findings={selectedVersion.findings} onDownloadFixPrompt={downloadFixPrompt}/>:null}<h3>本次形成的资产</h3>{item.assets.length?item.assets.map(asset=><Link className={styles.derivedRow} href={`/tools/${asset.slug??asset.toolId}`} key={asset.toolId}><Wrench/><strong>{asset.name}</strong><span>{asset.type==="composite"?"组合工具":asset.type==="derived"?"衍生工具":"新工具"}</span><small>{asset.reason}</small></Link>):<p className={styles.description}>{item.state==="reviewing"?"当前版本正在等待维护人员审核，尚未形成平台正式资产。":"审核通过并发布后，这里会展示组合工具、衍生工具和新组件及拆解原因。"}</p>}{item.assets.length?<div className={styles.aiExplanation}><strong>AI 拆解说明</strong><p>完整方案沉淀为组合工具；对既有组件能力的实质调整形成衍生工具；可独立复用的新规则形成新工具。所有资产都保留本次下载凭证和来源版本。</p></div>:null}</section>
      <aside className={styles.publishPanel}><h2>版本信息</h2><dl><div><dt>来源下载</dt><dd>{item.sourceDownloadId}</dd></div><div><dt>所选版本</dt><dd>{selectedVersion?.version??item.version}</dd></div><div><dt>上传文件</dt><dd>{selectedVersion?.fileName??"未知"}</dd></div><div><dt>文件保留</dt><dd>{selectedVersion?.retained?"已安全保存":"因敏感风险已删除"}</dd></div><div><dt>可见范围</dt><dd>{item.state==="published"?"平台用户":"仅本人和维护人员"}</dd></div><div><dt>发布规则</dt><dd>维护审核通过后自动发布</dd></div></dl>{selectedVersion?.retained?<a className={styles.secondaryButton} href={returnVersionDownloadUrl(item.id,selectedVersion.id)} download>下载所选版本文件</a>:null}{item.state==="precheck-failed"||item.state==="review-rejected"?<button onClick={reupload}>修正并上传新版本</button>:item.state==="precheck-passed"?<button onClick={()=>router.push(`/me/returns/new?download=${item.sourceDownloadId}&return=${item.id}`)}>继续确认提交</button>:item.state==="published"||item.state==="offline"?<button onClick={reupload}>上传新版本</button>:<p className={styles.reviewNote}>正在等待维护人员审核。用户侧不提供通过或不通过操作。</p>}</aside></div></main>;
}
