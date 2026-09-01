"use client";

import {
  ArrowLeft,
  Brain,
  ChartBar,
  CheckSquare,
  Cube,
  FileText,
  FolderOpen,
  GitBranch,
  House,
  ListBullets,
  Lock,
  Pulse,
  RocketLaunch,
  SignOut,
  UploadSimple,
  UserCircle,
  Users,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useWorkbench } from "@/lib/workbench-store";
import {
  platformEnvironment,
  platformEnvironmentLabel,
} from "@/lib/platform-environment";
import styles from "./admin-shell.module.css";

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, authReady, login, logout } = useWorkbench();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(account, password);
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return <main className={styles.gate}><EnvironmentBadge/><Cube weight="fill" /><h1>正在确认维护权限</h1></main>;
  }
  if (!state.signedIn) {
    return <main className={styles.gate}><EnvironmentBadge/><Cube weight="fill" /><h1>维护工作台</h1><p>请使用维护人员或管理员账号登录。</p><form onSubmit={submit}><label>内部账号<input value={account} onChange={(event)=>setAccount(event.target.value)} autoComplete="username" required /></label><label>密码<input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} autoComplete="current-password" required /></label>{error?<span role="alert">{error}</span>:null}<button type="submit" disabled={busy}>{busy?"正在登录…":"登录维护工作台"}</button></form><Link href="/"><ArrowLeft/>返回用户工作台</Link></main>;
  }
  if (state.user?.role !== "maintainer" && state.user?.role !== "admin") {
    return <main className={styles.gate}><CheckSquare/><h1>没有维护权限</h1><p>当前账号只能使用用户工作台，不能查看审核前的他人回传。</p><Link href="/"><ArrowLeft/>返回用户工作台</Link></main>;
  }

  const adminOnlyPaths = ["/admin/users", "/admin/roles", "/admin/teams", "/admin/audit", "/admin/changes", "/admin/settings"];
  if (state.user.role !== "admin" && adminOnlyPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return <main className={styles.gate}><Lock/><h1>需要管理员权限</h1><p>这个页面包含账号、权限或系统审计信息，维护人员不能访问。</p><Link href="/admin"><ArrowLeft/>返回今日工作</Link></main>;
  }

  const navGroups = [
    {
      label: "工作台",
      items: [{ href: "/admin", label: "今日工作", icon: House, exact: true }],
    },
    {
      label: "工具资产",
      items: [
        { href: "/admin/tools", label: "工具目录", icon: FolderOpen, exact: true },
        { href: "/admin/versions", label: "工具版本", icon: GitBranch },
        { href: "/admin/standards", label: "生产规范", icon: FileText },
        { href: "/admin/returns", label: "回传审核", icon: CheckSquare },
        { href: "/admin/publishing", label: "发布管理", icon: RocketLaunch },
        { href: "/admin/tools/upload", label: "上传新工具", icon: UploadSimple },
      ],
    },
    {
      label: "AI 中心",
      items: [
        { href: "/admin/ai", label: "AI 服务", icon: Brain, exact: true },
      ],
    },
    {
      label: "用户权限",
      items: [
        { href: "/admin/users", label: "用户管理", icon: UserCircle, adminOnly: true },
        { href: "/admin/roles", label: "角色权限", icon: Lock, adminOnly: true },
        { href: "/admin/teams", label: "团队管理", icon: Users, adminOnly: true },
      ],
    },
    {
      label: "数据运营",
      items: [
        { href: "/admin/analytics", label: "数据看板", icon: ChartBar },
        { href: "/admin/behavior", label: "平台行为分析", icon: Pulse },
      ],
    },
    {
      label: "系统审计",
      items: [
        { href: "/admin/audit", label: "操作日志", icon: ListBullets, adminOnly: true },
      ],
    },
  ];

  return <div className={styles.shell}>
    <aside>
      <Link className={styles.brand} href="/admin"><Cube weight="fill"/><span><strong>维护系统</strong><small>AI 工具工作台</small></span></Link>
      <nav>{navGroups.map((group)=><section key={group.label}><h2>{group.label}</h2>{group.items.map((item)=>{
        const Icon=item.icon;
        const active=("exact" in item&&item.exact)
          ? pathname===item.href
          : pathname===item.href||pathname.startsWith(`${item.href}/`);
        if (("adminOnly" in item&&item.adminOnly)&&state.user?.role!=="admin") return null;
        return <Link className={active?styles.active:undefined} href={item.href} key={item.href}><Icon/><span>{item.label}</span></Link>;
      })}</section>)}</nav>
      <Link className={styles.back} href="/"><ArrowLeft/>用户工作台</Link>
    </aside>
    <section className={styles.workspace}>
      <header>
        <p><Pulse weight="fill"/>{platformEnvironmentLabel} · 内部维护</p>
        <span className={styles.headerContext}>维护、审核并发布可复用的工具资产</span>
        <div><strong>{state.user.displayName}</strong><span>{state.user.role==="admin"?"管理员":"维护人员"}</span></div>
        <button onClick={()=>void logout()}><SignOut/>退出</button>
      </header>
      {children}
    </section>
  </div>;
}

function EnvironmentBadge() {
  return <span className={`${styles.environmentBadge} ${platformEnvironment === "production" ? styles.environmentProduction : styles.environmentTest}`}>
    {platformEnvironmentLabel}
  </span>;
}
