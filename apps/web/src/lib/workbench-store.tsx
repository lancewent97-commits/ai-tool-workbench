"use client";

import type {
  AiConversationResponse,
  DownloadRecord,
  PackageDraft,
  ReturnSubmission,
  Task,
  UserProfile,
} from "@ai-tool-workbench/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as authClient from "./api/auth-client";
import * as workspaceClient from "./api/workspace-client";

const emptyManualDraft: PackageDraft = {
  id: "manual",
  source: "manual",
  name: "我的手动工具包",
  goal: "",
  deliverables: [],
  tools: [],
  plannedComponents: [],
  confirmedSections: [],
  userConfirmedFields: [],
};

type StoreState = {
  schemaVersion: number;
  signedIn: boolean;
  user: UserProfile | null;
  tasks: Task[];
  taskTotal: number;
  draft: PackageDraft;
  downloads: DownloadRecord[];
  downloadTotal: number;
  returns: ReturnSubmission[];
  returnTotal: number;
};

type Store = {
  state: StoreState;
  authReady: boolean;
  loginOpen: boolean;
  requestLogin: (resume?: () => void) => boolean;
  login: (account: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  markSignedOut: (resume?: () => void) => void;
  refreshTasks: () => Promise<void>;
  loadMoreTasks: () => Promise<void>;
  refreshDownloads: () => Promise<void>;
  loadMoreDownloads: () => Promise<void>;
  refreshReturns: () => Promise<void>;
  loadMoreReturns: () => Promise<void>;
  refreshDraft: () => Promise<void>;
  setDraft: (update: (draft: PackageDraft) => PackageDraft) => void;
  addAiTask: (response: AiConversationResponse) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  updateDownload: (id: string, patch: Partial<DownloadRecord>) => void;
  setReturns: (update: (items: ReturnSubmission[]) => ReturnSubmission[]) => void;
  setLoginOpen: (open: boolean) => void;
};

const initialState: StoreState = {
  schemaVersion: 7,
  signedIn: false,
  user: null,
  tasks: [],
  taskTotal: 0,
  draft: emptyManualDraft,
  downloads: [],
  downloadTotal: 0,
  returns: [],
  returnTotal: 0,
};

const Context = createContext<Store | null>(null);

function stateForUser(user: UserProfile): StoreState {
  return { ...initialState, signedIn: true, user };
}

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(initialState);
  const [authReady, setAuthReady] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const signedInUserId = state.user?.id;

  useEffect(() => {
    let active = true;
    void authClient.getMe()
      .then((user) => {
        if (active) setState(stateForUser(user));
      })
      .catch(() => {
        if (active) setState(initialState);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshTasks = useCallback(async () => {
    const response = await workspaceClient.listTasks(1, 100);
    setState((value) => ({
      ...value,
      tasks: response.items,
      taskTotal: response.total,
    }));
  }, []);

  const refreshDownloads = useCallback(async () => {
    const response = await workspaceClient.listDownloads(1, 100);
    setState((value) => ({ ...value, downloads: response.items, downloadTotal: response.total }));
  }, []);

  const refreshReturns = useCallback(async () => {
    const response = await workspaceClient.listReturns(1, 100);
    setState((value) => ({
      ...value,
      returns: response.items.map(workspaceClient.toReturnSubmission),
      returnTotal: response.total,
    }));
  }, []);

  const loadMoreTasks = useCallback(async () => {
    const page = Math.floor(state.tasks.length / 100) + 1;
    const response = await workspaceClient.listTasks(page, 100);
    setState((value) => ({
      ...value,
      tasks: [...value.tasks, ...response.items.filter((item) => !value.tasks.some((current) => current.id === item.id))],
      taskTotal: response.total,
    }));
  }, [state.tasks.length]);

  const loadMoreDownloads = useCallback(async () => {
    const page = Math.floor(state.downloads.length / 100) + 1;
    const response = await workspaceClient.listDownloads(page, 100);
    setState((value) => ({
      ...value,
      downloads: [...value.downloads, ...response.items.filter((item) => !value.downloads.some((current) => current.id === item.id))],
      downloadTotal: response.total,
    }));
  }, [state.downloads.length]);

  const loadMoreReturns = useCallback(async () => {
    const page = Math.floor(state.returns.length / 100) + 1;
    const response = await workspaceClient.listReturns(page, 100);
    const items = response.items.map(workspaceClient.toReturnSubmission);
    setState((value) => ({
      ...value,
      returns: [...value.returns, ...items.filter((item) => !value.returns.some((current) => current.id === item.id))],
      returnTotal: response.total,
    }));
  }, [state.returns.length]);

  const refreshDraft = useCallback(async () => {
    try {
      const response = await workspaceClient.getPackageDraft("manual");
      setState((value) => ({ ...value, draft: response.draft }));
    } catch {
      setState((value) => (
        value.draft.source === "manual" && value.draft.id === "manual"
          ? value
          : { ...value, draft: emptyManualDraft }
      ));
    }
  }, []);

  useEffect(() => {
    if (!authReady || !state.signedIn || !signedInUserId) return;
    queueMicrotask(() => {
      void refreshTasks().catch(() => undefined);
      void refreshDownloads().catch(() => undefined);
      void refreshReturns().catch(() => undefined);
      void refreshDraft().catch(() => undefined);
    });
  }, [
    authReady,
    state.signedIn,
    signedInUserId,
    refreshTasks,
    refreshDownloads,
    refreshReturns,
    refreshDraft,
  ]);

  const requestLogin = useCallback((resume?: () => void) => {
    if (state.signedIn) {
      resume?.();
      return true;
    }
    pendingAction.current = resume ?? null;
    setLoginOpen(true);
    return false;
  }, [state.signedIn]);

  const login = useCallback(async (account: string, password: string) => {
    const user = await authClient.login(account, password);
    setState(stateForUser(user));
    setLoginOpen(false);
    queueMicrotask(() => {
      pendingAction.current?.();
      pendingAction.current = null;
    });
  }, []);

  const logout = useCallback(async () => {
    await authClient.logout().catch(() => undefined);
    setState(initialState);
  }, []);

  const markSignedOut = useCallback((resume?: () => void) => {
    pendingAction.current = resume ?? null;
    setState(initialState);
    setLoginOpen(true);
  }, []);

  const setDraft = useCallback(
    (update: (draft: PackageDraft) => PackageDraft) => {
      setState((value) => {
        const draft = update(value.draft);
        if (value.signedIn) {
          queueMicrotask(() => {
            void workspaceClient.savePackageDraft(draft).catch(() => undefined);
          });
        }
        return { ...value, draft };
      });
    },
    [],
  );

  const addAiTask = useCallback((response: AiConversationResponse) => {
    const brief = response.brief;
    const task: Task = {
      id: response.conversationId,
      name: brief.goal.length > 20 ? `${brief.goal.slice(0, 20)}…` : brief.goal,
      goal: brief.goal,
      input: brief.input,
      deliverables: brief.deliverables,
      stage: response.phase,
      updatedAt: new Date().toISOString(),
      needsUserAction: response.phase !== "recommended",
      packageVersionIds: [],
    };
    setState((value) => ({
      ...value,
      tasks: [task, ...value.tasks.filter((item) => item.id !== task.id)],
    }));
    return task;
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setState((value) => ({
      ...value,
      tasks: value.tasks.map((task) => {
        if (task.id !== id) return task;
        const keepLocalPackageStage = patch.stage === "recommended"
          && ["package-review", "ready", "completed"].includes(task.stage);
        return {
          ...task,
          ...patch,
          stage: keepLocalPackageStage ? task.stage : patch.stage ?? task.stage,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }, []);

  const updateDownload = useCallback((id: string, patch: Partial<DownloadRecord>) => {
    setState((value) => ({
      ...value,
      downloads: value.downloads.map((record) =>
        record.id === id ? { ...record, ...patch } : record),
    }));
  }, []);

  const setReturns = useCallback(
    (update: (items: ReturnSubmission[]) => ReturnSubmission[]) => {
      setState((value) => ({ ...value, returns: update(value.returns) }));
    },
    [],
  );

  const store = useMemo(() => ({
    state,
    authReady,
    loginOpen,
    requestLogin,
    login,
    logout,
    markSignedOut,
    refreshTasks,
    loadMoreTasks,
    refreshDownloads,
    loadMoreDownloads,
    refreshReturns,
    loadMoreReturns,
    refreshDraft,
    setDraft,
    addAiTask,
    updateTask,
    updateDownload,
    setReturns,
    setLoginOpen,
  }), [
    state,
    authReady,
    loginOpen,
    requestLogin,
    login,
    logout,
    markSignedOut,
    refreshTasks,
    loadMoreTasks,
    refreshDownloads,
    loadMoreDownloads,
    refreshReturns,
    loadMoreReturns,
    refreshDraft,
    setDraft,
    addAiTask,
    updateTask,
    updateDownload,
    setReturns,
  ]);

  return <Context.Provider value={store}>{children}</Context.Provider>;
}

export function useWorkbench() {
  const value = useContext(Context);
  if (!value) throw new Error("WorkbenchProvider missing");
  return value;
}
