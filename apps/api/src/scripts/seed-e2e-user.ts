import { PostgresIdentityRepository } from "@ai-tool-workbench/db";
import { z } from "zod";
import { readServerConfig } from "../config.js";
import { AccountService } from "../services/account-service.js";

const inputSchema = z.object({
  E2E_ACCOUNT: z.string().min(1).default("e2e-admin"),
  E2E_PASSWORD: z.string().min(8).default("e2e-local-password-123"),
  E2E_DISPLAY_NAME: z.string().min(1).default("自动化测试管理员"),
  E2E_ORGANIZATION: z.string().min(1).default("自动化测试组织"),
});

const config = readServerConfig();
if (config.PLATFORM_ENV !== "test") {
  throw new Error("只允许在测试环境创建端到端测试账号");
}
const input = inputSchema.parse(process.env);
const repository = PostgresIdentityRepository.connect(config.DATABASE_URL);

try {
  const organizationId = await repository.ensureOrganization(input.E2E_ORGANIZATION);
  const accounts = new AccountService(repository, {
    sessionHours: config.SESSION_HOURS,
    activationHours: config.ACTIVATION_HOURS,
  });
  const [invitation] = await accounts.inviteUsers(undefined, organizationId, [{
    account: input.E2E_ACCOUNT,
    displayName: input.E2E_DISPLAY_NAME,
    role: "admin",
  }]);
  if (!invitation?.activationToken) {
    throw new Error("端到端测试账号创建失败；请使用空测试数据库运行");
  }
  await accounts.activate(invitation.activationToken, input.E2E_PASSWORD);
  console.log(`E2E user ready: ${input.E2E_ACCOUNT}`);
} finally {
  await repository.close();
}
