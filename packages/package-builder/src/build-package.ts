import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipArchive } from "archiver";
import {
  compilePackageTextFiles,
  createStartPrompt,
  archivePathSegment,
  type PackageBuildInput,
} from "./package-content.js";

export type PackageBuildResult = {
  archivePath: string;
  bytes: number;
  sha256: string;
  startPrompt: string;
};

function safeSegment(value: string) {
  const sanitized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 100);
  return sanitized || "package";
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

export async function buildPackageArchive(
  input: PackageBuildInput,
  outputDirectory: string,
): Promise<PackageBuildResult> {
  await mkdir(outputDirectory, { recursive: true });
  const baseName = `${safeSegment(input.draft.name)}-${safeSegment(input.packageVersion)}`;
  const archivePath = path.join(outputDirectory, `${input.packageVersionId}-${baseName}.zip`);
  const temporaryPath = `${archivePath}.partial`;
  await rm(temporaryPath, { force: true });

  const archive = new ZipArchive({ zlib: { level: 6 }, forceZip64: true });
  const output = createWriteStream(temporaryPath, { flags: "wx" });
  const completed = new Promise<void>((resolve, reject) => {
    output.once("close", resolve);
    output.once("error", reject);
    archive.once("error", reject);
  });
  archive.pipe(output);

  try {
    for (const file of compilePackageTextFiles(input)) {
      archive.append(file.content, { name: file.path, date: new Date(input.createdAt) });
    }
    for (const tool of input.tools) {
      archive.file(tool.artifactPath, {
        name: `tool-files/${archivePathSegment(tool.toolSlug)}/${archivePathSegment(tool.toolSlug)}-${archivePathSegment(tool.version)}.zip`,
        date: new Date(input.createdAt),
      });
    }
    await archive.finalize();
    await completed;
    await rename(temporaryPath, archivePath);
    const fileStat = await stat(archivePath);
    return {
      archivePath,
      bytes: fileStat.size,
      sha256: await sha256File(archivePath),
      startPrompt: createStartPrompt(input),
    };
  } catch (error) {
    archive.abort();
    output.destroy();
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
