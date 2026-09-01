import type {
  ImportUser,
  ImportedUser,
  PlatformRole,
  UserProfile,
} from "@ai-tool-workbench/contracts";
import type { IdentityRepository } from "@ai-tool-workbench/db";
import { AppError } from "../lib/app-error.js";
import {
  createOpaqueToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "../lib/security.js";

type AccountServiceOptions = {
  sessionHours: number;
  activationHours: number;
  loginMaxFailures?: number;
  loginWindowMinutes?: number;
  loginLockMinutes?: number;
};

export class AccountService {
  constructor(
    private readonly repository: IdentityRepository,
    private readonly options: AccountServiceOptions,
  ) {}

  async inviteUsers(
    actorUserId: string | undefined,
    organizationId: string,
    users: ImportUser[],
  ): Promise<ImportedUser[]> {
    const expiresAt = new Date(Date.now() + this.options.activationHours * 60 * 60 * 1000);
    const invitations = users.map((user) => {
      const token = createOpaqueToken();
      return {
        user,
        token,
        input: {
          ...user,
          organizationId,
          activationTokenHash: hashToken(token),
          activationExpiresAt: expiresAt,
        },
      };
    });
    const profiles = await this.repository.createInvitedUsers(
      invitations.map(({ input }) => input),
    );
    await Promise.all(profiles.map((profile) => this.repository.recordAuditEvent({
      actorUserId,
      action: "user.invited",
      objectType: "user",
      objectId: profile.id,
      metadata: { role: profile.role },
    })));
    return profiles.map((profile, index) => ({
      user: profile,
      activationToken: invitations[index]?.token ?? "",
      activationExpiresAt: expiresAt.toISOString(),
    }));
  }

  async activate(activationToken: string, password: string) {
    const profile = await this.repository.activateUser(
      hashToken(activationToken),
      await hashPassword(password),
    );
    if (!profile) {
      throw new AppError(400, "BAD_REQUEST", "激活链接无效或已过期");
    }
    await this.repository.recordAuditEvent({
      actorUserId: profile.id,
      action: "user.activated",
      objectType: "user",
      objectId: profile.id,
    });
    return profile;
  }

  async login(account: string, password: string, ip = "unknown") {
    const protection = await this.repository.getLoginProtection(account);
    if (protection.lockedUntil && protection.lockedUntil > new Date()) {
      throw new AppError(
        429,
        "TOO_MANY_REQUESTS",
        `登录失败次数过多，请在${protection.lockedUntil.toLocaleTimeString("zh-CN", { hour12: false })}后重试`,
      );
    }
    const user = await this.repository.findUserByAccount(account);
    const passwordValid = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : false;
    if (!user || user.status !== "active" || !passwordValid) {
      const next = await this.repository.recordLoginFailure({
        account,
        ip,
        maxFailures: this.options.loginMaxFailures ?? 5,
        windowMinutes: this.options.loginWindowMinutes ?? 15,
        lockMinutes: this.options.loginLockMinutes ?? 15,
      });
      await this.repository.recordAuditEvent({
        action: "session.login_failed",
        objectType: "account",
        objectId: user?.id,
        metadata: {
          account: account.toLowerCase(),
          ip,
          failedCount: next.failedCount,
          lockedUntil: next.lockedUntil,
        },
      });
      throw new AppError(401, "UNAUTHORIZED", "账号或密码错误");
    }

    await this.repository.clearLoginFailures(account);
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + this.options.sessionHours * 60 * 60 * 1000);
    await this.repository.createSession(user.id, hashToken(token), expiresAt);
    await this.repository.recordAuditEvent({
      actorUserId: user.id,
      action: "session.created",
      objectType: "session",
      metadata: { expiresAt: expiresAt.toISOString() },
    });
    return { token, expiresAt, user: this.toProfile(user) };
  }

  async authenticate(sessionToken: string | undefined) {
    if (!sessionToken) {
      throw new AppError(401, "UNAUTHORIZED", "请先登录");
    }
    const user = await this.repository.findUserBySessionTokenHash(hashToken(sessionToken));
    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "登录已过期，请重新登录");
    }
    return this.toProfile(user);
  }

  async authorize(sessionToken: string | undefined, allowedRoles: PlatformRole[]) {
    const user = await this.authenticate(sessionToken);
    if (!allowedRoles.includes(user.role)) {
      throw new AppError(403, "FORBIDDEN", "没有执行此操作的权限");
    }
    return user;
  }

  async logout(sessionToken: string | undefined) {
    if (!sessionToken) return;
    await this.repository.revokeSession(hashToken(sessionToken));
  }

  private toProfile(user: UserProfile): UserProfile {
    return {
      id: user.id,
      organizationId: user.organizationId,
      account: user.account,
      displayName: user.displayName,
      departmentId: user.departmentId,
      jobFunctionId: user.jobFunctionId,
      role: user.role,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
