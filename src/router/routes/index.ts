import type { CustomRoute, ElegantConstRoute, ElegantRoute } from '@elegant-router/types';
import { generatedRoutes } from '../elegant/routes';
import { layouts, views } from '../elegant/imports';
import { transformElegantRoutesToVueRoutes } from '../elegant/transform';

/**
 * custom routes
 *
 * @link https://github.com/soybeanjs/elegant-router?tab=readme-ov-file#custom-route
 *
 * 2026-11-15：/irs/simulate 已升级为顶级页 /risk（风险总览），站内零引用。
 * 这里留一条纯重定向兼容旧书签 / 外链，避免落到 404；
 * constant 绕过登录守卫，hideInMenu 避免在菜单里冒出空条目，i18n 里也不必加词条。
 */
const customRoutes: CustomRoute[] = [
  {
    name: 'irs_simulate',
    path: '/irs/simulate',
    redirect: { name: 'risk' },
    meta: {
      title: 'irs_simulate',
      constant: true,
      hideInMenu: true
    }
  }
];

/** create routes when the auth route mode is static */
export function createStaticRoutes() {
  const constantRoutes: ElegantRoute[] = [];

  const authRoutes: ElegantRoute[] = [];

  // irs 子路由已通过 views 目录结构由 elegant-router 自动生成多级菜单，无需运行时重组
  ([...customRoutes, ...generatedRoutes] as ElegantRoute[]).forEach(item => {
    if (item.meta?.constant) {
      constantRoutes.push(item);
    } else {
      authRoutes.push(item);
    }
  });

  return {
    constantRoutes,
    authRoutes
  };
}

/**
 * Get auth vue routes
 *
 * @param routes Elegant routes
 */
export function getAuthVueRoutes(routes: ElegantConstRoute[]) {
  return transformElegantRoutesToVueRoutes(routes, layouts, views);
}
