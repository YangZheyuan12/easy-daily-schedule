import { useObjectUrl } from '@/hooks/useObjectUrl';
import { Icon } from '@/components/ui/Icon';

interface ImageThumbProps {
  blob: Blob;
  /** 缩略图边长 px */
  size?: number;
  /** 点击缩略图（默认打开大图查看） */
  onClick?: () => void;
  /** 是否在右上角显示删除按钮 */
  showDelete?: boolean;
  onDelete?: () => void;
}

/**
 * 图片缩略图。背景用下沉底占位，加载完成淡入，避免二进制还没到位时一片空白突兀。
 */
export function ImageThumb({
  blob,
  size = 56,
  onClick,
  showDelete = false,
  onDelete,
}: ImageThumbProps) {
  const url = useObjectUrl(blob);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        aria-label="查看图片"
        className={
          onClick
            ? 'block w-full h-full rounded-[10px] overflow-hidden border border-surface-line bg-surface-sunken active:opacity-80'
            : 'block w-full h-full rounded-[10px] overflow-hidden border border-surface-line bg-surface-sunken'
        }
      >
        {url ? (
          <img
            src={url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full" />
        )}
      </button>
      {showDelete && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="删除图片"
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center shadow"
        >
          <Icon name="close" size={12} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}
