/**
 * 统一的错误类型与退出码。
 *
 * 退出码约定：
 *   0  成功
 *   1  一般错误（模板损坏、IO 失败、外部命令失败…）
 *   2  用法 / 输入错误（参数非法、缺少必填输入）
 *   3  用户主动取消
 *   4  目标冲突（目录非空且策略为中止）
 */
export class CtplError extends Error {
  constructor(message, { code = 'E_GENERIC', exitCode = 1 } = {}) {
    super(message);
    this.name = 'CtplError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export class AbortError extends CtplError {
  constructor(message = '已取消') {
    super(message, { code: 'E_ABORTED', exitCode: 3 });
  }
}

export function fail(message, opts) {
  throw new CtplError(message, opts);
}

/** 把任意异常统一成人能看懂的一行消息。 */
export function describe(err) {
  if (err instanceof CtplError) return err.message;
  if (err && err.message) return err.message;
  return String(err);
}
