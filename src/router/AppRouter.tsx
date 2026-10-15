import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { TodayPage } from '@/pages/TodayPage';
import { SectionPage } from '@/pages/SectionPage';
import { SectionWeekPage } from '@/pages/SectionWeekPage';
import { TasksPage } from '@/pages/TasksPage';
import { TaskKindPage } from '@/pages/TaskKindPage';
import { TimelinePage } from '@/pages/TimelinePage';
import { CalendarPage } from '@/pages/CalendarPage';
import { MePage } from '@/pages/MePage';

/**
 * 路由。
 *
 * 用 HashRouter 而不是 BrowserRouter：静态托管（手机直接访问、P1 的 PWA、
 * 各类对象存储）下 BrowserRouter 刷新会 404，HashRouter 不会。
 */
export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/section/:sectionId" element={<SectionPage />} />
          <Route path="/week-section/:sectionId" element={<SectionWeekPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/deadline" element={<TaskKindPage kind="deadline" />} />
          <Route path="/tasks/goal" element={<TaskKindPage kind="goal" />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
