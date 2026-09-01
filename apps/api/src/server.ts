import {
  PostgresAiMemoryRepository,
  PostgresIdentityRepository,
  PostgresDownloadHistoryRepository,
  PostgresPackageGenerationRepository,
  PostgresReturnSubmissionRepository,
  PostgresTaskWorkspaceRepository,
  PostgresToolCatalogRepository,
  PostgresToolAssetRepository,
  PostgresUploadSessionRepository,
  PostgresPrecheckJobRepository,
} from "@ai-tool-workbench/db";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  AiOrchestrator,
  assertExternalModelInputAllowed,
  DeepSeekAiProvider,
  MockAiProvider,
} from "@ai-tool-workbench/ai";
import { buildApp } from "./app.js";
import { readServerConfig } from "./config.js";
import { CatalogCandidateSource } from "./services/catalog-candidate-source.js";
import { PackageGenerationService } from "./services/package-generation-service.js";
import { DownloadService } from "./services/download-service.js";
import { PlatformArtifactStore } from "./services/platform-artifact-store.js";
import { ReturnService } from "./services/return-service.js";
import { ReturnReviewService } from "./services/return-review-service.js";
import { ToolAssetService } from "./services/tool-asset-service.js";
import { UploadSessionService } from "./services/upload-session-service.js";
import { PrecheckJobService } from "./services/precheck-job-service.js";

const config = readServerConfig();
assertExternalModelInputAllowed(
  config.PLATFORM_ENV === "production" ? "production" : config.NODE_ENV,
  config.AI_PROVIDER,
);
const aiProvider = config.AI_PROVIDER === "mock"
  ? new MockAiProvider()
  : config.AI_PROVIDER === "external-dev"
    ? new DeepSeekAiProvider({
        apiKey: config.DEEPSEEK_API_KEY,
        baseUrl: config.DEEPSEEK_BASE_URL,
        model: config.DEEPSEEK_MODEL,
        timeoutMs: config.DEEPSEEK_TIMEOUT_MS,
        dataMode: "sanitized-test",
      })
    : null;
if (!aiProvider) throw new Error("公司内部模型Provider尚未配置");
const repository = PostgresIdentityRepository.connect(config.DATABASE_URL);
const toolRepository = PostgresToolCatalogRepository.connect(config.DATABASE_URL);
const toolAssetRepository = PostgresToolAssetRepository.connect(config.DATABASE_URL);
const aiMemory = PostgresAiMemoryRepository.connect(config.DATABASE_URL);
const taskWorkspace = PostgresTaskWorkspaceRepository.connect(config.DATABASE_URL);
const packageRepository = PostgresPackageGenerationRepository.connect(config.DATABASE_URL);
const downloadHistory = PostgresDownloadHistoryRepository.connect(config.DATABASE_URL);
const returnRepository = PostgresReturnSubmissionRepository.connect(config.DATABASE_URL);
const uploadRepository = PostgresUploadSessionRepository.connect(config.DATABASE_URL);
const precheckJobRepository = PostgresPrecheckJobRepository.connect(config.DATABASE_URL);
const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
const storageRoot = path.isAbsolute(config.PLATFORM_STORAGE_ROOT)
  ? config.PLATFORM_STORAGE_ROOT
  : path.join(projectRoot, config.PLATFORM_STORAGE_ROOT);
const publishedToolsDirectory = path.join(storageRoot, "published-tools");
const artifactStore = new PlatformArtifactStore(
  path.join(projectRoot, "apps/web/public/demo-assets"),
  publishedToolsDirectory,
);
const packageGeneration = new PackageGenerationService(
  taskWorkspace,
  toolRepository,
  packageRepository,
  {
    outputDirectory: path.join(storageRoot, "generated-packages"),
    productionStandard: await readFile(
      path.join(projectRoot, "docs/standards/工具生产与上传标准-讨论稿.md"),
      "utf8",
    ),
  },
  artifactStore,
);
const downloads = new DownloadService(
  downloadHistory,
  packageRepository,
  toolRepository,
  artifactStore,
);
const returns = new ReturnService(
  returnRepository,
  downloadHistory,
  {
    uploadDirectory: path.join(storageRoot, "return-uploads"),
    standardVersion: "v0.28",
  },
);
const returnReviews = new ReturnReviewService(
  returnRepository,
  repository,
  { publishedDirectory: publishedToolsDirectory },
);
const toolAssets = new ToolAssetService(toolAssetRepository, repository, {
  uploadDirectory: publishedToolsDirectory,
  standardVersion: "v0.28",
});
const uploads = new UploadSessionService(
  uploadRepository,
  path.join(storageRoot, "resumable-uploads"),
);
const precheckJobs = new PrecheckJobService(
  precheckJobRepository,
  uploads,
  toolAssets,
  returns,
);
const aiOrchestrator = new AiOrchestrator(
  aiMemory,
  new CatalogCandidateSource(toolRepository),
  aiProvider,
);
const { app } = buildApp(
  repository,
  config,
  toolRepository,
  aiOrchestrator,
  taskWorkspace,
  packageGeneration,
  downloads,
  returns,
  returnReviews,
  toolAssets,
  uploads,
  precheckJobs,
);

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down");
  precheckJobs.stop();
  await app.close();
  await packageGeneration.stop();
  await Promise.all([
    repository.close(),
    toolRepository.close(),
    aiMemory.close(),
    taskWorkspace.close(),
    packageRepository.close(),
    downloadHistory.close(),
    returnRepository.close(),
    toolAssetRepository.close(),
    uploadRepository.close(),
    precheckJobRepository.close(),
  ]);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  app.log.info({
    platformEnvironment: config.PLATFORM_ENV,
    storageRoot,
  }, "Starting platform environment");
  const interruptedPackages = await packageGeneration.recoverInterrupted();
  if (interruptedPackages > 0) {
    app.log.warn(
      { interruptedPackages },
      "Marked interrupted package generations as failed so users can retry",
    );
  }
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
  await precheckJobs.start();
} catch (error) {
  app.log.error(error);
  await Promise.all([
    repository.close(),
    toolRepository.close(),
    aiMemory.close(),
    taskWorkspace.close(),
    packageRepository.close(),
    downloadHistory.close(),
    returnRepository.close(),
    toolAssetRepository.close(),
    uploadRepository.close(),
    precheckJobRepository.close(),
  ]);
  process.exit(1);
}
