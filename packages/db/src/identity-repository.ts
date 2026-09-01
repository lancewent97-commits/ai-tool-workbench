import type { ImportUser, UserProfile } from "@ai-tool-workbench/contracts";

export type IdentityUser = UserProfile & {
  passwordHash: string | null;
};

export type InvitedUserInput = ImportUser & {
  organizationId: string;
  activationTokenHash: string;
  activationExpiresAt: Date;
};

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | Date
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

export type AuditMetadata = { readonly [key: string]: JsonValue | undefined };

export type AuditEventRecord = {
  id: string;
  actorDisplayName: string | null;
  actorAccount: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type LoginProtection = {
  failedCount: number;
  lockedUntil: Date | null;
};

export interface IdentityRepository {
  healthCheck(): Promise<void>;
  ensureOrganization(name: string): Promise<string>;
  findUserByAccount(account: string): Promise<IdentityUser | null>;
  findUserById(id: string): Promise<IdentityUser | null>;
  findUserBySessionTokenHash(tokenHash: string): Promise<IdentityUser | null>;
  listUsers(): Promise<UserProfile[]>;
  listAuditEvents(limit: number): Promise<AuditEventRecord[]>;
  createInvitedUsers(inputs: InvitedUserInput[]): Promise<UserProfile[]>;
  activateUser(activationTokenHash: string, passwordHash: string): Promise<UserProfile | null>;
  createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  revokeSession(tokenHash: string): Promise<void>;
  getLoginProtection(account: string): Promise<LoginProtection>;
  recordLoginFailure(input: {
    account: string;
    ip: string;
    maxFailures: number;
    windowMinutes: number;
    lockMinutes: number;
  }): Promise<LoginProtection>;
  clearLoginFailures(account: string): Promise<void>;
  recordAuditEvent(input: {
    actorUserId?: string;
    action: string;
    objectType: string;
    objectId?: string;
    metadata?: AuditMetadata;
  }): Promise<void>;
  close(): Promise<void>;
}

export class IdentityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityConflictError";
  }
}
