import { useEffect } from 'react';
import { useObjectUrl } from '@/hooks/useObjectUrl';
import { Icon } from '@/components/ui/Icon';

interface ImageLightboxProps {
  blob: Blob | null;
  onClose: () => void;
}

/**
 * 全屏看大图。点遮罩 / 关闭按钮 / Esc 退出；图片本身吞掉点击事件，避免误关。
 */
export function ImageLightbox({ blob, onClose }: ImageLightboxProps) {
  const url = useObjectUrl(blob);

  useEffect(() => {
    if (!blob) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [blob, onClose]);

  if (!blob) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center p-4 m-fade"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center text-white/90 active:opacity-60"
      >
        <Icon name="close" size={24} strokeWidth={2.2} />
      </button>
      {url ? (
        <img
          src={url}
          alt=""
          onClick={(event) => event.stopPropagation()}
          className="max-w-full max-h-full object-contain rounded-lg"
        />
      ) : (
        <div className="w-40 h-40 rounded-lg bg-white/10" />
      )}
    </div>
  );
}
