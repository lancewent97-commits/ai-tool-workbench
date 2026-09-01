import {
  authResponseSchema,
  type UserProfile,
} from "@ai-tool-workbench/contracts";
import { apiRequest } from "./http-client";

export async function login(account: string, password: string): Promise<UserProfile> {
  const response = await apiRequest("/v1/auth/login", authResponseSchema, {
    method: "POST",
    body: JSON.stringify({ account, password }),
  });
  return response.user;
}

export async function getMe(): Promise<UserProfile> {
  const response = await apiRequest("/v1/me", authResponseSchema);
  return response.user;
}

export async function logout() {
  const response = await fetch("/api/backend/v1/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok && response.status !== 401) {
    throw new Error("退出失败");
  }
}
