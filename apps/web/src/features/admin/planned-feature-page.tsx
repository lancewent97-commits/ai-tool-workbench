import { ArrowLeft, Info } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import styles from "./planned-feature-page.module.css";

export function AdminPlannedFeaturePage({ title, description }: { title: string; description: string }) {
  return <main className={styles.page}><section>
    <span><Info/></span><em>尚未开放</em><h1>{title}</h1><p>{description}</p>
    <p>该模块已从维护导航隐藏。在真实数据、权限、版本记录和回滚能力接通前，不提供容易被误认为已生效的演示操作。</p>
    <Link href="/admin"><ArrowLeft/>返回今日工作</Link>
  </section></main>;
}
