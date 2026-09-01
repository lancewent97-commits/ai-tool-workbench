"use client";

import type {
  AiConversationStateResponse,
} from "@ai-tool-workbench/contracts";
import { useCallback, useEffect, useState } from "react";
import {
  confirmAiBrief,
  continueAiConversation,
  getAiConversation,
  retryAiConversation,
} from "@/lib/api/ai-client";
import { ApiClientError } from "@/lib/api/http-client";
import { useWorkbench } from "@/lib/workbench-store";

export function useAiConversation(conversationId: string) {
  const { markSignedOut, updateTask } = useWorkbench();
  const [state, setState] = useState<AiConversationStateResponse>();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const next = await getAiConversation(conversationId);
      setState(next);
      updateTask(conversationId, {
        goal: next.brief.goal,
        input: next.brief.input,
        deliverables: next.brief.deliverables,
        stage: next.phase,
        needsUserAction: next.phase !== "recommended",
      });
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        markSignedOut(() => window.location.reload());
      } else {
        setError(caught instanceof Error ? caught.message : "读取任务失败");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [conversationId, markSignedOut, updateTask]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const run = useCallback(async (operation: () => Promise<unknown>) => {
    setWorking(true);
    setError("");
    try {
      await operation();
      await load(false);
      return true;
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        markSignedOut(() => window.location.reload());
      } else {
        setError(caught instanceof Error ? caught.message : "操作失败，请稍后重试");
      }
      return false;
    } finally {
      setWorking(false);
    }
  }, [load, markSignedOut]);

  return {
    state,
    loading,
    working,
    error,
    reload: () => load(),
    send: (message: string) => run(() =>
      continueAiConversation(conversationId, message)),
    confirm: () => run(() => confirmAiBrief(conversationId)),
    retry: () => run(() => retryAiConversation(conversationId)),
  };
}
