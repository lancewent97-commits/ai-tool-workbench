import { Lock, WarningCircle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import styles from "./platform-pages.module.css";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <header className={styles.pageHeader}><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

export function LoadingPanel({ text = "正在读取数据" }: { text?: string }) {
  return <section className={styles.statePanel}><span className={styles.spinner}/><strong>{text}</strong></section>;
}

export function ErrorPanel({ message }: { message: string }) {
  return <section className={styles.statePanel}><WarningCircle/><strong>暂时无法读取</strong><p>{message}</p></section>;
}

export function AdminOnlyPanel({ title }: { title: string }) {
  return <section className={styles.accessPanel}><Lock/><h2>{title}</h2><p>当前账号是维护人员。该区域涉及账号与系统审计，只允许管理员访问。</p></section>;
}

export function verificationText(value: string) {
  return value==="verified"?"已验证":value==="partly-verified"?"部分验证":"未验证";
}

export function dateText(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
