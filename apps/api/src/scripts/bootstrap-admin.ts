import { PostgresIdentityRepository } from "@ai-tool-workbench/db";
import { z } from "zod";
import { readServerConfig } from "../config.js";
import { AccountService } from "../services/account-service.js";

const inputSchema = z.object({
  BOOTSTRAP_ORGANIZATION: z.string().min(1),
  BOOTSTRAP_ADMIN_ACCOUNT: z.string().min(1),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1),
});

const config = readServerConfig();
const input = inputSchema.parse(process.env);
const repository = PostgresIdentityRepository.connect(config.DATABASE_URL);

try {
  const organizationId = await repository.ensureOrganization(input.BOOTSTRAP_ORGANIZATION);
  const accounts = new AccountService(repository, {
    sessionHours: config.SESSION_HOURS,
    activationHours: config.ACTIVATION_HOURS,
  });
  const [invitation] = await accounts.inviteUsers(undefined, organizationId, [{
    account: input.BOOTSTRAP_ADMIN_ACCOUNT,
    displayName: input.BOOTSTRAP_ADMIN_NAME,
    role: "admin",
  }]);
  if (!invitation) throw new Error("管理员邀请创建失败");
  console.log(JSON.stringify({
    organizationId,
    account: invitation.user.account,
    activationToken: invitation.activationToken,
    activationExpiresAt: invitation.activationExpiresAt,
  }, null, 2));
} finally {
  await repository.close();
}
