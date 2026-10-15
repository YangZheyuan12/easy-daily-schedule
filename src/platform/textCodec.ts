/**
 * 文本文件的字符解码。
 *
 * 为什么需要这一层：国内教务系统导出的 CSV / Excel 另存的 CSV **绝大多数是 GBK**，
 * 而 `FileReader.readAsText()` 不指定编码时按 UTF-8 解，中文会整片变成乱码
 * （“高等数学” → “������”）。所以必须先拿到字节再自己解，而不是直接读成字符串。
 *
 * 放在 `src/platform/` 是因为 `TextDecoder` 属于运行时能力，不属于业务内核；
 * `src/services/` 保持零浏览器 API，解析逻辑才能迁小程序复用。
 */

/** UTF-8 BOM 与 UTF-16 BOM 的字节标记 */
const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function startsWith(bytes: Uint8Array, bom: number[]): boolean {
  if (bytes.length < bom.length) return false;
  return bom.every((byte, index) => bytes[index] === byte);
}

/**
 * 把字节解成字符串：看 BOM → 试 UTF-8 严格模式 → 退 GBK。
 *
 * UTF-8 用 `fatal: true` 是为了**真的**判断「这串字节是不是合法 UTF-8」：
 * 默认的非严格模式会把非法字节替换成 U+FFFD，永远不抛错，就没法区分
 * 「UTF-8 无误」和「其实是 GBK」了。
 */
export function decodeTextBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  if (startsWith(bytes, UTF8_BOM)) {
    return new TextDecoder('utf-8').decode(bytes.subarray(UTF8_BOM.length));
  }
  if (startsWith(bytes, UTF16LE_BOM)) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(UTF16LE_BOM.length));
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(UTF16BE_BOM.length));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // 不是合法 UTF-8，按国内环境的实际情况回退 GBK（GB18030 是它的超集，兼容更好）
    try {
      return new TextDecoder('gb18030').decode(bytes);
    } catch {
      // 运行时连 gb18030 都不支持（极少见），最后按 latin1 兜底，至少不白屏
      return new TextDecoder('latin1').decode(bytes);
    }
  }
}
