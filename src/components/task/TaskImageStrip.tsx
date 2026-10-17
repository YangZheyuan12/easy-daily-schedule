import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ImageThumb } from '@/components/item/ImageThumb';
import { ImageLightbox } from '@/components/item/ImageLightbox';
import { useTaskImageStore, EMPTY_TASK_IMAGES } from '@/store/useTaskImageStore';

interface TaskImageStripProps {
  /** 所属任务 id */
  taskId: string;
  /** 左侧缩进 px（对齐标题列） */
  indent?: number;
}

/**
 * 任务行的**只读**图片条。
 *
 * 上传 / 删除统一收在编辑抽屉里（见 `TaskImageSection`）—— 列表只负责让人一眼
 * 看到「这条任务配了图」，点开看大图。给它第二个写入口，用户就会分不清刚才的图加在哪。
 */
export function TaskImageStrip({ taskId, indent = 38 }: TaskImageStripProps) {
  const images = useTaskImageStore((s) => s.byTask[taskId] ?? EMPTY_TASK_IMAGES);
  const [lightboxBlob, setLightboxBlob] = useState<Blob | null>(null);

  // 图片按「整页任务」批量加载（TaskKindPage 负责触发），这里只兜单据加载
  useEffect(() => {
    if (images.length > 0) return;
    void useTaskImageStore.getState().loadOne(taskId);
    // 只在挂载时兜一次：后续由页面的批量加载负责
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (images.length === 0) return null;

  return (
    <>
      <div className="flex items-start gap-2 flex-wrap pt-0.5" style={{ paddingLeft: indent }}>
        {images.map((image) => (
          <ImageThumb
            key={image.id}
            blob={image.blob}
            size={52}
            onClick={() => setLightboxBlob(image.blob)}
          />
        ))}
        {images.length > 1 && (
          <span className="self-end pb-0.5 text-micro text-ink-faint tabular-nums">
            <Icon name="image" size={12} className="inline align-[-2px]" /> {images.length}
          </span>
        )}
      </div>
      <ImageLightbox blob={lightboxBlob} onClose={() => setLightboxBlob(null)} />
    </>
  );
}
