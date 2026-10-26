import { DomainError } from '@/domain/errors';

/**
 * 从模型返回的文本中稳定地抽取 JSON 对象。
 *
 * 模型可能在 JSON 外面包一层 ```json 代码块，或在前后加说明文字；
 * 这里先去围栏，再取第一个 `{` 到最后一个 `}` 之间的内容，最后 JSON.parse。
 */
export function extractJsonObject(text: string): unknown {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new DomainError('AI 返回为空');
  }
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new DomainError('AI 返回中未找到 JSON');
  }
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    throw new DomainError('AI 返回 JSON 解析失败');
  }
}

/** 读取响应体的错误文本（失败也不抛，最多返回空串） */
export async function safeErrorText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}
