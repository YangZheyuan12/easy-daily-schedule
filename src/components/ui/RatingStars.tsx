import clsx from 'clsx';
import type { Rating } from '@/domain/enums';
import { Icon } from '@/components/ui/Icon';
import { useRecentlyChanged } from '@/hooks/useRecentlyChanged';

interface RatingStarsProps {
  value: Rating;
  onChange?: (value: Rating) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SIZE_CLASS = {
  sm: 'text-heading gap-1',
  md: 'text-title gap-1.5',
  lg: 'text-display gap-2',
} as const;

/** 换成矢量星后尺寸改由 Icon 直接给出（text-* 只影响行高，保留不冲突） */
const STAR_PX = { sm: 16, md: 22, lg: 30 } as const;

/**
 * 星级评分。
 *
 * 交互细节：再次点击当前星级表示取消评分（回到 0），
 * 否则用户一旦打了分就无法撤销，只能刷新。
 */
export function RatingStars({ value, onChange, size = 'md', label }: RatingStarsProps) {
  const readOnly = !onChange;
  // 评分一变，**新选中的那颗**弹一下：让用户看到「改成了第几颗」，
  // 而不是五颗星一起换色（一起换色时很难分辨到底落在哪一颗）。
  const popped = useRecentlyChanged(value);

  const handleClick = (star: number) => {
    if (!onChange) return;
    onChange(value === star ? 0 : (star as Rating));
  };

  return (
    <div className="flex items-center">
      {label && <span className="mr-2 text-meta text-ink-muted shrink-0">{label}</span>}
      <div className={clsx('flex items-center', SIZE_CLASS[size])} role={readOnly ? 'img' : 'group'}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onClick={() => handleClick(star)}
            className={clsx(
              'leading-none transition-transform',
              !readOnly && 'active:scale-110',
              readOnly && 'cursor-default',
              popped && star === value && 'm-pop-soft',
              // 未选中的星用浅灰，选中的用琥珀色
              star <= value ? 'text-star' : 'text-edge-strong',
            )}
            aria-label={`${star} 星`}
          >
            <Icon name="star" size={STAR_PX[size]} filled={star <= value} />
          </button>
        ))}
      </div>
      {!readOnly && value > 0 && (
        <span className="ml-2 text-meta text-ink-faint tabular-nums">{value}/5</span>
      )}
    </div>
  );
}
