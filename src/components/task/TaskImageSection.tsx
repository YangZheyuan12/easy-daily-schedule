import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ImageThumb } from '@/components/item/ImageThumb';
import { ImageLightbox } from '@/components/item/ImageLightbox';
import { ImageEditor } from '@/components/item/ImageEditor';
import { useTaskImageStore, EMPTY_TASK_IMAGES } from '@/store/useTaskImageStore';
import type { TaskImage } from '@/domain/types';

interface TaskImageSectionProps {
  /** 所属任务 id */
  taskId: string;
}

/**
 * 任务图片附件段落：图片网格 + 添加 + 删除 + 看大图。
 *
 * 与条目那条链路（`ItemImageSection`）刻意保持同构：同一套缩略图尺寸、同一个
 * 「+ 添加」虚线框、点缩略图也是同一套全屏大图 —— 用户在条目里学会的操作，
 * 在任务里不用重新学一遍。
 *
 * 只嵌在**编辑抽屉**里（行上是只读预览）：同一份数据如果有两个可写入口，
 * 用户就会困惑「我刚才在列表加的图去哪了」。
 */
export function TaskImageSection({ taskId }: TaskImageSectionProps) {
  const images = useTaskImageStore((s) => s.byTask[taskId] ?? EMPTY_TASK_IMAGES);
  const addImages = useTaskImageStore((s) => s.add);
  const removeImage = useTaskImageStore((s) => s.remove);
  const replaceImage = useTaskImageStore((s) => s.replace);
  const loadImages = useTaskImageStore((s) => s.loadOne);

  const fileRef = useRef<HTMLInputElement>(null);
  // 用 id 而非 blob 记录当前看大图的图片：replace 后能从 store 取到新 blob 自动刷新
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  // 重新编辑（裁剪 / 旋转后覆盖写回）正在处理的图片 id
  const [editingId, setEditingId] = useState<string | null>(null);

  const lightboxImage = lightboxId ? images.find((img) => img.id === lightboxId) ?? null : null;
  const lightboxBlob = lightboxImage?.blob ?? null;
  const editingImage = editingId ? images.find((img) => img.id === editingId) ?? null : null;

  // 抽屉切到另一条任务时重新拉取（taskId 变了就必须重读）
  useEffect(() => {
    void loadImages(taskId);
  }, [taskId, loadImages]);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // 清空，保证选同一张也能再次触发 change
    event.target.value = '';
    if (files.length === 0) return;
    await addImages(taskId, files);
  };

  return (
    <div className="pt-3 border-t border-surface-line">
      <div className="text-meta font-medium text-ink-muted mb-1.5">图片（{images.length}）</div>

      <div className="flex flex-wrap gap-2.5">
        {images.map((image: TaskImage) => (
          <ImageThumb
            key={image.id}
            blob={image.blob}
            size={72}
            showDelete
            onClick={() => setLightboxId(image.id)}
            onDelete={() => removeImage(image.id, taskId)}
          />
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-[72px] h-[72px] rounded-[10px] border border-dashed border-edge-strong flex flex-col items-center justify-center gap-1 text-ink-faint active:opacity-70"
        >
          <Icon name="plus" size={20} />
          <span className="text-micro leading-none">添加</span>
        </button>
      </div>

      <p className="mt-2 text-caption leading-5 text-ink-faint">
        图片只保存在本机，用于给这条任务补充参考：通知截图、现场照片等。
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      <ImageLightbox
        blob={lightboxBlob}
        onClose={() => setLightboxId(null)}
        editable
        onEdit={() => {
          setEditingId(lightboxId);
          setLightboxId(null);
        }}
      />

      {editingImage && (
        <ImageEditor
          blob={editingImage.blob}
          onCancel={() => setEditingId(null)}
          onConfirm={async (edited: Blob) => {
            if (editingId) await replaceImage(editingId, taskId, edited);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}
