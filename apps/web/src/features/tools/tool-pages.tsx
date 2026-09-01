"use client";

import type { PackageDraft, Tool, ToolCatalogItem, ToolReview, ToolTaxonomy, ToolVersionSummary } from "@ai-tool-workbench/contracts";
import { ArrowRight, CaretDown, Check, CheckCircle, CircleNotch, DownloadSimple, FilePdf, FileText, Funnel, GridFour, ImageSquare, Info, MagnifyingGlass, MicrosoftExcelLogo, Package, Plus, Rows, Sparkle, TextAa, Users, WarningCircle, Waveform, X } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  getCatalogTool,
  getCatalogTaxonomy,
  listCatalogDerivedTools,
  listCatalogTools,
  listCatalogToolVersions,
} from "@/lib/api/catalog-client";
import { toolDownloadUrl } from "@/lib/api/workspace-client";
import { downloadFile } from "@/lib/download";
import { useWorkbench } from "@/lib/workbench-store";
import { useResolvedDraftTools } from "./use-resolved-draft-tools";
import styles from "./tool-pages.module.css";

const iconFor=(tool:Tool)=>tool.category==="PDF处理"?FilePdf:tool.category==="音视频处理"?Waveform:tool.category==="数据处理"?MicrosoftExcelLogo:TextAa;
const toneFor=(index:number)=>["violet","green","blue","orange"][index%4];
const verificationLabel=(value:ToolVersionSummary["verification"])=>value==="verified"?"已验证":value==="partly-verified"?"部分验证":"未验证";
type DisplayTool=Tool&{platformId:string;slug:string;parentName?:string;parentSlug?:string;featured:boolean;featuredOrder:number|null};
function displayTool(item:ToolCatalogItem,versions:ToolVersionSummary[]=[item.latestVersion],derived:ToolCatalogItem[]=[]):DisplayTool{
  return {
    id:item.slug,
    platformId:item.id,
    slug:item.slug,
    name:item.name,
    problem:item.problem,
    result:item.result,
    principle:item.principle,
    module:item.modules.find(module=>module.isPrimary)?.name??item.modules[0]?.name??"未分类",
    category:item.category?.name??"未分类",
    kind:item.kind,
    tags:item.tags.map(tag=>tag.name),
    departments:item.departments,
    roles:item.roles,
    downloads:item.downloads,
    rating:item.rating??0,
    latestVersionId:item.latestVersion.id,
    versions:versions.map(version=>({
      id:version.id,
      version:version.version,
      releasedAt:version.releasedAt??item.updatedAt,
      verification:version.verification,
      downloadUrl:version.downloadUrl??"",
      risks:version.risks,
    })),
    parent:item.parent?{
      toolId:item.parent.toolSlug,
      versionId:item.parent.versionId,
      difference:item.parent.difference,
    }:undefined,
    parentName:item.parent?.toolName,
    parentSlug:item.parent?.toolSlug,
    derivedToolIds:derived.map(tool=>tool.slug),
    featured:item.featured,
    featuredOrder:item.featuredOrder,
  };
}
const platformId=(tool:Tool)=>"platformId" in tool?String(tool.platformId):tool.id;
const emptyManualDraft=():PackageDraft=>({id:"manual",source:"manual",name:"我的手动工具包",goal:"",deliverables:[],tools:[],plannedComponents:[],confirmedSections:[],userConfirmedFields:[]});
function asManualDraft(draft:PackageDraft){
  return draft.source==="manual"&&draft.id==="manual"?draft:emptyManualDraft();
}

export function ToolWorkbench(){
  const router=useRouter();
  const pathname=usePathname();
  const searchParams=useSearchParams();
  const {state,setDraft,requestLogin,refreshDownloads}=useWorkbench();
  const [catalog,setCatalog]=useState<DisplayTool[]>([]);
  const [taxonomy,setTaxonomy]=useState<ToolTaxonomy|null>(null);
  const [catalogError,setCatalogError]=useState("");
  const [catalogLoading,setCatalogLoading]=useState(true);
  const [query,setQuery]=useState(searchParams.get("q")??"");
  const grid=searchParams.get("view")!=="list";
  const [filterOpen,setFilterOpen]=useState(false);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [reloadKey,setReloadKey]=useState(0);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const moduleSlug=searchParams.get("module")??"";
  const categorySlug=searchParams.get("category")??"";
  const parentSlug=searchParams.get("parent")??"";
  const sort=searchParams.get("sort")==="popular"?"popular":"newest";
  const selectedTags=searchParams.getAll("tag");
  const selectedTagsKey=selectedTags.join("|");
  const verifiedOnly=searchParams.get("verified")==="1";
  const featuredOnly=searchParams.get("featured")==="1";
  const manualTools=state.draft.source==="manual"?state.draft.tools:[];
  const resolvedManual=useResolvedDraftTools(manualTools);

  useEffect(()=>{
    let active=true;
    void getCatalogTaxonomy().then((result)=>{if(active)setTaxonomy(result)}).catch(()=>undefined);
    return()=>{active=false};
  },[reloadKey]);

  useEffect(()=>{
    let active=true;
    queueMicrotask(()=>{
      if(!active)return;
      setCatalogLoading(true);setCatalogError("");
      void listCatalogTools({
        q:searchParams.get("q")||undefined,
        module:moduleSlug||undefined,
        category:categorySlug||undefined,
        tags:selectedTagsKey?selectedTagsKey.split("|"):[],
        parent:parentSlug||undefined,
        featured:featuredOnly||undefined,
        verification:verifiedOnly?"verified":undefined,
        sort,
        page,
        pageSize:24,
      }).then((response)=>{
        if(!active)return;
        const next=response.items.map((item)=>displayTool(item));
        setCatalog((current)=>page===1?next:[...current,...next.filter((tool)=>!current.some((item)=>item.platformId===tool.platformId))]);
        setTotal(response.total);
      }).catch((cause)=>{if(active)setCatalogError(cause instanceof Error?cause.message:"无法读取工具目录")}).finally(()=>{if(active)setCatalogLoading(false)});
    });
    return()=>{active=false};
  },[categorySlug,featuredOnly,moduleSlug,page,parentSlug,reloadKey,searchParams,selectedTagsKey,sort,verifiedOnly]);

  function updateParams(update:(params:URLSearchParams)=>void){
    const params=new URLSearchParams(searchParams.toString());
    update(params);setPage(1);router.replace(`${pathname}${params.size?`?${params}`:""}`,{scroll:false});
  }
  function setSingle(name:string,value:string){updateParams((params)=>{if(value)params.set(name,value);else params.delete(name)})}
  function toggleTag(slug:string){updateParams((params)=>{const next=params.getAll("tag").includes(slug)?params.getAll("tag").filter((item)=>item!==slug):[...params.getAll("tag"),slug];params.delete("tag");next.forEach((item)=>params.append("tag",item))})}
  function submitSearch(event:FormEvent){event.preventDefault();setSingle("q",query.trim())}
  function insertTool(tool:Tool){setDraft((draft)=>{const manual=asManualDraft(draft);const id=platformId(tool);return manual.tools.some((item)=>item.toolId===id)?manual:{...manual,tools:[...manual.tools,{toolId:id,versionId:tool.latestVersionId,purpose:"由本地 Agent 根据组合目标规划",replaceable:false}],confirmedSections:[]}})}
  function addTool(tool:Tool){requestLogin(()=>insertTool(tool))}
  function directDownload(tool:Tool){requestLogin(()=>{const version=tool.versions.find((item)=>item.id===tool.latestVersionId)!;downloadFile(toolDownloadUrl(tool.id,version.version),`${tool.name}-${version.version}.zip`);window.setTimeout(()=>void refreshDownloads().catch(()=>undefined),500)})}
  function askAi(tool:Tool){requestLogin(()=>{insertTool(tool);router.push("/")})}

  const moduleName=taxonomy?.modules.find((item)=>item.slug===moduleSlug)?.name??"全部工具";
  const categoryName=taxonomy?.categories.find((item)=>item.slug===categorySlug)?.name;
  return <main className={styles.workbench}>
    <header className={styles.toolHeader}><h1>工具工作台</h1><form className={styles.search} onSubmit={submitSearch}><MagnifyingGlass/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="搜索工具名称或关键词"/><button type="submit">搜索</button></form><div className={styles.filterWrap}><button className={styles.filterButton} type="button" aria-expanded={filterOpen} onClick={()=>setFilterOpen((value)=>!value)}><Funnel/>标签筛选{selectedTags.length?` ${selectedTags.length}`:""}</button>{filterOpen?<div className={styles.filterPopover}>{taxonomy?.tags.map((tag)=><label key={tag.id}><input type="checkbox" checked={selectedTags.includes(tag.slug)} onChange={()=>toggleTag(tag.slug)}/>{tag.name}</label>)}<button onClick={()=>updateParams((params)=>params.delete("tag"))}>清空筛选</button></div>:null}</div></header>
    <div className={styles.toolLayout}><aside className={styles.toolSidebar}><h2>业务模块</h2><button className={!moduleSlug?styles.sideActive:undefined} onClick={()=>setSingle("module","")}>全部工具</button>{taxonomy?.modules.map((item)=><button className={moduleSlug===item.slug?styles.sideActive:undefined} onClick={()=>setSingle("module",item.slug)} key={item.id}>{item.name}</button>)}<h2>平台推荐</h2><button className={featuredOnly?styles.sideActive:undefined} onClick={()=>setSingle("featured",featuredOnly?"":"1")}><span>首批推荐工具</span><Sparkle/></button><h2>功能分类</h2>{taxonomy?.categories.map((item)=><button className={categorySlug===item.slug?styles.sideActive:undefined} onClick={()=>setSingle("category",categorySlug===item.slug?"":item.slug)} key={item.id}>{item.name}<CaretDown/></button>)}<h2>质量筛选</h2><button className={verifiedOnly?styles.sideActive:undefined} onClick={()=>setSingle("verified",verifiedOnly?"":"1")}><span>只看已验证</span><CheckCircle/></button><h2>当前筛选</h2><div className={styles.savedTags}>{selectedTags.length?selectedTags.map((slug)=><span key={slug}>{taxonomy?.tags.find((tag)=>tag.slug===slug)?.name??slug}</span>):<small>暂无标签筛选</small>}</div></aside>
      <section className={styles.toolContent}><div className={styles.contentTop}><p><strong>{parentSlug?"衍生工具":moduleName}{categoryName?` · ${categoryName}`:""}</strong><span>{total}个</span></p><div>排序：<button onClick={()=>setSingle("sort",sort==="newest"?"popular":"newest")}>{sort==="newest"?"最新发布":"下载采用"}<CaretDown/></button><button aria-label="网格视图" aria-pressed={grid} onClick={()=>setSingle("view","")}><GridFour/></button><button aria-label="列表视图" aria-pressed={!grid} onClick={()=>setSingle("view","list")}><Rows/></button></div></div>
        <div className={grid?styles.toolGrid:styles.toolList}>{catalog.map((tool,index)=>{const Icon=iconFor(tool);const version=tool.versions[0];return <article className={styles.toolCard} key={tool.id}>{tool.featured?<span className={styles.featuredBadge}><Sparkle/>首批推荐</span>:null}<div className={`${styles.cardIcon} ${styles[toneFor(index)]}`}><Icon size={27}/></div><div className={styles.cardTitle}><h2>{tool.name}</h2><span>{version.version}</span></div><p>{tool.problem}</p><div className={styles.cardMeta}><span>{tool.parent?"衍生工具":tool.kind==="composite"?"组合工具":tool.module}</span><span><Check/>{verificationLabel(version.verification)}</span></div>{tool.parent?<small>基于 {tool.parentName??"来源主工具"} · {tool.parent.difference}</small>:<small>{tool.downloads.toLocaleString()}次下载 · {tool.departments.length}个部门采用 · {tool.rating?`${tool.rating}分`:"暂无评分"}</small>}<div className={styles.cardActions}><Link href={`/tools/${tool.slug}`}>查看详情</Link><button className={styles.textAction} onClick={()=>directDownload(tool)}><DownloadSimple/>下载</button><button className={styles.textAction} onClick={()=>askAi(tool)}><Sparkle/>问AI</button><button onClick={()=>addTool(tool)}><Package/>入包</button></div></article>})}</div>{catalog.length<total?<button className={styles.loadMore} disabled={catalogLoading} onClick={()=>setPage((value)=>value+1)}>{catalogLoading?"正在加载…":`继续加载（已显示 ${catalog.length}/${total}）`}</button>:null}{catalogLoading&&!catalog.length?<div className={styles.emptyState}><CircleNotch/><h2>正在读取工具目录</h2></div>:catalogError?<div className={styles.emptyState}><WarningCircle/><h2>工具目录暂时不可用</h2><p>{catalogError}</p><button onClick={()=>setReloadKey((value)=>value+1)}>重新加载</button></div>:!catalog.length?<div className={styles.emptyState}><MagnifyingGlass/><h2>{featuredOnly?"还没有设置首批推荐工具":"没有找到匹配工具"}</h2><p>可以清空筛选，或带着需求让 AI 生成待生产组件。</p><button onClick={()=>router.push("/")}>去问 AI</button></div>:null}
      </section></div>
    <button className={styles.floatingPackage} onClick={()=>requestLogin(()=>setDrawerOpen(true))}><Package/>当前工具包 {manualTools.length}</button>
    {drawerOpen?<aside className={styles.packageDrawer} aria-label="当前手动工具包"><header><div><h2>当前工具包</h2><p>AI 不会自动增删你选择的工具</p></div><button aria-label="关闭工具包" onClick={()=>setDrawerOpen(false)}><X/></button></header><div className={styles.drawerTools}>{resolvedManual.items.length?resolvedManual.items.map(({tool,selection})=><article key={selection.toolId}><span className={styles.miniIcon}><Package/></span><div><strong>{tool.name}</strong><small>{tool.versions.find((version)=>version.id===selection.versionId)?.version}</small></div><button onClick={()=>setDraft((draft)=>({...asManualDraft(draft),tools:asManualDraft(draft).tools.filter((item)=>item.toolId!==selection.toolId)}))}>移除</button></article>):<p className={styles.drawerEmpty}>{resolvedManual.loading?"正在恢复所选工具…":"还没有选择工具。你可以先浏览，再把明确需要的工具加入这里。"}</p>}</div><label className={styles.goalField}>这个组合包要完成什么（可不填）<textarea value={state.draft.source==="manual"?(state.draft.goal??""):""} onChange={(event)=>setDraft((draft)=>({...asManualDraft(draft),goal:event.target.value}))} placeholder="例如：把教材里的单词制作成跟读材料"/></label><footer><button disabled={!manualTools.length} onClick={()=>requestLogin(()=>router.push("/"))}><Sparkle/>带着这些工具问 AI</button><button disabled={!manualTools.length} onClick={()=>requestLogin(()=>router.push("/packages/drafts/manual/confirm"))}><Package/>直接打包</button></footer></aside>:null}
  </main>;
}

export function ToolDetail({toolId}:{toolId:string}){
  const router=useRouter();
  const {state,setDraft,requestLogin,refreshDownloads}=useWorkbench();
  const [tool,setTool]=useState<DisplayTool|null>(null);
  const [derived,setDerived]=useState<DisplayTool[]>([]);
  const [parentTool,setParentTool]=useState<DisplayTool|null>(null);
  const [reviews,setReviews]=useState<ToolReview[]>([]);
  const [loadError,setLoadError]=useState("");
  const [versionId,setVersionId]=useState("");
  const [infoTab,setInfoTab]=useState<"guide"|"versions"|"reviews"|null>(null);
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    let active=true;
    void getCatalogTool(toolId).then(async (detail)=>{
      const [versions,children,parentDetail]=await Promise.all([
        listCatalogToolVersions(toolId),
        listCatalogDerivedTools(toolId),
        detail.tool.parent?getCatalogTool(detail.tool.parent.toolSlug).catch(()=>null):Promise.resolve(null),
      ]);
      if(!active)return;
      const next=displayTool(detail.tool,versions.items,children.items);
      setTool(next);
      setReviews(detail.reviews);
      setDerived(children.items.slice(0,3).map(item=>displayTool(item)));
      setParentTool(parentDetail?displayTool(parentDetail.tool):null);
      setVersionId(next.latestVersionId);
    }).catch(cause=>{
      if(active)setLoadError(cause instanceof Error?cause.message:"无法读取工具详情");
    });
    return()=>{active=false};
  },[toolId]);
  if(!tool)return <main className={styles.detailPage}><p className={styles.detailBreadcrumb}><Link href="/tools">工具工作台</Link></p><div className={styles.emptyState}>{loadError?<WarningCircle/>:<CircleNotch/>}<h2>{loadError||"正在读取工具详情"}</h2>{loadError?<Link href="/tools">返回工具工作台</Link>:null}</div></main>;
  const currentTool=tool;
  const version=currentTool.versions.find(item=>item.id===versionId)??currentTool.versions[0];
  const detailIcon=currentTool.category==="PDF处理"?<FilePdf/>:currentTool.category==="音视频处理"?<Waveform/>:currentTool.category==="数据处理"?<MicrosoftExcelLogo/>:<TextAa/>;
  const adoptionPeople=[...currentTool.departments,...currentTool.roles];
  const inPackage=state.draft.source==="manual"&&state.draft.tools.some(item=>item.toolId===currentTool.platformId);
  function add(){requestLogin(()=>{setDraft(draft=>{const manual=asManualDraft(draft);return manual.tools.some(item=>item.toolId===currentTool.platformId)?manual:{...manual,tools:[...manual.tools,{toolId:currentTool.platformId,versionId:version.id,purpose:currentTool.problem,replaceable:false}],confirmedSections:[]}});setNotice("已加入当前工具包")})}
  function download(){requestLogin(()=>{downloadFile(toolDownloadUrl(currentTool.slug,version.version),`${currentTool.name}-${version.version}.zip`);window.setTimeout(()=>void refreshDownloads().catch(()=>undefined),500);setNotice(`正在下载 ${currentTool.name} ${version.version}`)})}
  function askAi(){requestLogin(()=>{setDraft(draft=>{const manual=asManualDraft(draft);return manual.tools.some(item=>item.toolId===currentTool.platformId)?manual:{...manual,tools:[...manual.tools,{toolId:currentTool.platformId,versionId:version.id,purpose:currentTool.problem,replaceable:false}],confirmedSections:[]}});router.push("/")})}
  return <main className={styles.detailPage}>
    <p className={styles.detailBreadcrumb}><Link href="/tools">工具工作台</Link><span>/</span><strong>{tool.name}</strong></p>
    <header className={styles.detailHero}>
      <span className={styles.detailHeroIcon}>{detailIcon}</span>
      <div className={styles.detailIdentity}>
        <h1>{tool.name}</h1>
        <p>{tool.problem}</p>
        <div className={styles.detailTags}>{tool.tags.slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div>
      </div>
      <div className={styles.detailVersion}><strong>{version.version}</strong><span><CheckCircle/> {verificationLabel(version.verification)}</span></div>
      <div className={styles.detailActions}>
        <button onClick={download}><DownloadSimple/>下载当前版本</button>
        <button onClick={add}><Plus/>{inPackage?"已在工具包":"加入工具包"}</button>
        <button onClick={askAi}><Sparkle/>带着这个工具问 AI</button>
      </div>
    </header>

    <section className={styles.relationSection}>
      <header><h2>选择更适合场景的主工具或衍生工具</h2><p>衍生工具基于主工具调整，适合更具体的使用场景。</p>{tool.parent||derived.length?<Link href={`/tools?parent=${tool.parentSlug??tool.id}`}>查看完整衍生谱系<ArrowRight/></Link>:null}</header>
      <div className={styles.relationGrid}>
        <article className={styles.mainToolCard}>
          <div><span className={styles.relationIconViolet}>{detailIcon}</span><strong>{tool.parent?"当前衍生工具":"主工具"}：{tool.name}</strong><em>当前使用</em><CheckCircle/></div>
          <p>{tool.problem}</p>
          <footer><span>{version.version}</span><button onClick={()=>setInfoTab("guide")}>查看详情<ArrowRight/></button></footer>
        </article>
        {parentTool?<Link className={styles.relationCard} href={`/tools/${parentTool.slug}`}><div><span className={styles.relationIconViolet}><Package/></span><strong>{parentTool.name}</strong><em>来源主工具</em></div><p>{tool.parent?.difference}</p><footer><span>{parentTool.versions[0]?.version}</span><b>查看主工具</b><span><ArrowRight/></span></footer></Link>:null}
        {derived.map((item,index)=>{
          const Icon=index===0?FileText:index===1?MicrosoftExcelLogo:ImageSquare;
          return <Link className={styles.relationCard} href={`/tools/${item.id}`} key={item.id}>
            <div><span className={index===0?styles.relationIconGreen:index===1?styles.relationIconOrange:styles.relationIconBlue}><Icon/></span><strong>{item.name.replace(/工具 · |版/g,"").slice(0,12)}</strong><em>衍生工具</em></div>
            <p>{item.parent?.difference}</p>
            <footer><span>基于 {tool.name}</span><b>{item.versions[0].version}</b><span>查看详情<ArrowRight/></span></footer>
          </Link>;
        })}
      </div>
    </section>

    <section className={styles.resultSection}>
      <h2>使用后能得到什么</h2>
      <div className={styles.outcomeGrid}>
        <article><span><Sparkle/></span><h3>解决的问题</h3><p>{tool.problem}</p></article>
        <article><span><Package/></span><h3>预期产出</h3><p>{tool.result}</p></article>
        <article><span><Info/></span><h3>实现方式</h3><p>{tool.principle}</p></article>
      </div>
      <p className={styles.outcomeNote}>具体输入、输出格式和运行方式以下载包内的 README 与版本说明为准；首次使用建议先用最小样例验证。</p>
    </section>

    <div className={styles.detailDecisionGrid}>
      <section className={styles.adoptionSection}>
        <h2>实际采用与反馈</h2>
        <p><Users/>{adoptionPeople.length?`${adoptionPeople.join("、")}已有采用记录`:"当前还没有部门或职能采用记录"}</p>
        <div className={styles.adoptionMetrics}>
          <div><DownloadSimple/><strong>{tool.downloads.toLocaleString()} 次</strong><small>累计下载</small></div>
          <div><Users/><strong>{tool.departments.length} 个部门</strong><small>采用部门</small></div>
          <div><Sparkle/><strong>{tool.rating?`${tool.rating} / 5`:"暂无评分"}</strong><small>用户评价</small></div>
        </div>
        <blockquote>{tool.downloads||tool.rating?"采用数据来自平台下载与评价记录。":"这是刚发布的工具，等待首批用户下载、验证和评价。"}</blockquote>
        <button onClick={()=>setInfoTab("reviews")}>查看全部评价与采用<ArrowRight/></button>
      </section>
      <section className={styles.judgementSection}>
        <h2>使用前判断</h2>
        <div><CheckCircle/><strong>适合</strong><p>{tool.problem}</p></div>
        <div><Package/><strong>预期结果</strong><p>{tool.result}</p></div>
        <div><WarningCircle/><strong>验证与风险</strong><p>{version.risks.length?version.risks.join("；"):`当前版本${verificationLabel(version.verification)}，建议先用小样本确认效果。`}</p></div>
      </section>
    </div>

    <section className={styles.detailInfoSection}>
      <nav aria-label="更多工具信息">
        <button className={infoTab==="guide"?styles.detailInfoActive:undefined} onClick={()=>setInfoTab(infoTab==="guide"?null:"guide")}>使用说明</button>
        <button className={infoTab==="versions"?styles.detailInfoActive:undefined} onClick={()=>setInfoTab(infoTab==="versions"?null:"versions")}>版本历史</button>
        <button className={infoTab==="reviews"?styles.detailInfoActive:undefined} onClick={()=>setInfoTab(infoTab==="reviews"?null:"reviews")}>评价与采用</button>
      </nav>
      {infoTab==="guide"?<div className={styles.guidePanel}><div><h3>能解决 / 不能解决</h3><p>{tool.problem}；不能替代最终业务验收。</p></div><div><h3>环境与风险</h3><p>{version.risks.length?version.risks.join("；"):"默认本地处理，无需高权限；建议先用样例验证。"}</p></div><div><h3>实现原理</h3><p>{tool.principle}</p></div></div>:null}
      {infoTab==="versions"?<div className={styles.detailVersionList}>{tool.versions.map(item=>{const selected=versionId===item.id;return <button aria-pressed={selected} className={selected?styles.detailVersionActive:undefined} onClick={()=>setVersionId(item.id)} key={item.id}><strong>{item.version}</strong><span>{item.releasedAt.slice(0,10)}</span><span>{verificationLabel(item.verification)}</span>{selected?<CheckCircle/>:<ArrowRight/>}</button>})}</div>:null}
      {infoTab==="reviews"?<div className={styles.detailReviews}><strong>{tool.rating?`${tool.rating} / 5`:"暂无评分"}</strong><p>累计下载：{tool.downloads.toLocaleString()} 次</p><p>采用部门：{tool.departments.length?tool.departments.join("、"):"暂无记录"}</p><p>采用职能：{tool.roles.length?tool.roles.join("、"):"暂无记录"}</p>{reviews.length?reviews.map(review=><blockquote key={review.id}><b>{review.rating} 星 · {review.author}</b>{review.comment?<span>{review.comment}</span>:null}<small>{new Date(review.createdAt).toLocaleDateString("zh-CN")}</small></blockquote>):<blockquote>还没有用户提交评价。</blockquote>}</div>:null}
    </section>
    {notice?<div className={styles.toast} role="status">{notice}<button onClick={()=>setNotice("")} aria-label="关闭提示"><X/></button></div>:null}
  </main>;
}
