import {
  CheckCircle,
  DownloadSimple,
  Eye,
  FileText,
  FolderOpen,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import {
  automaticCheckLevels,
  productionStandard,
  requiredToolFiles,
  standardDownloads,
} from "@/features/standards/standards-data";
import styles from "./admin-standards-page.module.css";

const scope = ["平台维护上传", "官方新版本", "衍生工具", "用户净化回传"];
const rules = [
  "新工具、新版本和衍生工具使用提交时的最新标准。",
  "已发布旧工具保留原标准版本，不强制返工。",
  "自动检查只列缺失项、风险与完成标准，不在线修改工具。",
  "不合格包由提交人带回本地 Agent 修正后重新上传。",
  "标准全文必须进入每个单工具包和组合工具包。",
];

export function AdminStandardsPage() {
  return <main className={styles.page}>
    <header className={styles.heading}>
      <div>
        <span className={styles.eyebrow}>工具资产 · 准入基线</span>
        <h1>生产规范管理</h1>
        <p>维护工具上传、版本更新、衍生和回传共同使用的准入规则。</p>
      </div>
      <div className={styles.actions}>
        <Link href="/standards"><Eye/>查看用户端展示</Link>
        <a href="/demo-source/tool-template/standards/TOOL_PRODUCTION_STANDARD.md" download><DownloadSimple/>下载当前标准</a>
        <a className={styles.primary} href="/demo-assets/tool-template.zip" download><DownloadSimple/>下载标准模板</a>
      </div>
    </header>

    <section className={styles.summary}>
      <article><FileText/><span><small>当前标准</small><strong>{productionStandard.version}</strong><em>{productionStandard.status}</em></span></article>
      <article><ShieldCheck/><span><small>适用范围</small><strong>{scope.length} 类资产</strong><em>上传、更新、衍生、回传</em></span></article>
      <article><FolderOpen/><span><small>核心文件</small><strong>{requiredToolFiles.length} 项</strong><em>缺少必备项将阻断提交</em></span></article>
      <article><WarningCircle/><span><small>检查结果</small><strong>3 个等级</strong><em>必须修复、风险、建议</em></span></article>
    </section>

    <div className={styles.grid}>
      <section className={styles.panel}>
        <header><div><h2>当前发布规则</h2><p>上传和发布流程统一按以下口径执行。</p></div><span className={styles.live}>测试环境生效</span></header>
        <ol className={styles.rules}>{rules.map((rule, index) => <li key={rule}><span>{index + 1}</span><p>{rule}</p></li>)}</ol>
        <div className={styles.scope}><strong>适用资产</strong>{scope.map((item) => <span key={item}><CheckCircle/>{item}</span>)}</div>
      </section>

      <aside className={styles.panel}>
        <header><div><h2>标准资料</h2><p>下载后可直接交给任意本地 Agent。</p></div></header>
        <div className={styles.downloads}>{standardDownloads.map(([name, meta, url]) =>
          <a href={url} download key={name}><FileText/><span><strong>{name}</strong><small>{meta}</small></span><DownloadSimple/></a>
        )}</div>
      </aside>
    </div>

    <section className={styles.panel}>
      <header><div><h2>自动检查与处理结果</h2><p>平台判断是否允许进入资料填写和发布阶段。</p></div><Link href="/admin/tools/upload">进入上传检查</Link></header>
      <div className={styles.levels}>{automaticCheckLevels.map(([name, result, note], index) =>
        <article key={name} data-tone={index === 0 ? "red" : index === 1 ? "orange" : "blue"}>
          <span>{index + 1}</span><div><strong>{name}</strong><small>{note}</small></div><em>{result}</em>
        </article>
      )}</div>
    </section>

    <section className={styles.panel}>
      <header><div><h2>工具包必备结构</h2><p>维护上传时逐项检查；表格内容与服务端预检规则保持一致。</p></div><span>{requiredToolFiles.length} 项</span></header>
      <div className={styles.fileTable}>
        <div><strong>路径</strong><strong>作用</strong><strong>完成要求</strong><strong>缺失处理</strong></div>
        {requiredToolFiles.map(([path, type, note]) => <div key={path}>
          <code>{path}</code><span>{type}</span><p>{note}</p><em>阻断上传</em>
        </div>)}
      </div>
    </section>

    <section className={styles.history}>
      <div><span className={styles.versionDot}/><strong>{productionStandard.version}</strong><p>{productionStandard.publishedAt} 建立当前准入基线，测试环境生效。</p><em>当前版本</em></div>
      <small>旧工具继续保留发布时的标准版本；产生新版本或衍生版本时再升级到当前标准。</small>
    </section>
  </main>;
}
