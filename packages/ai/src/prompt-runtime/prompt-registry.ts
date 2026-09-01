import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

export const promptKeySchema = z.enum([
  "requirement-understanding",
  "recommendation",
  "context-compression",
]);

export type PromptKey = z.infer<typeof promptKeySchema>;

const manifestSchema = z.object({
  key: promptKeySchema,
  version: z.string(),
  systemFile: z.string(),
  outputContract: z.string(),
});

export type PromptTemplate = z.infer<typeof manifestSchema> & {
  system: string;
};

const activePromptDirectories: Record<PromptKey, string> = {
  "requirement-understanding": "v3",
  recommendation: "v7",
  "context-compression": "v2",
};

export class PromptRegistry {
  constructor(
    private readonly root = fileURLToPath(new URL("../../prompts", import.meta.url)),
  ) {}

  async get(
    key: PromptKey,
    versionDirectory = activePromptDirectories[key],
  ): Promise<PromptTemplate> {
    const directory = path.join(this.root, key, versionDirectory);
    const manifest = manifestSchema.parse(JSON.parse(
      await readFile(path.join(directory, "manifest.json"), "utf8"),
    ));
    if (manifest.key !== key) {
      throw new Error(`Prompt目录与manifest不一致: ${key}`);
    }
    return {
      ...manifest,
      system: await readFile(path.join(directory, manifest.systemFile), "utf8"),
    };
  }
}
