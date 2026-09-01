"use client";

import type {
  AdminAuditEvent,
  ImportedUser,
  PlatformRole,
  ToolCatalogItem,
  UserProfile,
} from "@ai-tool-workbench/contracts";
import {
  ChartBar,
  CheckCircle,
  Clock,
  Copy,
  DownloadSimple,
  Funnel,
  ListBullets,
  Plus,
  ShieldCheck,
  Sparkle,
  Users,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  importAdminUsers,
  listAdminAuditEvents,
  listAdminUsers,
} from "@/lib/api/admin-client";
import { listAllCatalogTools } from "@/lib/api/catalog-client";
import { useWorkbench } from "@/lib/workbench-store";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import { AdminOnlyPanel, ErrorPanel, LoadingPanel, PageHeader, dateText } from "./admin-ui";
import styles from "./platform-pages.module.css";

const roleText: Record<PlatformRole,string> = {
  employee: "普通用户",
  maintainer: "维护人员",
  admin: "管理员",
};

export function AdminUsersPage() {
  const {state}=useWorkbench();
  const [users,setUsers]=useState<UserProfile[]>([]);
  const [loading,setLoading]=useState(state.user?.role==="admin");
  const [error,setError]=useState("");
  const [dialog,setDialog]=useState(false);
  const [account,setAccount]=useState("");
  const [displayName,setDisplayName]=useState("");
  const [role,setRole]=useState<PlatformRole>("employee");
  const [created,setCreated]=useState<ImportedUser|null>(null);
  const [busy,setBusy]=useState(false);
  const userDialogRef=useModalDialog<HTMLElement>(dialog,()=>setDialog(false));
  const isAdmin=state.user?.role==="admin";

  useEffect(()=>{
    if(!isAdmin)return;
    let active=true;
    void listAdminUsers().then((response)=>{if(active)setUsers(response.items)}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"无法读取用户")}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[isAdmin]);

  async function submit(event:FormEvent) {
    event.preventDefault();
    if(!state.user)return;
    setBusy(true);setError("");
    try {
      const response=await importAdminUsers({
        organizationId:state.user.organizationId,
        users:[{account,displayName,role}],
      });
      const item=response.imported[0]??null;
      setCreated(item);
      if(item)setUsers((current)=>[item.user,...current]);
      setAccount("");setDisplayName("");setRole("employee");
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"创建账号失败");
    } finally {setBusy(false)}
  }

  return <main className={styles.page}>
    <PageHeader eyebrow="维护系统 / 用户与权限" title="用户管理" description="维护内部账号与基础身份信息；首期不开放用户自行注册。" action={isAdmin?<button className={styles.headerButton} onClick={()=>{setCreated(null);setDialog(true)}}><Plus/>创建内部账号</button>:undefined}/>
    {!isAdmin?<AdminOnlyPanel title="用户管理需要管理员权限"/>:loading?<LoadingPanel text="正在读取内部账号"/>:<>
      {error?<section className={styles.inlineError}>{error}</section>:null}
      <section className={styles.userSummary}><div><Users/><span><strong>{users.length}</strong><small>全部账号</small></span></div><div><CheckCircle/><span><strong>{users.filter((user)=>user.status==="active").length}</strong><small>已激活</small></span></div><div><Clock/><span><strong>{users.filter((user)=>user.status==="invited").length}</strong><small>等待激活</small></span></div><div><ShieldCheck/><span><strong>{users.filter((user)=>user.role!=="employee").length}</strong><small>管理角色</small></span></div></section>
      <section className={styles.tablePanel}><div className={`${styles.userRow} ${styles.tableHead}`}><span>用户</span><span>平台角色</span><span>状态</span><span>部门 / 职能</span><span>账号策略</span></div>{users.map((user)=><div className={styles.userRow} key={user.id}><div><span className={styles.avatar}>{user.displayName.slice(0,1)}</span><p><strong>{user.displayName}</strong><small>{user.account}</small></p></div><span>{roleText[user.role]}</span><span className={user.status==="active"?styles.statusOk:styles.statusWait}>{user.status==="active"?"已激活":user.status==="invited"?"待激活":"已停用"}</span><span>{user.departmentId??"未自动归属"} / {user.jobFunctionId??"未自动归属"}</span><span>{user.mustChangePassword?"首次登录需改密":"密码已设置"}</span></div>)}</section>
    </>}
    {dialog?<div className={styles.modalBackdrop} role="presentation"><section ref={userDialogRef} tabIndex={-1} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-user-title"><h2 id="create-user-title">创建内部账号</h2><p>激活令牌只显示一次，请通过公司内部安全渠道交给本人。</p>{created?<div className={styles.tokenResult}><CheckCircle/><strong>{created.user.displayName} 已创建</strong><code>{created.activationToken}</code><button onClick={()=>void navigator.clipboard.writeText(created.activationToken)}><Copy/>复制激活令牌</button><small>有效期至 {dateText(created.activationExpiresAt)}</small></div>:<form onSubmit={submit}><label>内部账号<input value={account} onChange={(event)=>setAccount(event.target.value)} required maxLength={100}/></label><label>显示名称<input value={displayName} onChange={(event)=>setDisplayName(event.target.value)} required maxLength={100}/></label><label>平台角色<select value={role} onChange={(event)=>setRole(event.target.value as PlatformRole)}><option value="employee">普通用户</option><option value="maintainer">维护人员</option><option value="admin">管理员</option></select></label><button type="submit" disabled={busy}>{busy?"正在创建…":"创建并生成激活令牌"}</button></form>}<button className={styles.modalCancel} onClick={()=>setDialog(false)}>关闭</button></section></div>:null}
  </main>;
}

export function AdminAnalyticsPage() {
  const [tools,setTools]=useState<ToolCatalogItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    void listAllCatalogTools({sort:"popular"}).then((response)=>{if(active)setTools(response.items)}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"无法读取运营数据")}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[]);
  const totalDownloads=tools.reduce((sum,tool)=>sum+tool.downloads,0);
  const rated=tools.filter((tool)=>tool.rating!==null);
  const average= rated.length?rated.reduce((sum,tool)=>sum+(tool.rating??0),0)/rated.length:0;
  const modules=useMemo(()=>Object.entries(tools.reduce<Record<string,{downloads:number;tools:number}>>((result,tool)=>{const name=tool.modules.find((module)=>module.isPrimary)?.name??tool.modules[0]?.name??"未分类";const current=result[name]??{downloads:0,tools:0};result[name]={downloads:current.downloads+tool.downloads,tools:current.tools+1};return result},{})).sort((a,b)=>b[1].downloads-a[1].downloads),[tools]);
  const maxDownloads=Math.max(1,...tools.map((tool)=>tool.downloads));
  return <main className={styles.page}>
    <PageHeader eyebrow="维护系统 / 智能与运营" title="数据与运营" description="只汇总平台真实记录的工具、下载、评分和业务模块数据。"/>
    {loading?<LoadingPanel text="正在汇总运营数据"/>:error?<ErrorPanel message={error}/>:<>
      <section className={styles.analyticsMetrics}><article><DownloadSimple/><div><strong>{totalDownloads.toLocaleString()}</strong><small>累计工具下载</small></div></article><article><ChartBar/><div><strong>{tools.length}</strong><small>上架工具数量</small></div></article><article><Sparkle/><div><strong>{average?average.toFixed(1):"—"}</strong><small>有评价工具均分</small></div></article><article><Funnel/><div><strong>{modules.length}</strong><small>有工具业务模块</small></div></article></section>
      <section className={styles.analyticsGrid}><article className={styles.panel}><header><div><h2>累计下载排行</h2><p>下载是站内事件，不等于本地实际使用</p></div></header><div className={styles.ranking}>{tools.slice(0,8).map((tool,index)=><Link href={`/admin/tools/${tool.slug}`} key={tool.id}><b>{String(index+1).padStart(2,"0")}</b><div><strong>{tool.name}</strong><span><i style={{width:`${Math.max(4,tool.downloads/maxDownloads*100)}%`}}/></span></div><em>{tool.downloads.toLocaleString()}</em></Link>)}</div></article><article className={styles.panel}><header><div><h2>业务模块下载分布</h2><p>按工具主模块汇总下载事件</p></div></header><div className={styles.moduleStats}>{modules.map(([name,value])=><div key={name}><span>{name}</span><strong>{value.downloads.toLocaleString()} 次下载</strong><small>{value.tools} 个工具</small></div>)}</div></article></section>
      <section className={styles.notice}><ChartBar/><div><strong>当前统计边界</strong><p>下载与评分来自真实工具指标；任务完成率、AI 推荐转化率和回传资产复用率需要后续事件埋点，当前不生成虚构数据。</p></div></section>
    </>}
  </main>;
}

export function AdminBehaviorBoundaryPage() {
  return <main className={styles.page}>
    <PageHeader eyebrow="维护系统 / 智能与运营" title="平台行为分析" description="首期只展示已经有可靠数据来源的站内行为，不推测下载后的本地执行。"/>
    <section className={styles.notice}><ListBullets/><div><strong>事件分析尚未接入</strong><p>当前可以确认工具发布、下载、评分、回传与审核记录；详情查看、加入工具包、AI 推荐展示等统一事件模型尚未落库，因此本页不展示模拟漏斗和虚构转化率。</p></div></section>
    <section className={styles.analyticsGrid}>
      <article className={styles.panel}><header><div><h2>目前可观察</h2><p>来自数据库中的真实业务记录</p></div></header><div className={styles.constraintList}><div><dt>工具与版本</dt><dd>可统计</dd></div><div><dt>下载记录</dt><dd>可统计</dd></div><div><dt>评价与回传</dt><dd>可统计</dd></div><div><dt>审核与发布操作</dt><dd>可审计</dd></div></div></article>
      <article className={styles.panel}><header><div><h2>明确不可观察</h2><p>工具离开平台后的本地过程</p></div></header><div className={styles.constraintList}><div><dt>本地 Agent 是否实际运行</dt><dd>不可判断</dd></div><div><dt>任务是否成功</dt><dd>不可判断</dd></div><div><dt>工具被使用多少次</dt><dd>不可判断</dd></div><div><dt>业务结果质量</dt><dd>仅靠主动评价</dd></div></div></article>
    </section>
  </main>;
}

export function AdminRolesOverviewPage() {
  const {state}=useWorkbench();
  const [users,setUsers]=useState<UserProfile[]>([]);
  const [loading,setLoading]=useState(state.user?.role==="admin");
  const [error,setError]=useState("");
  const isAdmin=state.user?.role==="admin";
  useEffect(()=>{
    if(!isAdmin)return;
    let active=true;
    void listAdminUsers().then((response)=>{if(active)setUsers(response.items)}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"无法读取角色数据")}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[isAdmin]);
  const roles: Array<[PlatformRole,string,string]> = [
    ["employee","普通用户","浏览、AI组包、手动组包、下载、评价与回传"],
    ["maintainer","维护人员","维护工具、版本、内容、AI配置与回传审核"],
    ["admin","管理员","维护人员全部能力，以及账号、权限和审计"],
  ];
  return <main className={styles.page}>
    <PageHeader eyebrow="维护系统 / 用户与权限" title="角色权限" description="首期使用三种平台内置角色；暂不开放自定义权限组合。"/>
    {!isAdmin?<AdminOnlyPanel title="角色权限需要管理员权限"/>:loading?<LoadingPanel text="正在读取角色数据"/>:error?<ErrorPanel message={error}/>:<section className={styles.taxonomyGrid}>{roles.map(([role,name,description])=><article className={styles.taxonomyCard} key={role}><header><span><ShieldCheck/></span><div><h2>{name}</h2><p>{description}</p></div><strong>{users.filter((user)=>user.role===role).length}</strong></header><div><p><span>权限模式</span><small>系统内置，代码与接口共同约束</small><b>固定</b></p></div></article>)}</section>}
  </main>;
}

export function AdminTeamsBoundaryPage() {
  return <main className={styles.page}>
    <PageHeader eyebrow="维护系统 / 用户与权限" title="团队管理" description="团队与部门应由公司统一登录和组织目录同步，不在平台内重复维护。"/>
    <section className={styles.accessPanel}><Users/><h2>尚未接入公司组织目录</h2><p>当前账号只保留可选的部门和职能标识。拿到统一登录或组织接口后，再开放团队树、成员归属和按部门统计；现在不展示模拟团队和人员。</p></section>
  </main>;
}

export function AdminAuditPage() {
  const {state}=useWorkbench();
  const [items,setItems]=useState<AdminAuditEvent[]>([]);
  const [loading,setLoading]=useState(state.user?.role==="admin");
  const [error,setError]=useState("");
  const isAdmin=state.user?.role==="admin";
  useEffect(()=>{
    if(!isAdmin)return;
    let active=true;
    void listAdminAuditEvents().then((response)=>{if(active)setItems(response.items)}).catch((cause)=>{if(active)setError(cause instanceof Error?cause.message:"无法读取审计记录")}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[isAdmin]);
  return <main className={styles.page}>
    <PageHeader eyebrow="维护系统 / 组织与系统" title="系统审计" description="追溯账号、回传审核、发布和重要管理动作。审计记录只读。"/>
    {!isAdmin?<AdminOnlyPanel title="系统审计需要管理员权限"/>:loading?<LoadingPanel text="正在读取系统审计"/>:error?<ErrorPanel message={error}/>:<section className={styles.auditPanel}><header><ListBullets/><div><strong>{items.length} 条最近记录</strong><p>按发生时间倒序，事件不会在后台被修改。</p></div></header>{items.length?<div className={styles.auditList}>{items.map((event)=><article key={event.id}><span>{event.action.includes("approved")?"发":event.action.includes("rejected")?"拒":"管"}</span><div><strong>{event.action}</strong><small>{event.actorDisplayName??"系统"} {event.actorAccount?`（${event.actorAccount}）`:""}</small></div><p>{event.objectType}{event.objectId?` · ${event.objectId}`:""}</p><time>{dateText(event.createdAt)}</time></article>)}</div>:<div className={styles.clearState}><CheckCircle/><strong>当前没有审计记录</strong></div>}</section>}
  </main>;
}
