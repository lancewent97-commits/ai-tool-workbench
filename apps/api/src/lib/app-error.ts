import type { ApiErrorCode } from "@ai-tool-workbench/contracts";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
