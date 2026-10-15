import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { useExpanded } from '@/hooks/useExpanded';
import clsx from 'clsx';
import type { Task } from '@/domain/types';

interface TaskPreviewCardProps {
  icon: ReactNode;
  title: string;
  /** 列表为空时的说明（点进去分别是各自的编辑页） */
  emptyHint: string;
  /** 管理页路由（点标题 / 「管理」都去这里） */
  to: string;
  tasks: Task[];
  /** 每条右侧的次要信息（期限文案 / 描述）；返回 null 表示不显示 */
  renderMeta?: (task: Task) => string | null;
  /**
   * 展开态的稳定 key（跨页保持用）：切去别的 Tab 再回来，展开/收起不变。
   * 同一个 key 在两张卡之间必须不同（调用方各传一个）。
   */
  expandKey: string;
  /** 测试钩子 */
  testId?: string;
}

/** 预览最多几条：再多就该进管理页看了，卡片不是第二个列表页 */
const PREVIEW_LIMIT = 5;

/**
 * 「期限任务 / 长时目标」的**只读预览卡**（任务页底部那两张）。
 *
 * 共同结构：一行标题 + 可展开的预览列表。列表里不能编辑（符合用户要求）——
 * 增删改全部在各自的管理页（/tasks/deadline、/tasks/goal）里进行。
 *
 * 🔴 预览列表**默认收起**：这两张卡在页面最底部，摊开会把每日任务列表
 * 挤得更靠上；而它们的内容（期限、描述）在管理页里看得更全。
 * 收起时两张卡只剩两行标题，整齐地堆在底部 —— 想看再点展开。
 * 展开态走 `useExpanded(expandKey)`：用户展开后切去别的 Tab 再回来仍是展开的
 * （2026-10-16 用户要求），刷新页面才重置。
 *
 * 整张卡不是一个 button：标题与「管理」是两个并列的按钮（都能进管理页），
 * 展开箭头是第三个。原来的「整卡 role=button」会把这三个动作搅在一起，
 * 键盘用户也没法只展开而不跳页。
 */
export function TaskPreviewCard({
  icon,
  title,
  emptyHint,
  to,
  tasks,
  renderMeta,
  expandKey,
  testId,
}: TaskPreviewCardProps) {
  const navigate = useNavigate();
  const { open, toggle } = useExpanded(expandKey);

  const go = () => navigate(to);

  return (
    <div
      className="bg-surface rounded-card shadow-card overflow-hidden"
      data-testid={testId}
      data-expanded={open}
    >
      <div className="flex w-full items-center px-3.5 min-h-[52px]">
        <button
          type="button"
          onClick={go}
          className="press flex flex-1 min-w-0 items-center gap-2 text-left text-lead text-ink"
        >
          {icon}
          <span className="truncate">{title}</span>
          <span className="text-caption text-ink-faint">{tasks.length}</span>
        </button>

        {/* 展开 / 收起：与跳转动作分开，避免「想展开结果跳了页」 */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'}${title}预览`}
          data-testid={testId ? `${testId}-toggle` : undefined}
          className="press shrink-0 min-w-[38px] min-h-[38px] flex items-center justify-center rounded-pill text-ink-faint"
        >
          <Icon
            name="chevron-down"
            size={16}
            className={clsx(
              'transition-transform duration-[var(--m-dur-2)] ease-[var(--m-ease-out)]',
              open ? 'rotate-180' : 'rotate-0',
            )}
          />
        </button>

        <button
          type="button"
          onClick={go}
          aria-label={`管理${title}`}
          className="press shrink-0 flex items-center gap-1 px-1 min-h-[38px] text-caption text-ink-faint"
        >
          管理
          <Icon name="chevron-right" size={15} />
        </button>
      </div>

      {open && (
        <div className="m-fade px-3.5 pb-3">
          {tasks.length === 0 ? (
            <p className="text-caption text-ink-faint">{emptyHint}</p>
          ) : (
            <ul className="space-y-1.5">
              {tasks.slice(0, PREVIEW_LIMIT).map((task) => {
                const meta = renderMeta?.(task) ?? null;
                return (
                  <li key={task.id} className="flex items-baseline justify-between gap-2">
                    <span
                      className={clsx(
                        'text-body truncate',
                        task.done ? 'text-ink-faint line-through' : 'text-ink',
                      )}
                    >
                      {task.content}
                    </span>
                    {meta && <span className="shrink-0 text-caption text-ink-faint">{meta}</span>}
                  </li>
                );
              })}
              {tasks.length > PREVIEW_LIMIT && (
                <li className="text-caption text-ink-faint">还有 {tasks.length - PREVIEW_LIMIT} 条…</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
