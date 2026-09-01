import { stat } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../lib/app-error.js";

export class PlatformArtifactStore {
  private readonly root: string;
  private readonly publishedRoot: string;

  constructor(toolAssetsDirectory: string, publishedToolsDirectory?: string) {
    this.root = path.resolve(toolAssetsDirectory);
    this.publishedRoot = path.resolve(publishedToolsDirectory ?? toolAssetsDirectory);
  }

  async resolvePublishedArtifact(downloadUrl: string) {
    let pathname: string;
    try {
      pathname = new URL(downloadUrl, "http://workbench.local").pathname;
    } catch {
      throw new AppError(409, "CONFLICT", "工具文件地址无效");
    }
    const location = pathname.startsWith("/demo-assets/")
      ? { prefix: "/demo-assets/", root: this.root }
      : pathname.startsWith("/published-tools/")
        ? { prefix: "/published-tools/", root: this.publishedRoot }
        : null;
    if (!location) {
      throw new AppError(409, "CONFLICT", "当前开发环境只允许读取平台工具文件");
    }
    const relative = decodeURIComponent(pathname.slice(location.prefix.length));
    const resolved = path.resolve(location.root, relative);
    if (
      resolved !== location.root
      && !resolved.startsWith(`${location.root}${path.sep}`)
    ) {
      throw new AppError(409, "CONFLICT", "工具文件地址越过了允许目录");
    }
    const file = await stat(resolved).catch(() => null);
    if (!file?.isFile()) {
      throw new AppError(409, "CONFLICT", "工具原始文件暂未准备好");
    }
    return { path: resolved, bytes: file.size };
  }
}
