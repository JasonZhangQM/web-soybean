import type { CustomRoute, ElegantConstRoute, ElegantRoute } from '@elegant-router/types';
import { generatedRoutes } from '../elegant/routes';
import { layouts, views } from '../elegant/imports';
import { transformElegantRoutesToVueRoutes } from '../elegant/transform';

/**
 * custom routes
 *
 * @link https://github.com/soybeanjs/elegant-router?tab=readme-ov-file#custom-route
 */
const customRoutes: CustomRoute[] = [];

/** irs 多级菜单分组配置：父路由名 → 图标 → 包含的子路由名列表 */
const irsGroupConfig = [
  { name: 'irs_discount', icon: 'mdi:chart-scatter-plot', children: ['irs_monitor-discounts', 'irs_symbol-discounts'] },
  { name: 'irs_option', icon: 'mdi:chart-bell-curve', children: ['irs_monitor-options', 'irs_symbol-options', 'irs_monitor-option-ts'] },
  { name: 'irs_value', icon: 'mdi:chart-areaspline', children: ['irs_value-monitor', 'irs_symbol-kpis', 'irs_symbol-values'] }
] as const;

/**
 * 重组 irs 模块子路由为多级菜单结构
 * elegant-router 按 views 目录生成平铺路由，此处运行时重组为 3 个嵌套分组（贴水/期权/估值）
 */
function restructureIrsRoutes(routes: ElegantRoute[]): ElegantRoute[] {
  return routes.map(route => {
    if (route.name !== 'irs' || !route.children?.length) return route;

    const allChildren = route.children;
    const newChildren = irsGroupConfig.map((group, index) => {
      // 从平铺子路由中筛选出属于当前分组的路由
      const childNames = group.children as readonly string[];
      const groupChildren = allChildren.filter(child => childNames.includes(child.name));
      return {
        name: group.name,
        path: `/irs/${group.name.replace('irs_', '')}`,
        meta: {
          title: group.name,
          i18nKey: `route.${group.name}`,
          icon: group.icon,
          order: index + 1,
          constant: true
        },
        children: groupChildren
      } as unknown as ElegantRoute;
    });

    return { ...route, children: newChildren } as unknown as ElegantRoute;
  });
}

/** create routes when the auth route mode is static */
export function createStaticRoutes() {
  const constantRoutes: ElegantRoute[] = [];

  const authRoutes: ElegantRoute[] = [];

  // 运行时重组 irs 子路由为多级菜单，再合并自定义路由
  const processedRoutes = restructureIrsRoutes([...generatedRoutes] as ElegantRoute[]);

  ([...customRoutes, ...processedRoutes] as ElegantRoute[]).forEach(item => {
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
