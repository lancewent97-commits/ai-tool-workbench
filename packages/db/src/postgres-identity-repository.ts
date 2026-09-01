import type { PlatformRole, UserProfile, UserStatus } from "@ai-tool-workbench/contracts";
import postgres, { type Row, type Sql } from "postgres";
import {
  type AuditMetadata,
  IdentityConflictError,
  type IdentityRepository,
  type IdentityUser,
  type InvitedUserInput,
} from "./identity-repository.js";

function mapUser(row: Row): IdentityUser {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    account: String(row.internal_account),
    displayName: String(row.display_name),
    departmentId: row.department_id ? String(row.department_id) : null,
    jobFunctionId: row.job_function_id ? String(row.job_function_id) : null,
    role: row.platform_role as PlatformRole,
    status: row.status as UserStatus,
    mustChangePassword: Boolean(row.must_change_password),
    passwordHash: row.password_hash ? String(row.password_hash) : null,
  };
}

function withoutPassword(user: IdentityUser): UserProfile {
  const { passwordHash: _, ...profile } = user;
  return profile;
}

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly sql: Sql) {}

  static connect(databaseUrl: string) {
    return new PostgresIdentityRepository(postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    }));
  }

  async healthCheck() {
    await this.sql`SELECT 1`;
  }

  async ensureOrganization(name: string) {
    const [row] = await this.sql`
      INSERT INTO organizations (name)
      VALUES (${name})
      ON CONFLICT (lower(name))
      DO UPDATE SET updated_at = now()
      RETURNING id
    `;
    if (!row) throw new Error("创建组织失败");
    return String(row.id);
  }

  async findUserByAccount(account: string) {
    const [row] = await this.sql`
      SELECT u.*, c.password_hash, COALESCE(c.must_change_password, true) AS must_change_password
      FROM users u
      LEFT JOIN user_credentials c ON c.user_id = u.id
      WHERE lower(u.internal_account) = lower(${account})
      LIMIT 1
    `;
    return row ? mapUser(row) : null;
  }

  async findUserById(id: string) {
    const [row] = await this.sql`
      SELECT u.*, c.password_hash, COALESCE(c.must_change_password, true) AS must_change_password
      FROM users u
      LEFT JOIN user_credentials c ON c.user_id = u.id
      WHERE u.id = ${id}
      LIMIT 1
    `;
    return row ? mapUser(row) : null;
  }

  async findUserBySessionTokenHash(tokenHash: string) {
    const [row] = await this.sql`
      SELECT u.*, c.password_hash, COALESCE(c.must_change_password, false) AS must_change_password
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN user_credentials c ON c.user_id = u.id
      WHERE s.token_hash = ${tokenHash}
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      LIMIT 1
    `;
    if (!row) return null;
    await this.sql`
      UPDATE sessions
      SET last_seen_at = now()
      WHERE token_hash = ${tokenHash}
    `;
    return mapUser(row);
  }

  async listUsers() {
    const rows = await this.sql`
      SELECT
        u.*,
        c.password_hash,
        COALESCE(c.must_change_password, true) AS must_change_password
      FROM users u
      LEFT JOIN user_credentials c ON c.user_id = u.id
      ORDER BY
        CASE u.platform_role WHEN 'admin' THEN 1 WHEN 'maintainer' THEN 2 ELSE 3 END,
        u.created_at DESC
    `;
    return rows.map((row) => withoutPassword(mapUser(row)));
  }

  async listAuditEvents(limit: number) {
    const rows = await this.sql`
      SELECT
        e.id,
        e.action,
        e.object_type,
        e.object_id,
        e.metadata,
        e.created_at,
        u.display_name AS actor_display_name,
        u.internal_account AS actor_account
      FROM audit_events e
      LEFT JOIN users u ON u.id = e.actor_user_id
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      id: String(row.id),
      actorDisplayName: row.actor_display_name ? String(row.actor_display_name) : null,
      actorAccount: row.actor_account ? String(row.actor_account) : null,
      action: String(row.action),
      objectType: String(row.object_type),
      objectId: row.object_id ? String(row.object_id) : null,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: new Date(row.created_at as string | Date).toISOString(),
    }));
  }

  async createInvitedUsers(inputs: InvitedUserInput[]) {
    try {
      return await this.sql.begin(async (transaction) => {
        const users: UserProfile[] = [];
        for (const input of inputs) {
          const [row] = await transaction`
            INSERT INTO users (
              organization_id,
              internal_account,
              display_name,
              department_id,
              job_function_id,
              platform_role,
              status
            )
            VALUES (
              ${input.organizationId},
              ${input.account},
              ${input.displayName},
              ${input.departmentId ?? null},
              ${input.jobFunctionId ?? null},
              ${input.role},
              'invited'
            )
            RETURNING *
          `;
          if (!row) throw new Error("创建用户失败");
          await transaction`
            INSERT INTO activation_tokens (user_id, token_hash, expires_at)
            VALUES (${row.id}, ${input.activationTokenHash}, ${input.activationExpiresAt})
          `;
          users.push(withoutPassword(mapUser({
            ...row,
            password_hash: null,
            must_change_password: true,
          })));
        }
        return users;
      });
    } catch (error) {
      if (error instanceof postgres.PostgresError && error.code === "23505") {
        throw new IdentityConflictError("内部账号已存在");
      }
      throw error;
    }
  }

  async activateUser(activationTokenHash: string, passwordHash: string) {
    return this.sql.begin(async (transaction) => {
      const [token] = await transaction`
        SELECT *
        FROM activation_tokens
        WHERE token_hash = ${activationTokenHash}
          AND used_at IS NULL
          AND expires_at > now()
        FOR UPDATE
      `;
      if (!token) return null;

      await transaction`
        INSERT INTO user_credentials (user_id, password_hash, must_change_password)
        VALUES (${token.user_id}, ${passwordHash}, false)
        ON CONFLICT (user_id)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          must_change_password = false,
          password_changed_at = now()
      `;
      await transaction`
        UPDATE activation_tokens SET used_at = now() WHERE id = ${token.id}
      `;
      const [row] = await transaction`
        UPDATE users
        SET status = 'active', updated_at = now()
        WHERE id = ${token.user_id}
        RETURNING *
      `;
      if (!row) return null;
      return withoutPassword(mapUser({
        ...row,
        password_hash: passwordHash,
        must_change_password: false,
      }));
    });
  }

  async createSession(userId: string, tokenHash: string, expiresAt: Date) {
    await this.sql`
      INSERT INTO sessions (user_id, token_hash, expires_at)
      VALUES (${userId}, ${tokenHash}, ${expiresAt})
    `;
  }

  async revokeSession(tokenHash: string) {
    await this.sql`
      UPDATE sessions
      SET revoked_at = now()
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
    `;
  }

  async getLoginProtection(account: string) {
    const [row] = await this.sql`
      SELECT failed_count, locked_until
      FROM login_attempts
      WHERE account_normalized = lower(${account})
      LIMIT 1
    `;
    return {
      failedCount: Number(row?.failed_count ?? 0),
      lockedUntil: row?.locked_until
        ? new Date(row.locked_until as string | Date)
        : null,
    };
  }

  async recordLoginFailure(input: {
    account: string;
    ip: string;
    maxFailures: number;
    windowMinutes: number;
    lockMinutes: number;
  }) {
    const [row] = await this.sql`
      INSERT INTO login_attempts (
        account_normalized, failed_count, first_failed_at,
        last_failed_at, locked_until, last_ip
      )
      VALUES (lower(${input.account}), 1, now(), now(), null, ${input.ip})
      ON CONFLICT (account_normalized) DO UPDATE SET
        failed_count = CASE
          WHEN login_attempts.first_failed_at
            < now() - (${input.windowMinutes} * interval '1 minute')
          THEN 1
          ELSE login_attempts.failed_count + 1
        END,
        first_failed_at = CASE
          WHEN login_attempts.first_failed_at
            < now() - (${input.windowMinutes} * interval '1 minute')
          THEN now()
          ELSE login_attempts.first_failed_at
        END,
        last_failed_at = now(),
        locked_until = CASE
          WHEN (
            CASE
              WHEN login_attempts.first_failed_at
                < now() - (${input.windowMinutes} * interval '1 minute')
              THEN 1
              ELSE login_attempts.failed_count + 1
            END
          ) >= ${input.maxFailures}
          THEN now() + (${input.lockMinutes} * interval '1 minute')
          ELSE login_attempts.locked_until
        END,
        last_ip = EXCLUDED.last_ip
      RETURNING failed_count, locked_until
    `;
    return {
      failedCount: Number(row?.failed_count ?? 1),
      lockedUntil: row?.locked_until
        ? new Date(row.locked_until as string | Date)
        : null,
    };
  }

  async clearLoginFailures(account: string) {
    await this.sql`
      DELETE FROM login_attempts
      WHERE account_normalized = lower(${account})
    `;
  }

  async recordAuditEvent(input: {
    actorUserId?: string;
    action: string;
    objectType: string;
    objectId?: string;
    metadata?: AuditMetadata;
  }) {
    await this.sql`
      INSERT INTO audit_events (actor_user_id, action, object_type, object_id, metadata)
      VALUES (
        ${input.actorUserId ?? null},
        ${input.action},
        ${input.objectType},
        ${input.objectId ?? null},
        ${this.sql.json(input.metadata ?? {})}
      )
    `;
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}
