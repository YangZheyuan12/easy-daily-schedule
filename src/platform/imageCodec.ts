/**
 * Blob ↔ base64 data URL 互转。
 *
 * 只服务备份：JSON 里装不下 Blob，图片要出门必须先变成字符串。
 * 放在 `src/platform/` 是因为 FileReader / atob 都是浏览器 API，
 * 不能出现在 `src/services/`（那是迁移小程序要复用的内核）。
 */

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('图片读取失败'));
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 把 data URL 还原成 Blob。
 * 格式：`data:<mime>;base64,<payload>`；不合法的返回 null，让调用方跳过这一张，
 * 而不是让整个导入失败 —— 一张坏图不该毁掉整份备份。
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]+)?(;charset=[^;,]+)?;base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || 'application/octet-stream';
  const payload = match[3];
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}
