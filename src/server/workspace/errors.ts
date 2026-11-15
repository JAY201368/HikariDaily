import "server-only";
export class WorkspaceError extends Error {
    constructor(public code: string, public status: number, message: string, public details?: Record<string, unknown>) {
        super(message);
    }
}
export const unavailable = () => new WorkspaceError("WORKSPACE_UNAVAILABLE", 503, "私人工作区暂不可用");
export const invalid = () => new WorkspaceError("INVALID_INPUT", 400, "请检查输入内容");
export const unauthorized = () => new WorkspaceError("UNAUTHORIZED", 401, "请先登录");
export const staleConfig = () => new WorkspaceError("CONFIG_CHANGED", 409, "模型配置已变更，请重新操作");
