"use client";

import {
  ArrowRight,
  DotsThree,
  FilePpt,
  FileText,
  FileXls,
  MagnifyingGlass,
  Package,
  SelectionPlus,
  Sparkle,
  SquaresFour,
  Target,
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  type CompletedTask,
  type InProgressTask,
} from "./home-data";
import styles from "./ai-home.module.css";
import { useWorkbench } from "@/lib/workbench-store";
import { createAiConversation } from "@/lib/api/ai-client";
import { ApiClientError } from "@/lib/api/http-client";

const fileIcons = {
  doc: FileText,
  sheet: FileXls,
  slides: FilePpt,
};

export function AiHome() {
  const router = useRouter();
  const {
    state,
    authReady,
    requestLogin,
    addAiTask,
    markSignedOut,
    setDraft,
  } = useWorkbench();
  const [mode] = useState<"ai" | "manual">("ai");
  const [requirement, setRequirement] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedTools = state.draft.source === "manual" ? state.draft.tools : [];

  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const tasks = useMemo<InProgressTask[]>(() => [
    ...state.tasks.filter((task) =>
      !["ready", "completed"].includes(task.stage)).map((task) => ({
      id: task.id,
      title: task.name,
      summary: task.goal,
      status: task.stage === "clarifying" ? "等待补充需求" : task.stage === "brief-review" ? "任务说明待确认" : task.stage === "recommended" ? "方案已生成" : "处理中",
      progressLabel: task.stage === "clarifying" ? "需求梳理" : task.stage === "brief-review" ? "确认后推荐" : "可继续查看",
      progress: task.stage === "clarifying" ? 24 : task.stage === "brief-review" ? 55 : 74,
      image: "/assets/task-cards/review-kit.png",
    })),
  ], [state.tasks]);
  const completedTasks = useMemo<CompletedTask[]>(() =>
    state.tasks
      .filter((task) => ["ready", "completed"].includes(task.stage))
      .map((task) => ({
        id: task.id,
        title: task.name,
        summary: task.goal,
        date: task.updatedAt.slice(0, 10),
        action: task.stage === "ready" ? "查看工具包" : "查看任务",
        fileType: "doc",
      })), [state.tasks]);
  const visibleTasks = useMemo(
    () => tasks.filter((task) => matchesTask(task, normalizedQuery)),
    [tasks, normalizedQuery],
  );
  const visibleCompleted = useMemo(
    () => completedTasks.filter((task) => matchesTask(task, normalizedQuery)),
    [completedTasks, normalizedQuery],
  );

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goal = requirement.trim();
    if (!goal) {
      textareaRef.current?.focus();
      return;
    }

    requestLogin(() => void createRemoteTask(goal));
  }

  async function createRemoteTask(goal: string) {
    setCreating(true);
    setNotice("AI 正在整理你的需求…");
    try {
      const response = await createAiConversation(
        goal,
        selectedTools.map((tool) => tool.versionId),
      );
      addAiTask(response);
      setRequirement("");
      setNotice("需求已保存，正在进入任务工作区。");
      router.push(`/tasks/${response.conversationId}`);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setNotice("");
        markSignedOut(() => void createRemoteTask(goal));
      } else {
        setNotice(error instanceof Error ? error.message : "创建任务失败，请稍后重试");
      }
    } finally {
      setCreating(false);
    }
  }

  function startNewTask() {
    setQuery("");
    setNotice("");
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <main className={styles.page}>
      <h1>把想做的事，变成可直接使用的工具包</h1>

      <form className={styles.composer} onSubmit={createTask}>
        <div className={styles.modeSwitch} aria-label="组包方式">
          <button
            className={mode === "ai" ? styles.modeActive : styles.modeButton}
            type="button"
            aria-pressed={mode === "ai"}
            onClick={() => textareaRef.current?.focus()}
          >
            <Sparkle aria-hidden size={19} weight="fill" />
            AI帮我选
          </button>
          <button
            className={mode === "manual" ? styles.modeActive : styles.modeButton}
            type="button"
            aria-pressed={mode === "manual"}
            onClick={() => router.push("/tools")}
          >
            <SquaresFour aria-hidden size={20} />
            我自己选
          </button>
        </div>

        <div className={styles.inputPanel}>
          {selectedTools.length ? (
            <div className={styles.selectedContext}>
              <Package aria-hidden size={18} />
              <span>
                已带入 {selectedTools.length} 个本人选择的工具，AI 只能补充建议，不能静默移除
              </span>
              <button
                type="button"
                onClick={() => setDraft((draft) => ({
                  ...draft,
                  tools: [],
                  confirmedSections: [],
                }))}
              >
                清除
              </button>
            </div>
          ) : null}
          <label className="sr-only" htmlFor="task-requirement">任务需求</label>
          <textarea
            id="task-requirement"
            ref={textareaRef}
            value={requirement}
            onChange={(event) => setRequirement(event.target.value)}
            placeholder={
              mode === "ai"
                ? "说说你要处理什么、最后希望得到什么…"
                : ""
            }
            maxLength={600}
          />
          <button className={styles.createButton} type="submit" disabled={creating || !authReady}>
            <ArrowRight aria-hidden size={20} weight="bold" />
            {!authReady ? "正在检查登录…" : creating ? "正在创建…" : "创建任务"}
          </button>
        </div>
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      </form>

      <section className={styles.tasksSection} aria-labelledby="my-tasks-heading">
        <div className={styles.sectionHeader}>
          <h2 id="my-tasks-heading">我的任务</h2>
          <div className={styles.taskActions}>
            <label className={styles.searchBox}>
              <MagnifyingGlass aria-hidden size={19} />
              <span className="sr-only">搜索任务</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索任务名称或目标…"
              />
            </label>
            <button className={styles.newTaskButton} type="button" onClick={startNewTask}>
              <SelectionPlus aria-hidden size={20} />
              新建任务
            </button>
          </div>
        </div>

        <div className={styles.taskColumns}>
          <div>
            <h3 className={styles.columnTitle}>进行中 <span>{visibleTasks.length}</span></h3>
            <div className={styles.inProgressGrid}>
              {visibleTasks.map((task) => <ProgressTaskCard key={task.id} task={task} />)}
              {!visibleTasks.length
                ? <p className={styles.notice}>还没有进行中的任务，可以从上方描述一个新需求。</p>
                : null}
            </div>
          </div>

          <div>
            <h3 className={styles.columnTitle}>最近完成 <span>{visibleCompleted.length}</span></h3>
            <div className={styles.completedList}>
              {visibleCompleted.map((task) => <CompletedTaskRow key={task.id} task={task} />)}
              {!visibleCompleted.length
                ? <p className={styles.notice}>完成并生成过的工具包会显示在这里。</p>
                : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function ProgressTaskCard({ task }: { task: InProgressTask }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article className={styles.taskCard}>
      <div className={styles.taskArtwork}>
        <Image
          className={task.id === "parent-kit" ? styles.zoomArtwork : undefined}
          src={task.image}
          alt=""
          fill
          sizes="(max-width: 1200px) 45vw, 332px"
          priority
        />
        <button type="button" aria-label={`打开${task.title}菜单`} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
          <DotsThree aria-hidden size={24} weight="bold" />
        </button>
        {menuOpen ? <div className={styles.taskMenu} role="menu"><Link role="menuitem" href={`/tasks/${task.id}`}>继续这个任务</Link><Link role="menuitem" href="/me/tasks">查看全部任务</Link></div> : null}
      </div>
      <div className={styles.taskCardBody}>
        <h4><Link href={`/tasks/${task.id}`}>{task.title}</Link></h4>
        <p className={styles.taskSummary}><Target aria-hidden size={18} />{task.summary}</p>
        <div className={styles.progressMeta}>
          <span><i />{task.status}</span>
          <span>{task.progressLabel}</span>
        </div>
        <div className={styles.progressTrack} aria-label={`${task.progress}% 完成`}>
          <span style={{ width: `${task.progress}%` }} />
        </div>
      </div>
    </article>
  );
}

function CompletedTaskRow({ task }: { task: CompletedTask }) {
  const Icon = fileIcons[task.fileType];

  return (
    <article className={styles.completedRow}>
      <span className={`${styles.fileIcon} ${styles[task.fileType]}`}>
        <Icon aria-hidden size={25} weight="duotone" />
      </span>
      <div className={styles.completedCopy}>
        <h4>{task.title}</h4>
        <p>{task.summary}</p>
      </div>
      <time dateTime={task.date}>{task.date}</time>
      <Link href={`/tasks/${task.id}`}>{task.action}</Link>
    </article>
  );
}

function matchesTask(task: { title: string; summary: string }, query: string) {
  return !query || `${task.title} ${task.summary}`.toLocaleLowerCase("zh-CN").includes(query);
}
