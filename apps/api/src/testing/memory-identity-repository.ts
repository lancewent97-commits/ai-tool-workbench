import type { UserProfile } from "@ai-tool-workbench/contracts";
import {
  IdentityConflictError,
  type IdentityRepository,
  type IdentityUser,
  type InvitedUserInput,
} from "@ai-tool-workbench/db";
import { randomUUID } from "node:crypto";

type Activation = {
  userId: string;
  expiresAt: Date;
  used: boolean;
};

export class MemoryIdentityRepository implements IdentityRepository {
  private readonly users = new Map<string, IdentityUser>();
  private readonly activations = new Map<string, Activation>();
  private readonly sessions = new Map<string, { userId: string; expiresAt: Date; revoked: boolean }>();
  private readonly loginAttempts = new Map<string, {
    failedCount: number;
    firstFailedAt: Date;
    lockedUntil: Date | null;
  }>();
  readonly auditEvents: Array<{ action: string; objectId?: string }> = [];

  async healthCheck() {}

  async ensureOrganization() {
    return randomUUID();
  }

  async findUserByAccount(account: string) {
    return [...this.users.values()].find(
      (user) => user.account.toLowerCase() === account.toLowerCase(),
    ) ?? null;
  }

  async findUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async findUserBySessionTokenHash(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revoked || session.expiresAt <= new Date()) return null;
    const user = this.users.get(session.userId);
    return user?.status === "active" ? user : null;
  }

  async listUsers() {
    return [...this.users.values()]
      .map((user) => this.toProfile(user));
  }

  async listAuditEvents() {
    return this.auditEvents.map((event) => ({
      id: randomUUID(),
      actorDisplayName: null,
      actorAccount: null,
      action: event.action,
      objectType: "test",
      objectId: event.objectId ?? null,
      metadata: {},
      createdAt: new Date().toISOString(),
    }));
  }

  async createInvitedUsers(inputs: InvitedUserInput[]) {
    const duplicates = inputs.some((input) =>
      [...this.users.values()].some(
        (user) => user.account.toLowerCase() === input.account.toLowerCase(),
      ),
    );
    if (duplicates) throw new IdentityConflictError("内部账号已存在");

    return inputs.map((input) => {
      const user: IdentityUser = {
        id: randomUUID(),
        organizationId: input.organizationId,
        account: input.account,
        displayName: input.displayName,
        departmentId: input.departmentId ?? null,
        jobFunctionId: input.jobFunctionId ?? null,
        role: input.role,
        status: "invited",
        mustChangePassword: true,
        passwordHash: null,
      };
      this.users.set(user.id, user);
      this.activations.set(input.activationTokenHash, {
        userId: user.id,
        expiresAt: input.activationExpiresAt,
        used: false,
      });
      return this.toProfile(user);
    });
  }

  async activateUser(activationTokenHash: string, passwordHash: string) {
    const activation = this.activations.get(activationTokenHash);
    if (!activation || activation.used || activation.expiresAt <= new Date()) return null;
    const user = this.users.get(activation.userId);
    if (!user) return null;
    activation.used = true;
    user.status = "active";
    user.mustChangePassword = false;
    user.passwordHash = passwordHash;
    return this.toProfile(user);
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    this.sessions.set(tokenHash, { userId, expiresAt, revoked: false });
  }

  async revokeSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (session) session.revoked = true;
  }

  async getLoginProtection(account: string) {
    const attempt = this.loginAttempts.get(account.toLowerCase());
    return {
      failedCount: attempt?.failedCount ?? 0,
      lockedUntil: attempt?.lockedUntil ?? null,
    };
  }

  async recordLoginFailure(input: {
    account: string;
    maxFailures: number;
    windowMinutes: number;
    lockMinutes: number;
  }) {
    const key = input.account.toLowerCase();
    const now = new Date();
    const current = this.loginAttempts.get(key);
    const expired = !current
      || current.firstFailedAt.getTime() < now.getTime() - input.windowMinutes * 60_000;
    const failedCount = expired ? 1 : current.failedCount + 1;
    const next = {
      failedCount,
      firstFailedAt: expired ? now : current.firstFailedAt,
      lockedUntil: failedCount >= input.maxFailures
        ? new Date(now.getTime() + input.lockMinutes * 60_000)
        : current?.lockedUntil ?? null,
    };
    this.loginAttempts.set(key, next);
    return { failedCount: next.failedCount, lockedUntil: next.lockedUntil };
  }

  async clearLoginFailures(account: string) {
    this.loginAttempts.delete(account.toLowerCase());
  }

  async recordAuditEvent(input: {
    action: string;
    objectId?: string;
  }) {
    this.auditEvents.push({ action: input.action, objectId: input.objectId });
  }

  async close() {}

  private toProfile(user: IdentityUser): UserProfile {
    const { passwordHash: _, ...profile } = user;
    return profile;
  }
}
