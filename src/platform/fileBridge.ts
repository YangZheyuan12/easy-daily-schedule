/**
 * 文件的「落地」与「读取」。
 *
 * 这是全项目**少数允许直接碰浏览器 API** 的地方之一（另一个是
 * `capacitorBridge.ts`）。备份的纯数据逻辑在 `services/backupService.ts`，
 * 那里面一个浏览器 API 都不能有；只有真正要把字节写到磁盘 / 从磁盘读回来时，
 * 才走到这里。
 *
 * 关于原生壳：Capacitor 的 WebView 里 `<input type="file">` 是**可用的**
 * （Android / iOS 都会唤起系统文件选择器），所以导入这一侧 Web 与原生共用一套代码。
 * 导出侧用 `<a download>`，在桌面浏览器会直接下载，在 App 内 WebView 里
 * 会交给系统下载器 / 「存储」App —— 行为不如 Share 插件优雅，但零新增依赖。
 */

/** 把一段文本存成文件交给用户（触发下载 / 系统保存） */
export function saveTextFile(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // 立刻 revoke 会让部分浏览器来不及取数据，放到下一轮事件循环
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * 弹系统文件选择器读一个文本文件。
 * 用户取消或没选到内容时 resolve `null`（而不是 reject —— 取消是正常操作，不是错误）。
 */
export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      document.body.removeChild(input);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        cleanup();
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => {
        cleanup();
        resolve(null);
      };
      reader.readAsText(file);
    });

    // 现代浏览器支持 cancel 事件；不支持时最多留一个隐藏 input，下一次调用会再建一个
    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });

    input.click();
  });
}
