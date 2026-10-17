import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ImageThumb } from './ImageThumb';
import { ImageLightbox } from './ImageLightbox';
import { ImageEditor } from './ImageEditor';
import { useItemImageStore, EMPTY_IMAGES } from '@/store/useItemImageStore';
import type { ItemImage } from '@/domain/types';

interface ItemImageSectionProps {
  /** 所属条目 id */
  itemId: string;
}

/**
 * 条目图片附件段落：图片网格 + 添加 + 删除 + 看大图。
 *
 * 嵌在「条目详情抽屉」（板块详情页点行尾「⋯」打开）里 —— 图片与条目描述、
 * 评价一样，都属于「改这一条记录」的范畴，所以入口收在这一处。
 *
 * 今日列表只**展示**已有图片（行内只读预览，可折叠），不从那里上传：
 * 同一份数据如果有两个可写入口，用户就会困惑「我刚才在今日加的图去哪了」。
 */
export function ItemImageSection({ itemId }: ItemImageSectionProps) {
  const images = useItemImageStore((s) => s.byItem[itemId] ?? EMPTY_IMAGES);
  const addImages = useItemImageStore((s) => s.add);
  const removeImage = useItemImageStore((s) => s.remove);
  const loadImages = useItemImageStore((s) => s.loadForItems);

  const fileRef = useRef<HTMLInputElement>(null);
  const [lightboxBlob, setLightboxBlob] = useState<Blob | null>(null);

  /*
    编辑器队列：用户一次可多选若干张图。逐张进入 ImageEditor 调整，
    每确认一张就收集其编辑结果（Blob），全部处理完后再统一 addImages 落库。
    中途对某张点「取消」= 跳过这张（不收集），继续下一张。
  */
  const [queue, setQueue] = useState<Blob[]>([]);
  const [editIndex, setEditIndex] = useState(-1);
  const [editedBlobs, setEditedBlobs] = useState<Blob[]>([]);

  /*
    抽屉切到另一条条目时重新拉取。key 用条目 id —— 与今日列表「按天批量拉」
    是两个不同作用域，共用 loadedKey 时会互相判为重击：抽屉打开时今日列表已卸载，
    回到今日时列表重挂载又会因为 key 变了一次重新拉，自愈。
  */
  useEffect(() => {
    void loadImages([itemId], itemId);
  }, [itemId, loadImages]);

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('image/'),
    );
    // 清空，保证选同一张也能再次触发 change
    event.target.value = '';
    if (files.length === 0) return;
    setEditedBlobs([]);
    setQueue(files);
    setEditIndex(0);
  };

  const finishEditing = async (finalBlobs: Blob[]) => {
    if (finalBlobs.length > 0) {
      await addImages(itemId, finalBlobs);
    }
    setQueue([]);
    setEditIndex(-1);
    setEditedBlobs([]);
  };

  // 取消当前这张 → 跳过，进入下一张（或收尾）
  const handleEditorCancel = () => {
    const next = editIndex + 1;
    if (next >= queue.length) {
      void finishEditing(editedBlobs);
    } else {
      setEditIndex(next);
    }
  };

  // 确认当前这张 → 收集结果，进入下一张（或收尾）
  const handleEditorConfirm = (blob: Blob) => {
    const nextBlobs = [...editedBlobs, blob];
    setEditedBlobs(nextBlobs);
    const next = editIndex + 1;
    if (next >= queue.length) {
      void finishEditing(nextBlobs);
    } else {
      setEditIndex(next);
    }
  };

  const currentEdit = editIndex >= 0 && editIndex < queue.length ? queue[editIndex] : null;

  return (
    <div className="py-3 border-t border-surface-line">
      <div className="text-meta font-medium text-ink-muted mb-1.5">图片（{images.length}）</div>

      <div className="flex flex-wrap gap-2.5">
        {images.map((image: ItemImage) => (
          <ImageThumb
            key={image.id}
            blob={image.blob}
            size={72}
            showDelete
            onClick={() => setLightboxBlob(image.blob)}
            onDelete={() => removeImage(image.id, itemId)}
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
        图片只保存在本机，用于给这条记录补充现场照片、截图等。
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />

      <ImageLightbox blob={lightboxBlob} onClose={() => setLightboxBlob(null)} />

      {currentEdit && (
        <ImageEditor
          blob={currentEdit}
          onCancel={handleEditorCancel}
          onConfirm={handleEditorConfirm}
        />
      )}
    </div>
  );
}
