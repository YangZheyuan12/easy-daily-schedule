/** 缩进引导线：每一层一条竖线，帮助用户在深层嵌套时看清自己属于哪个父节点。 */
export function IndentGuides({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <div className="flex shrink-0 self-stretch">
      {Array.from({ length: depth }, (_, i) => (
        <div
          key={i}
          className="w-5 shrink-0 flex justify-center"
          style={{ marginLeft: i === 0 ? 0 : 0 }}
        >
          <div className="w-px h-full bg-surface-line" />
        </div>
      ))}
    </div>
  );
}
