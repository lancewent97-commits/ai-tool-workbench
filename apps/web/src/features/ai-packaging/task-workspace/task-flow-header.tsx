"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./task-flow-header.module.css";

export function TaskFlowHeader({
  title,
  status,
  actions,
}: {
  title: string;
  status: string;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.context}>
        <p className={styles.breadcrumb}>
          <Link href="/me/tasks">我的任务</Link>
          <i>/</i>
          <strong title={title}>{title}</strong>
        </p>
        <span className={styles.status}><i />{status}</span>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
