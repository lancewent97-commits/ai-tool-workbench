"use client";

import {
  CaretDown,
  ClipboardText,
  Cube,
  DownloadSimple,
  Toolbox,
  UploadSimple,
  WarningCircle,
  X,
  type IconProps,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import styles from "./workbench-shell.module.css";
import { useWorkbench } from "@/lib/workbench-store";
import { checkPlatformReadiness } from "@/lib/api/health-client";
import {
  platformEnvironment,
  platformEnvironmentLabel,
} from "@/lib/platform-environment";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
};

const navItems: NavItem[] = [
  { href: "/", label: "AI组包", icon: Cube },
  { href: "/tools", label: "工具", icon: Toolbox },
  { href: "/me/tasks", label: "我的任务", icon: ClipboardText },
  { href: "/me/downloads", label: "我的下载", icon: DownloadSimple },
  { href: "/me/returns", label: "我的回传", icon: UploadSimple },
];

export function WorkbenchShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const { state, authReady, loginOpen, login, logout, setLoginOpen } = useWorkbench();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [checkingService, setCheckingService] = useState(false);
  const loginDialogRef = useRef<HTMLElement>(null);
  const accountInputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const visibleNav = state.signedIn ? navItems : navItems.filter((item) => item.href === "/" || item.href === "/tools");
  const protectedRoute = pathname.startsWith("/me/") || pathname.startsWith("/packages/") || pathname.startsWith("/tasks/");
  const avatarLabel = state.user?.displayName.trim().slice(0, 1) || "公";

  async function checkService() {
    setCheckingService(true);
    try {
      await checkPlatformReadiness();
      setServiceUnavailable(false);
    } catch {
      setServiceUnavailable(true);
    } finally {
      setCheckingService(false);
    }
  }

  useEffect(() => {
    const checkInBackground = () => {
      void checkPlatformReadiness()
        .then(() => setServiceUnavailable(false))
        .catch(() => setServiceUnavailable(true));
    };
    checkInBackground();
    const timer = window.setInterval(checkInBackground, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    setLoginBusy(true);
    try {
      await login(account, password);
      setPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoginBusy(false);
    }
  }

  function closeLogin() {
    setLoginOpen(false);
    window.setTimeout(() => previousFocusRef.current?.focus(), 0);
  }

  useEffect(() => {
    if (!loginOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    accountInputRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLogin();
        return;
      }
      if (event.key !== "Tab" || !loginDialogRef.current) return;
      const focusable = Array.from(loginDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  // closeLogin only uses stable state setters and a ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginOpen]);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="主导航">
        <Link className={styles.brand} href="/" aria-label="AI 工具工作台">
          <Cube aria-hidden size={28} weight="fill" />
        </Link>
        <span className={`${styles.environmentBadge} ${platformEnvironment === "production" ? styles.environmentProduction : styles.environmentTest}`}>
          {platformEnvironmentLabel}
        </span>

        <nav className={styles.nav}>
          {visibleNav.map(({ href, label, icon: Icon }) => {
            const active = isActiveNavItem(href, pathname);

            return (
              <Link
                key={href}
                className={active ? styles.navItemActive : styles.navItem}
                href={href}
                aria-current={active ? "page" : undefined}
              >
                <Icon aria-hidden size={25} weight={active ? "duotone" : "regular"} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.workspace}>
        {serviceUnavailable?<div className={styles.serviceBanner} role="alert"><WarningCircle/><span><strong>平台服务暂时不可用</strong> 已保留当前页面，请稍后重试。</span><button type="button" disabled={checkingService} onClick={()=>void checkService()}>{checkingService?"检查中…":"重新检查"}</button></div>:null}
        <div className={styles.account}>
          <button
            className={styles.accountButton}
            type="button"
            aria-label="账号菜单"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((open) => !open)}
          >
            <span>{state.signedIn ? state.user?.displayName ?? "公司账号" : authReady ? "登录" : "检查登录…"}</span>
            <CaretDown aria-hidden size={17} weight="bold" />
            <span className={styles.avatar}>{state.signedIn ? avatarLabel : "访"}</span>
          </button>
          {accountOpen ? (
            <div className={styles.accountMenu} role="menu">
              {state.signedIn ? <><Link href="/me/tasks" role="menuitem" onClick={()=>setAccountOpen(false)}>我的工作台</Link>{state.user?.role==="maintainer"||state.user?.role==="admin"?<Link href="/admin/returns" role="menuitem" onClick={()=>setAccountOpen(false)}>维护工作台</Link>:null}<Link href="/standards" role="menuitem" onClick={()=>setAccountOpen(false)}>生产规范与模板</Link><button type="button" role="menuitem" onClick={()=>{void logout();setAccountOpen(false)}}>退出登录</button></> : <button type="button" role="menuitem" onClick={()=>{setLoginOpen(true);setAccountOpen(false)}}>登录后继续</button>}
            </div>
          ) : null}
        </div>
        {protectedRoute && !state.signedIn ? (
          <main className={styles.loginGate}>
            <span className={styles.loginMark}><Cube weight="fill" /></span>
            <h1>登录后继续</h1>
            <p>登录后可查看任务、下载记录与回传状态。当前页面和操作会被保留。</p>
            <button className={styles.loginButton} type="button" onClick={() => setLoginOpen(true)}>登录后继续</button>
            <Link href="/tools">先浏览工具</Link>
          </main>
        ) : children}
        {loginOpen ? <div className={styles.loginBackdrop} role="presentation"><section ref={loginDialogRef} className={styles.loginDialog} role="dialog" aria-modal="true" aria-labelledby="login-title"><button className={styles.closeDialog} type="button" aria-label="关闭登录" onClick={closeLogin}><X/></button><span className={styles.loginMark}><Cube weight="fill"/></span><h2 id="login-title">登录后继续刚才的操作</h2><p>你的需求、工具版本和当前工具包都会保留，不需要重新填写。</p><form className={styles.loginForm} onSubmit={submitLogin}><label>内部账号<input ref={accountInputRef} autoComplete="username" value={account} onChange={event=>setAccount(event.target.value)} required /></label><label>密码<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required /></label>{loginError?<span className={styles.loginError} role="alert">{loginError}</span>:null}<button className={styles.loginButton} type="submit" disabled={loginBusy}>{loginBusy?"正在登录…":"登录并继续"}</button></form><small>账号由平台维护人员创建</small></section></div> : null}
      </div>
    </div>
  );
}

function isActiveNavItem(href: string, pathname: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/tasks/") || pathname.startsWith("/packages/");
  return pathname.startsWith(href);
}
