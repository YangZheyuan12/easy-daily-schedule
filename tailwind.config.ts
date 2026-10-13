import type { Config } from 'tailwindcss';

/**
 * Tailwind 配置。
 *
 * ⚠️ 重要约定：这里的**每一个颜色都指向 CSS 变量**，不要写死十六进制。
 * 三套主题（paper / plain / nocturne）通过在 `<html>` 上切 `data-theme`
 * 换掉整组变量；组件里用的类名（`bg-surface`、`text-ink-faint` …）
 * 一个字都不用改。变量定义在 `src/styles/index.css`。
 *
 * 变量采用 `R G B` 三元组写法（而非 hex），这样 Tailwind 的透明度修饰符
 * （如 `bg-surface/95`）才能正常工作。
 */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** 页面底色（最底层） */
        app: v('--c-app'),
        /** 卡片 / 面板面 */
        surface: {
          DEFAULT: v('--c-surface'),
          /** 下沉填充：进度槽、段控底、次级按钮 */
          sunken: v('--c-sunken'),
          /** 1px 分隔线 */
          line: v('--c-line'),
        },
        /** 描边：勾选框空态、空心星 */
        edge: {
          DEFAULT: v('--c-line'),
          strong: v('--c-edge-strong'),
        },
        /** 文字四级（ink 为历史命名，保留以兼容既有组件） */
        ink: {
          DEFAULT: v('--c-ink'),
          soft: v('--c-ink-soft'),
          muted: v('--c-ink-muted'),
          faint: v('--c-ink-faint'),
        },
        /** 主题重音：主按钮、激活态、已完成勾选 */
        accent: {
          DEFAULT: v('--c-accent'),
          /** 重音的浅底版本：选中行、淡按钮 */
          soft: v('--c-accent-soft'),
          /** 落在重音色之上的文字 */
          fg: v('--c-accent-fg'),
        },
        /** 状态色：心情（心）/ 体力与评分（星） */
        heart: v('--c-heart'),
        star: v('--c-star'),
        /** 四大板块身份色 —— 跨主题的锚点，只随明暗环境微调明度 */
        work: v('--c-work'),
        study: v('--c-study'),
        fitness: v('--c-fitness'),
        life: v('--c-life'),
      },
      borderRadius: {
        /** 小控件：色点、勾选框 */
        xs: 'var(--r-xs)',
        /** 次级控件：按钮、输入框、标签 */
        sm: 'var(--r-sm)',
        /** 卡片 */
        card: 'var(--r-card)',
        /** 抽屉 */
        sheet: 'var(--r-sheet)',
        /** 胶囊：底部 Tab、段控 */
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        /** B 主题专用：重音发光；其余主题为 none */
        glow: 'var(--shadow-glow, none)',
      },
      /**
       * 字号刻度 —— 值全部指向 CSS 变量（见 styles/index.css 的「字号刻度」）。
       *
       * ⚠️ 组件里不要写 `text-[15px]`，用这里的语义类名。
       * 整站放大 / 缩小只改 index.css 那一张表即可。
       */
      fontSize: {
        /** 极小计数徽标（子项 2/3、折叠 N） */
        micro: 'var(--fs-micro)',
        /** 辅助文案、计数、字段标签、底部 Tab 标签 */
        caption: 'var(--fs-caption)',
        /** 次级按钮、chip、时间轴时间列、节标题 */
        meta: 'var(--fs-meta)',
        /** 正文：输入框、条目 */
        body: 'var(--fs-body)',
        /** 顶层条目、主按钮、任务行 */
        lead: 'var(--fs-lead)',
        /** 板块组头、月份、抽屉标题 */
        heading: 'var(--fs-heading)',
        /** 页面主标题、日期 */
        title: 'var(--fs-title)',
        /** 大数字 */
        display: 'var(--fs-display)',
      },
      lineHeight: {
        /** 正文行距 —— 三主题的「信息密度」差异就体现在这里 */
        body: 'var(--leading-body)',
      },
      minHeight: {
        tap: '44px',
      },
      minWidth: {
        tap: '44px',
      },
      /*
        曾经有 `spacing.safe`（`pb-safe` → `env(safe-area-inset-bottom)`），已移除：
        它和组件自己的留白是**互斥**的，非刘海屏下会把留白清零。
        安全区一律写成显式 calc 叠加，如
        `pb-[calc(16px+env(safe-area-inset-bottom))]`。
      */
    },
  },
  plugins: [],
} satisfies Config;
