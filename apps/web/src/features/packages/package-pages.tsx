"use client";

import type {
  PackageDraft,
  PackageVersionRecord,
} from "@ai-tool-workbench/contracts";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  FileText,
  Info,
  Package,
  PencilSimple,
  Play,
  ShieldWarning,
  Sparkle,
  UploadSimple,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useResolvedDraftTools } from "@/features/tools/use-resolved-draft-tools";
import { useModalDialog } from "@/hooks/use-modal-dialog";
import {
  getPackageDraft,
  generatePackage,
  getPackageVersion,
  packageDownloadUrl,
  savePackageDraft,
} from "@/lib/api/workspace-client";
import { copyText, downloadFile } from "@/lib/download";
import { useWorkbench } from "@/lib/workbench-store";
import styles from "./package-pages.module.css";

const sections = ["目标与交付", "工具与版本", "Agent任务要求", "使用前提醒"];
export function PackageConfirm({ draftId }: { draftId: string }) {
  const router = useRouter();
  const { state, setDraft } = useWorkbench();
  const draft = state.draft;
  const [draftReady, setDraftReady] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [step, setStep] = useState(0);
  const [allOpen, setAllOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const riskDialogRef = useModalDialog<HTMLElement>(riskOpen, () => setRiskOpen(false));
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const resolvedSelection = useResolvedDraftTools(draft.tools);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setDraftReady(false);
      setDraftError("");
    });
    void getPackageDraft(draftId)
      .then((record) => {
        if (!active) return;
        setDraft(() => record.draft);
        setDraftReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setDraftError(error instanceof Error ? error.message : "读取工具包草稿失败");
      });
    return () => {
      active = false;
    };
  }, [draftId, setDraft]);

  useEffect(() => {
    if (!draftReady || draft.id !== draftId) return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void savePackageDraft(draft)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("error"));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft, draftId, draftReady]);

  if (!draftReady) {
    return (
      <main className={styles.confirmPage}>
        <header>
          <div>
            <h1>{draftError ? "暂时无法打开工具包草稿" : "正在恢复工具包草稿"}</h1>
            <p>{draftError || "正在读取工具版本、交付物和确认进度…"}</p>
          </div>
          {draftError
            ? <button type="button" onClick={() => window.location.reload()}>重新加载</button>
            : null}
        </header>
      </main>
    );
  }

  const tools = resolvedSelection.items;
  const risks = tools.flatMap(({ tool, selection }) =>
    tool.versions.find((version) => version.id === selection.versionId)?.risks ?? []);
  const confirmed = new Set(draft.confirmedSections);
  const canGenerate = sections.every((item) => confirmed.has(item))
    && (!risks.length || riskAccepted)
    && saveState !== "error";

  function updateDraft(update: (value: PackageDraft) => PackageDraft) {
    setDraft(update);
  }

  function confirmSection() {
    updateDraft((value) => ({
      ...value,
      confirmedSections: Array.from(new Set([
        ...value.confirmedSections,
        sections[step],
      ])),
    }));
    if (step < 3) setStep((value) => value + 1);
  }

  async function generate() {
    if (risks.length && !riskAccepted) {
      setRiskOpen(true);
      return;
    }
    setGenerating(true);
    setGenerationError("");
    try {
      await savePackageDraft(draft);
      const result = await generatePackage(draft.id);
      router.push(`/packages/${result.packageVersion.id}/ready`);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "生成工具包失败");
      setGenerating(false);
    }
  }

  return (
    <main className={styles.confirmPage}>
      <p className={styles.breadcrumb}>{draft.name} / 确认工具包</p>
      <header>
        <div>
          <h1>确认这个工具包</h1>
          <p>逐段确认要做什么、用什么以及本地 Agent 会收到什么。</p>
          <small role="status">{saveState === "saving" ? "正在保存草稿…" : saveState === "error" ? "草稿保存失败，请重试" : "草稿已保存"}</small>
          {resolvedSelection.loading ? <small role="status">正在读取锁定工具版本…</small> : null}
          {resolvedSelection.error ? <small role="alert">读取工具信息失败：{resolvedSelection.error}</small> : null}
        </div>
        <button className={styles.viewAll} type="button" onClick={() => setAllOpen((value) => !value)}>
          {allOpen ? "分段查看" : "直接查看全部内容"}
        </button>
      </header>

      <div className={styles.confirmLayout}>
        <nav className={styles.stepsNav}>
          {sections.map((item, index) => (
            <button
              className={step === index ? styles.stepActive : undefined}
              key={item}
              type="button"
              onClick={() => setStep(index)}
            >
              <span>{index + 1}</span>
              <strong>{item}</strong>
              {confirmed.has(item) ? <CheckCircle /> : null}
            </button>
          ))}
        </nav>

        <section className={styles.confirmContent}>
          <div className={styles.notice}>
            <Info />
            <strong>{draft.source === "manual" ? "手动组包不会自动调用 AI" : "以下内容将写入最终下载包"}</strong>
            <span>这些分段是下载前检查，不代表 Agent 执行顺序。</span>
          </div>

          {allOpen || step === 0 ? (
            <ConfirmBlock title="目标与交付" active={step === 0}>
              <div className={styles.goalSummary}>
                <div>
                  <h3>最终目标</h3>
                  {editing ? (
                    <textarea
                      value={draft.goal ?? ""}
                      onChange={(event) => updateDraft((value) => ({
                        ...value,
                        goal: event.target.value,
                        confirmedSections: value.confirmedSections.filter(
                          (item) => item !== "目标与交付",
                        ),
                        userConfirmedFields: Array.from(new Set([
                          ...value.userConfirmedFields,
                          "goal",
                        ])),
                      }))}
                    />
                  ) : <p>{draft.goal || "未填写目标。本地 Agent 将根据所选工具自行规划。"}</p>}
                </div>
                <button type="button" onClick={() => setEditing((value) => !value)}>
                  <PencilSimple />{editing ? "保存" : "修改"}
                </button>
              </div>
              <h3>主要交付物</h3>
              <div className={styles.deliverables}>
                {draft.deliverables.length
                  ? draft.deliverables.map((item) => <span key={item}><FileText />{item}</span>)
                  : <span>未限定交付物</span>}
              </div>
              {draft.source === "ai" ? (
                <button
                  className={styles.askAi}
                  type="button"
                  onClick={() => router.push(`/tasks/${draft.taskId}?mode=deep`)}
                >
                  <Sparkle />告诉 AI 修改
                </button>
              ) : null}
            </ConfirmBlock>
          ) : null}

          {allOpen || step === 1 ? (
            <ConfirmBlock title="包中工具与锁定版本" active={step === 1}>
              <div className={styles.packageToolList}>
                {tools.map(({ tool, selection }) => (
                  <article key={tool.id}>
                    <span className={styles.toolGlyph}><Package /></span>
                    <div>
                      <h2>
                        {tool.name}
                        <span>{tool.versions.find((version) => version.id === selection.versionId)?.version}</span>
                      </h2>
                      <p>{selection.purpose} · {selection.replaceable ? "允许经确认后替换" : "不允许 AI 静默替换"}</p>
                    </div>
                    <Link href={`/tools/${tool.slug}`}>查看详情</Link>
                    <select
                      aria-label={`更换${tool.name}版本`}
                      value={selection.versionId}
                      onChange={(event) => updateDraft((value) => ({
                        ...value,
                        tools: value.tools.map((item) =>
                          item.toolId === selection.toolId
                            ? { ...item, versionId: event.target.value }
                            : item),
                        confirmedSections: value.confirmedSections.filter(
                          (item) => item !== "工具与版本",
                        ),
                      }))}
                    >
                      {tool.versions.map((version) => (
                        <option value={version.id} key={version.id}>{version.version}</option>
                      ))}
                    </select>
                  </article>
                ))}
              </div>
              {draft.plannedComponents.map((item) => (
                <article className={styles.planned} key={item.id}>
                  <Sparkle />
                  <div>
                    <strong>待生产组件：{item.name}</strong>
                    <p>{item.goal}；验收：{item.acceptance.join("、")}</p>
                  </div>
                </article>
              ))}
            </ConfirmBlock>
          ) : null}

          {allOpen || step === 2 ? (
            <ConfirmBlock title="Agent 将收到的任务要求" active={step === 2}>
              <ul className={styles.ruleList}>
                <li><Check />读取任务、工具说明和生产标准</li>
                <li><Check />先给出计划并等待用户确认</li>
                <li><Check />优先配置，其次适配，最后才修改</li>
                <li><Check />不得覆盖原始工具，修改必须形成衍生目录</li>
                <li><Check />记录来源、变化、验证结果和回滚方法</li>
              </ul>
              <button className={styles.previewRules} type="button" onClick={() => router.push("/standards")}>
                查看详细规则摘要
              </button>
            </ConfirmBlock>
          ) : null}

          {allOpen || step === 3 ? (
            <ConfirmBlock title="使用前提醒" active={step === 3}>
              <div className={styles.reminders}>
                <p><CheckCircle />同一工具包可用于 Codex、Claude、Hermes、OpenClaw、Trae、Qoder 等本地 Agent。</p>
                <p><Info />建议先用少量内容验证输出，再进行批量生产。</p>
                {risks.map((risk) => <p className={styles.highRisk} key={risk}><ShieldWarning />{risk}</p>)}
              </div>
              {risks.length ? (
                <label className={styles.riskCheck}>
                  <input
                    type="checkbox"
                    checked={riskAccepted}
                    onChange={(event) => setRiskAccepted(event.target.checked)}
                  />
                  我已了解以上费用或外部传输风险
                </label>
              ) : null}
            </ConfirmBlock>
          ) : null}

          <footer>
            <button type="button" onClick={() => router.back()}><ArrowLeft />返回调整</button>
            {sections.every((item) => confirmed.has(item)) ? (
              <button type="button" disabled={!canGenerate || generating} onClick={() => void generate()}>
                {generating ? "正在生成…" : "确认并生成工具包"}<ArrowRight />
              </button>
            ) : !confirmed.has(sections[step]) ? (
              <button type="button" onClick={confirmSection}>确认本段<Check /></button>
            ) : !allOpen && step < 3 ? (
              <button type="button" onClick={() => setStep((value) => value + 1)}>查看下一段<ArrowRight /></button>
            ) : (
              <button type="button" onClick={() => setStep(0)}>返回未确认部分<ArrowLeft /></button>
            )}
          </footer>
          {generationError ? (
            <div role="alert" className={styles.notice}>
              <Info />
              <strong>工具包生成失败</strong>
              <span>{generationError}</span>
            </div>
          ) : null}
        </section>

        <aside className={styles.packageSummary}>
          <h2>当前工具包</h2>
          <p><Package />{draft.name}</p>
          <h3>最终目标</h3>
          <span>{draft.goal || "未填写"}</span>
          <h3>确认进度</h3>
          <div className={styles.progress}><i style={{ width: `${confirmed.size / 4 * 100}%` }} /></div>
          <small>{confirmed.size}/4 已确认 · {tools.length}个工具 · {draft.plannedComponents.length}个能力缺口</small>
          <h3>交付内容</h3>
          <ul>{draft.deliverables.map((item) => <li key={item}>{item}</li>)}</ul>
          <button type="button" disabled={!canGenerate} onClick={() => void generate()}>确认并生成下载</button>
        </aside>
      </div>

      {riskOpen ? (
        <div className={styles.modalBackdrop} role="presentation">
          <section ref={riskDialogRef} tabIndex={-1} className={styles.riskDialog} role="dialog" aria-modal="true" aria-labelledby="package-risk-title">
            <ShieldWarning />
            <h2 id="package-risk-title">下载前确认高影响风险</h2>
            {risks.map((risk) => <p key={risk}>{risk}</p>)}
            <label>
              <input
                type="checkbox"
                checked={riskAccepted}
                onChange={(event) => setRiskAccepted(event.target.checked)}
              />
              我已了解并继续
            </label>
            <button
              type="button"
              disabled={!riskAccepted}
              onClick={() => {
                setRiskOpen(false);
                void generate();
              }}
            >
              确认并生成
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ConfirmBlock({
  title,
  active,
  children,
}: {
  title: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`${styles.confirmBlock} ${active ? styles.confirmBlockActive : ""}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function DownloadReady({ packageVersionId }: { packageVersionId: string }) {
  const router = useRouter();
  const { refreshDownloads, updateTask } = useWorkbench();
  const [copied, setCopied] = useState(false);
  const [packageVersion, setPackageVersion] = useState<PackageVersionRecord | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function refresh() {
      try {
        const { packageVersion: record } = await getPackageVersion(packageVersionId);
        if (!active) return;
        setPackageVersion(record);
        if (record.status === "generating") {
          timer = window.setTimeout(() => void refresh(), 800);
        }
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "读取工具包版本失败");
      }
    }
    void refresh();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [packageVersionId]);

  useEffect(() => {
    if (!packageVersion || packageVersion.status !== "ready") return;
    const key = `downloaded:${packageVersionId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const url = packageDownloadUrl(packageVersion.downloadUrl);
    if (packageVersion.taskId) {
      updateTask(packageVersion.taskId, {
        stage: "ready",
        needsUserAction: false,
        packageVersionIds: [packageVersionId],
      });
    }
    downloadFile(url, `${packageVersion.name}-${packageVersion.version}.zip`);
    window.setTimeout(() => void refreshDownloads().catch(() => undefined), 500);
  }, [packageVersionId, packageVersion, refreshDownloads, updateTask]);

  async function copy() {
    if (!packageVersion) return;
    await copyText(packageVersion.startPrompt);
    setCopied(true);
  }

  if (!packageVersion) {
    return (
      <main className={styles.readyPage}>
        <section className={styles.successHeader}>
          <Package size={44} />
          <div>
            <h1>{loadError ? "暂时无法打开工具包" : "正在读取工具包版本"}</h1>
            <p>{loadError || "正在核对锁定版本与下载文件…"}</p>
            {loadError ? <button type="button" onClick={() => window.location.reload()}>重新加载</button> : null}
          </div>
        </section>
      </main>
    );
  }

  if (packageVersion.status !== "ready") {
    const failed = packageVersion.status === "failed";
    return (
      <main className={styles.readyPage}>
        <section className={styles.successHeader}>
          <Package size={44} />
          <div>
            <h1>{failed ? "工具包生成失败" : "正在生成工具包"}</h1>
            <p>{failed
              ? packageVersion.errorMessage || "生成过程中出现问题，请返回确认页重新生成。"
              : "正在流式写入锁定工具、规则和目标文件；较大的工具包需要多等一会儿。"}</p>
            {failed ? <button type="button" onClick={() => router.push(`/packages/drafts/${packageVersion.draftId}/confirm`)}>返回重新生成</button> : null}
          </div>
        </section>
      </main>
    );
  }

  const url = packageDownloadUrl(packageVersion.downloadUrl);

  return (
    <main className={styles.readyPage}>
      <section className={styles.successHeader}>
        <CheckCircle size={44} weight="fill" />
        <div>
          <h1>工具包已经准备好了</h1>
          <p>{packageVersion.name}-{packageVersion.version}.zip 已开始下载</p>
          <div>
            <button type="button" onClick={() => router.push("/me/downloads")}>查看下载记录</button>
            <button type="button" onClick={() => router.push(packageVersion.taskId ? `/tasks/${packageVersion.taskId}?mode=recommend` : "/tools")}>返回本次任务</button>
          </div>
        </div>
      </section>
      <div className={styles.readyBadge}><Check />已生成并锁定版本</div>
      <section className={styles.packageGoal}>
        <strong>本次目标</strong>
        <p>{packageVersion.goal || "使用所选工具完成本地任务"}</p>
        <span>{packageVersion.lockedTools.map((tool) =>
          `${tool.toolName} ${tool.version}`).join(" · ")}</span>
      </section>
      <section className={styles.nextSteps}>
        {[
          ["1", "打开你的本地 Agent", "Codex、Claude、Hermes、OpenClaw、Trae、Qoder 等均可", Play],
          ["2", "上传完整 ZIP 或解压后的完整文件夹", `${packageVersion.name}-${packageVersion.version}.zip`, UploadSimple],
          ["3", "发送下面的开始用语", "Agent 必须先说明理解、给出计划并等待确认", Sparkle],
        ].map(([number, title, note, Icon]) => (
          <article key={String(number)}>
            <span>{number as string}</span>
            <Icon size={30} />
            <h2>{title as string}</h2>
            <p>{note as string}</p>
          </article>
        ))}
      </section>
      <section className={styles.startGuide}>
        <h2>开始用语</h2>
        <button type="button" onClick={() => void copy()}>
          {copied ? "已复制到剪贴板" : "复制开始用语"}
        </button>
        <p>{packageVersion.startPrompt}</p>
        <small>相同内容也保存在包内 START_HERE.md 中。</small>
      </section>
      <section className={styles.readyFooter}>
        <span><Package />{packageVersion.lockedTools.length} 个锁定工具</span>
        <span><FileText />{packageVersion.deliverables.length} 项交付物</span>
        <span><Sparkle />{packageVersion.plannedComponents.length} 个能力缺口</span>
        <button type="button" onClick={() => downloadFile(url, `${packageVersion.name}-${packageVersion.version}.zip`)}>重新下载原版本</button>
        <Link href="/me/downloads">查看本次下载凭证<ArrowRight /></Link>
      </section>
    </main>
  );
}
