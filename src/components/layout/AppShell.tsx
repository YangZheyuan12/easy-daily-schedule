import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useDayStore } from '@/store/useDayStore';
import { useItemStore } from '@/store/useItemStore';
import { useTaskStore } from '@/store/useTaskStore';
import { useTimeSlotStore } from '@/store/useTimeSlotStore';
import { useInspirationStore } from '@/store/useInspirationStore';
import { useUiStore } from '@/store/useUiStore';
import { bindLifecycle, onError, persistence, purgeExpiredSoftDeletes, repos } from '@/store/bootstrap';
import { BottomTabBar } from './BottomTabBar';
import { UndoBar } from '@/components/feedback/UndoBar';
import { ToastHost } from '@/components/ui/Toast';
import { useKeyboardAvoid } from '@/hooks/useKeyboardAvoid';

/**
 * 应用外壳：负责数据装载、生命周期绑定与全局浮层。
 *
 * 日期是单一真相源：date 一变，条目与任务就重新加载，
 * 保证三个 store 永远看同一天，不会出现「首页显示 10 号、板块页是 11 号」的错乱。
 */
export function AppShell() {
  const date = useDayStore((s) => s.date);
  const pushToast = useUiStore((s) => s.pushToast);

  useKeyboardAvoid();

  useEffect(() => {
    const unbindLifecycle = bindLifecycle();
    const unbindError = onError((error) => {
      const message = error instanceof Error ? error.message : '存储出错';
      pushToast(message, 'error');
    });
    void purgeExpiredSoftDeletes();

    return () => {
      unbindLifecycle();
      unbindError();
    };
  }, [pushToast]);

  useEffect(() => {
    // 切日期前先把当前编辑内容落盘，避免切换即丢失
    void persistence.flush('lifecycle');
    void useItemStore.getState().loadDate(date);
    void useTaskStore.getState().loadDate(date);
    void useTimeSlotStore.getState().loadDate(date);
    void useInspirationStore.getState().loadDate(date);
    void useDayStore.getState().loadSelfStatus(date);
    void repos.days.ensure(date);
  }, [date]);

  return (
    <div className="min-h-full bg-app">
      <div className="mx-auto max-w-[430px] min-h-screen bg-app">
        {/* 底部留白 = 胶囊 70 + 外边距 16 + 呼吸空间 34，避免内容被悬浮导航压住 */}
        <main className="pb-[120px]">
          <Outlet />
        </main>
        <BottomTabBar />
        <UndoBar />
        <ToastHost />
      </div>
    </div>
  );
}
