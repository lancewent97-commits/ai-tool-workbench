"use client";

import {
  ArrowRight,
  Check,
  CheckCircle,
  Cube,
  FileText,
  FolderSimple,
  Info,
  Package,
  PaperPlaneTilt,
  ShieldCheck,
  SignOut,
  Sparkle,
  Wrench,
} from "@phosphor-icons/react";
import type {
  AiConversationStateResponse,
  PackageDraft,
  RecommendationCard,
} from "@ai-tool-workbench/contracts";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useWorkbench } from "@/lib/workbench-store";
import { savePackageDraft } from "@/lib/api/workspace-client";
import deepStyles from "./task-deep-dialog.module.css";
import briefStyles from "./task-brief-confirm.module.css";
import recommendationStyles from "./recommendation-primary.module.css";
import stateStyles from "./connected-task-workspace.module.css";
import { TaskFlowHeader } from "./task-flow-header";
import { useAiConversation } from "./use-ai-conversation";

export function ConnectedTaskWorkspace({
  conversationId,
  mode,
}: {
  conversationId: string;
  mode?: string;
}) {
  const task = useAiConversation(conversationId);
  if (task.loading) return <StateCard loading title="正在恢复任务" text="正在读取对话、任务说明和推荐记录…" />;
  if (task.error && !task.state) {
    return <StateCard title="暂时无法打开任务" text={task.error} action="重新加载" onAction={() => void task.reload()} />;
  }
  if (!task.state) return null;
  const connectedTask: TaskHook = { ...task, state: task.state };

  if (mode === "result") {
    return <ResultView conversationId={conversationId} goal={task.state.brief.goal} />;
  }
  if (mode === "deep" || task.state.phase === "clarifying") {
    return <ConversationView task={connectedTask} />;
  }
  if (mode === "brief" || task.state.phase === "brief-review") {
    return <BriefView task={connectedTask} />;
  }
  return <RecommendationView task={connectedTask} />;
}

function ResultView({ conversationId, goal }: { conversationId: string; goal: string }) {
  const router=useRouter();
  const {state}=useWorkbench();
  const task=state.tasks.find(item=>item.id===conversationId);
  const download=state.downloads.find(item=>item.sourceTaskId===conversationId&&item.feedbackState==="submitted");
  const result=task?.result??download?.feedbackResult;
  const label=result==="complete"?"全部完成":result==="partial"?"部分完成":result==="failed"?"未完成":"尚未提交结果";
  return <main className={stateStyles.resultPage}>
    <section className={stateStyles.resultCard}>
      <span><CheckCircle size={28}/></span>
      <small>任务结果记录</small>
      <h1>{goal}</h1>
      <dl><div><dt>完成情况</dt><dd>{label}</dd></div><div><dt>反馈时间</dt><dd>{download?.feedbackSubmittedAt?new Date(download.feedbackSubmittedAt).toLocaleString("zh-CN",{hour12:false}):"—"}</dd></div>{download?.feedbackRating?<div><dt>工具评分</dt><dd>{download.feedbackRating} / 5</dd></div>:null}</dl>
      {download?.feedbackComment?<blockquote>{download.feedbackComment}</blockquote>:<p>没有补充文字说明。</p>}
      <div><button onClick={()=>router.push("/me/downloads")}>查看下载凭证</button>{task?.packageVersionIds.at(-1)?<button onClick={()=>router.push(`/packages/${task.packageVersionIds.at(-1)}/ready`)}>重新下载工具包</button>:null}</div>
    </section>
  </main>;
}

type TaskHook = ReturnType<typeof useAiConversation> & {
  state: AiConversationStateResponse;
};

function ConversationView({ task }: { task: TaskHook }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const brief = task.state.brief;
  const questions = task.state.questions.length
    ? task.state.questions
    : brief.openQuestions.map((text, index) => ({
        id: `question-${index}`,
        text,
        why: "",
        options: [],
      }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const selectedAnswers = questions
      .filter((question) => answers[question.id])
      .map((question) => `${question.text}：${answers[question.id]}`)
      .join("\n");
    const value = [selectedAnswers, message.trim()].filter(Boolean).join("\n");
    if (!value) return;
    setMessage("");
    setAnswers({});
    void task.send(value);
  }

  return <main className={deepStyles.page}>
    <TaskFlowHeader
      title={brief.goal}
      status={task.state.phase === "clarifying" ? "正在梳理需求" : "需求已更新"}
      actions={<button type="button" onClick={() => router.push("/")}><SignOut size={19}/>保存退出</button>}
    />
    <section className={deepStyles.understanding}>
      <p><strong>当前理解：</strong>{brief.goal}</p>
      <button type="button" onClick={() => document.getElementById("connected-ai-input")?.focus()}>继续修改</button>
    </section>
    <section className={deepStyles.conversation} aria-label="需求梳理对话">
      {task.state.messages.map((item) => item.role === "user"
        ? <div className={deepStyles.userMessage} key={item.id}><span>我</span><p>{item.content}</p></div>
        : <div className={deepStyles.assistantMessage} key={item.id}><span><Cube size={24} weight="duotone"/></span><div><p>{item.content}</p></div></div>)}
      {questions.map((question) => <div className={deepStyles.assistantMessage} key={question.id}><span><Cube size={24}/></span><div className={deepStyles.questionCard}><p className={deepStyles.followUp}>{question.text}</p>{question.why?<small>{question.why}</small>:null}{question.options.length?<div className={deepStyles.answerRow}>{question.options.map(option=><button className={answers[question.id]===option?deepStyles.answerSelected:deepStyles.answer} type="button" aria-pressed={answers[question.id]===option} key={option} onClick={()=>setAnswers(current=>({...current,[question.id]:option}))}>{answers[question.id]===option?<Check size={16}/>:null}{option}</button>)}</div>:null}</div></div>)}
    </section>
    <div className={deepStyles.composerArea}>
      <div className={deepStyles.readyBar}><p><span><Check size={15} weight="bold"/></span>{questions.length ? `还需要确认 ${questions.length} 项` : "任务说明已经可以确认"}</p>{!questions.length?<button onClick={()=>router.push(`/tasks/${task.state.conversationId}?mode=brief`)}>查看任务说明</button>:Object.keys(answers).length?<button type="submit" form="connected-ai-form">提交已选答案</button>:null}</div>
      <form className={deepStyles.composer} id="connected-ai-form" onSubmit={submit}>
        <textarea id="connected-ai-input" value={message} rows={2} placeholder={task.state.phase === "recommended" ? "告诉AI要修改什么…" : "回答问题或继续补充需求…"} onChange={event=>setMessage(event.target.value)} />
        {task.error?<div className={stateStyles.inlineError} role="alert"><p>{task.error}</p><button type="button" disabled={task.working} onClick={()=>void task.retry()}>{task.working?"正在重试…":"重试上一步"}</button></div>:null}
        <button className={deepStyles.sendButton} type="submit" disabled={(!message.trim()&&!Object.keys(answers).length)||task.working} aria-label="发送需求"><PaperPlaneTilt size={23} weight="fill"/></button>
      </form>
    </div>
  </main>;
}

function BriefView({ task }: { task: TaskHook }) {
  const router = useRouter();
  const brief = task.state.brief;

  async function confirm() {
    const succeeded = await task.confirm();
    if (succeeded) router.replace(`/tasks/${task.state.conversationId}?mode=recommend`);
  }

  return <main className={briefStyles.page}>
    <TaskFlowHeader
      title={brief.goal}
      status="需求草稿待确认"
      actions={<><button onClick={()=>router.push(`/tasks/${task.state.conversationId}?mode=deep`)}><FileText size={19}/>查看原始对话</button><button onClick={()=>router.push("/")}><SignOut size={19}/>保存退出</button></>}
    />
    <article className={briefStyles.document}>
      <div className={briefStyles.documentHeader}><h1>{shortTitle(brief.goal)} · 任务说明</h1><p><Sparkle size={19} weight="fill"/>我根据你的描述整理了这份任务说明。确认后再推荐工具。</p><span className={briefStyles.versionButton}>当前版本 v{brief.version}</span></div>
      <section className={briefStyles.section}><h2>要解决的问题</h2><p>{brief.goal}</p></section>
      <section className={briefStyles.section}><h2>输入材料</h2><p>{brief.input || "暂未明确，按常规输入处理"}</p></section>
      <section className={briefStyles.section}><h2>最终交付</h2><ul className={stateStyles.briefList}>{brief.deliverables.map(item=><li key={item}>{item}</li>)}</ul></section>
      {brief.constraints.length?<section className={briefStyles.section}><h2>限制条件</h2><ul className={stateStyles.briefList}>{brief.constraints.map(item=><li key={item}>{item}</li>)}</ul></section>:null}
      {brief.assumptions.length||brief.openQuestions.length?<section className={briefStyles.uncertain}><div className={briefStyles.uncertainHeading}><h2>假设与待确认</h2><span><i/>{brief.openQuestions.length} 项待确认</span></div><ul className={stateStyles.briefList}>{[...brief.assumptions,...brief.openQuestions].map(item=><li key={item}>{item}</li>)}</ul></section>:null}
    </article>
    <footer className={briefStyles.confirmBar}><p>任务说明版本 <strong>v{brief.version}</strong>{task.error?<span className={stateStyles.messageError}>{task.error}</span>:null}</p><div><button className={briefStyles.secondaryButton} onClick={()=>router.push(`/tasks/${task.state.conversationId}?mode=deep`)}>继续修改</button><button className={briefStyles.primaryButton} disabled={task.working||brief.openQuestions.length>0} onClick={()=>void confirm()}>{task.working?"正在生成推荐…":task.error?"重试生成推荐":"确认任务说明，查看推荐方案"}</button></div></footer>
  </main>;
}

function RecommendationView({ task }: { task: TaskHook }) {
  const router = useRouter();
  const { setDraft, updateTask } = useWorkbench();
  const [choosing, setChoosing] = useState(false);
  const [choiceError, setChoiceError] = useState("");
  const recommendation = task.state.recommendation;
  const primary = recommendation?.primary;
  if (!primary) return <StateCard title="推荐尚未生成" text="请先确认任务说明。" action="返回任务说明" onAction={()=>router.push(`/tasks/${task.state.conversationId}?mode=brief`)}/>;

  async function choose(card: RecommendationCard) {
    setChoosing(true);
    setChoiceError("");
    const selections = card.tools.map(item => ({
      toolId: item.toolId,
      versionId: item.toolVersionId,
      purpose: item.purpose,
      replaceable: item.source !== "user-selected",
    }));
    const draft: PackageDraft = {
      id: `ai-${task.state.conversationId}`,
      source: "ai",
      taskId: task.state.conversationId,
      name: card.title,
      goal: task.state.brief.goal,
      deliverables: card.deliverables,
      tools: selections,
      plannedComponents: card.gaps.map((gap,index)=>({
        id:`gap-${index}`,
        name:gap.name,
        goal:gap.goal,
        acceptance:[
          `完成目标：${gap.goal}`,
          `输出可支持：${card.deliverables.join("、")}`,
          "使用最小脱敏样本记录验证结果",
          "符合平台生产标准且不覆盖原始组件",
        ],
        prompt:gap.productionPrompt,
      })),
      confirmedSections: [],
      userConfirmedFields: [],
    };
    try {
      await savePackageDraft(draft);
      setDraft(()=>draft);
      updateTask(task.state.conversationId,{stage:"package-review",needsUserAction:true});
      router.push(`/packages/drafts/${draft.id}/confirm`);
    } catch (error) {
      setChoiceError(error instanceof Error ? error.message : "保存工具包草稿失败");
      setChoosing(false);
    }
  }

  return <main className={recommendationStyles.page}>
    <TaskFlowHeader
      title={task.state.brief.goal}
      status="方案已生成"
      actions={<><button onClick={()=>router.push(`/tasks/${task.state.conversationId}?mode=brief`)}><FileText size={19}/>查看任务说明</button><button onClick={()=>router.push("/")}><SignOut size={19}/>保存退出</button></>}
    />
    <section className={recommendationStyles.intro}><span><Check size={20} weight="bold"/></span><p>根据已确认的任务说明，我为你找到一套最合适的工具组合。</p></section>
    <section className={recommendationStyles.primaryCard}>
      <div className={recommendationStyles.solutionHeader}><span className={recommendationStyles.sparkle}><Sparkle size={31} weight="fill"/></span><div><div className={recommendationStyles.titleRow}><h1 title={primary.title}>{primary.title}</h1><b>最推荐</b></div><p title={primary.summary}>{primary.summary}</p><div className={recommendationStyles.tags}><span><Package size={18}/>{primary.tools.length}个工具</span><span><FolderSimple size={18}/>{primary.deliverables.length}项交付</span><span><ShieldCheck size={18}/>{primary.coverage==="complete"?"完整覆盖":"部分覆盖"}</span></div></div></div>
      <div className={recommendationStyles.toolTable}>{primary.tools.map((tool,index)=><div className={recommendationStyles.toolRow} key={tool.toolVersionId}><span className={recommendationStyles.toolNumber}>{index+1}</span><span className={`${recommendationStyles.toolIcon} ${recommendationStyles.violet}`}><Wrench size={20}/></span><p className={recommendationStyles.toolName}><strong title={tool.toolName}>{tool.toolName}</strong><span>{tool.version}</span></p><p className={recommendationStyles.toolPurpose} title={tool.purpose}>{tool.purpose}</p><button onClick={()=>router.push(`/tools/${tool.toolSlug}`)}>查看工具</button><span className={recommendationStyles.published}><CheckCircle size={18}/>{tool.source==="user-selected"?"本人选择":"平台已发布"}</span></div>)}</div>
      <div className={recommendationStyles.deliverables}><h2>最终会得到</h2><div>{primary.deliverables.map(item=><span key={item}><FolderSimple size={23} weight="fill"/>{item}</span>)}</div></div>
      <div className={stateStyles.recommendationReason}><strong>为什么推荐这个方案</strong><p>{primary.reason}</p>{primary.limitations.length?<ul>{primary.limitations.map(item=><li key={item}>{item}</li>)}</ul>:null}</div>
      {primary.gaps.length?<div className={stateStyles.gapList}>{primary.gaps.map(gap=><article key={gap.name}><h3>待生产：{gap.name}</h3><p>{gap.reason}</p><details><summary>查看给本地 Agent 的生产提示词</summary><pre>{gap.productionPrompt}</pre></details></article>)}</div>:null}
      <p className={recommendationStyles.agentNote}><Info size={20}/>工具包交给本地 Agent 后，由 Agent 规划具体执行顺序。</p>
      {choiceError?<p className={stateStyles.messageError} role="alert">{choiceError}</p>:null}
      <div className={recommendationStyles.cardActions}><button className={recommendationStyles.secondaryButton} onClick={()=>router.push(`/tasks/${task.state.conversationId}?mode=deep`)}>告诉AI修改</button><button className={recommendationStyles.primaryButton} disabled={choosing} onClick={()=>void choose(primary)}>{choosing?"正在保存草稿…":"选择此方案，进入打包确认"}</button></div>
    </section>
    {recommendation.alternatives.length?<section className={recommendationStyles.alternatives}><h2>其他可选方案 <span>{recommendation.alternatives.length}</span></h2><div>{recommendation.alternatives.map(card=><article key={card.id}><span><Package size={24}/></span><h3>{card.title}</h3><p>{card.summary}</p><button disabled={choosing} onClick={()=>void choose(card)}>选择<ArrowRight size={18}/></button></article>)}</div></section>:null}
    <div className={recommendationStyles.coverage}><ShieldCheck size={20}/><span>能力覆盖：</span><strong>{primary.coverage==="complete"?"完整覆盖当前任务要求":"现有工具部分覆盖，缺口说明已加入"}</strong><Info size={19}/><span>使用前建议在本地验证输出效果</span></div>
  </main>;
}

function StateCard({loading=false,title,text,action,onAction}:{loading?:boolean;title:string;text:string;action?:string;onAction?:()=>void}) {
  return <main className={stateStyles.statePage}><section className={stateStyles.stateCard}><span className={loading?stateStyles.spin:undefined}>{loading?<Sparkle size={24}/>:<Info size={24}/>}</span><h1>{title}</h1><p>{text}</p>{action?<button onClick={onAction}>{action}</button>:null}</section></main>;
}

function shortTitle(goal:string){return goal.length>24?`${goal.slice(0,24)}…`:goal}
