import { useEffect, useState } from 'react';

/**
 * 把一个 Blob 安全地转成可用于 `<img src>` 的对象 URL。
 *
 * 组件卸载（或 blob 变化）时自动 `revokeObjectURL` 回收，避免对象 URL 泄漏导致的内存堆积。
 * 图片是 Blob，直接 `URL.createObjectURL` 即可，无需 FileReader 读写。
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return url;
}
