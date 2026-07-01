import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router';
import type { RouteKey, RoutePath } from '@elegant-router/types';
import { useRouteStore } from '@/store/modules/route';

/**
 * create route guard
 *
 * 本项目不使用鉴权（FastAPI 未迁移 Django 鉴权功能），
 * 所有路由直接放行，仅保留 constant route 初始化逻辑。
 *
 * @param router router instance
 */
export function createRouteGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    // 初始化 constant route（首次访问时执行一次）
    const location = await initRoute(to);
    if (location) {
      return location;
    }

    // 本项目无鉴权，直接处理路由切换
    return handleRouteSwitch(to, from);
  });
}

/**
 * initialize route
 *
 * 仅负责 constant route 的首次初始化，不检查登录状态。
 *
 * @param to to route
 */
async function initRoute(to: RouteLocationNormalized): Promise<RouteLocationRaw | null> {
  const routeStore = useRouteStore();

  const notFoundRoute: RouteKey = 'not-found';
  const isNotFoundRoute = to.name === notFoundRoute;

  // constant route 未初始化时先初始化，完成后重定向到原始路径
  if (!routeStore.isInitConstantRoute) {
    await routeStore.initConstantRoute();

    const location: RouteLocationRaw = {
      path: to.fullPath,
      replace: true,
      query: to.query,
      hash: to.hash
    };

    return location;
  }

  // 已初始化，直接放行
  routeStore.onRouteSwitchWhenNotLoggedIn();

  // not-found 路由特殊处理：检查路由是否存在
  if (isNotFoundRoute) {
    const exist = await routeStore.getIsAuthRouteExist(to.path as RoutePath);
    const noPermissionRoute: RouteKey = '403';

    if (exist) {
      return { name: noPermissionRoute };
    }
  }

  return null;
}

function handleRouteSwitch(to: RouteLocationNormalized, from: RouteLocationNormalized) {
  // route with href
  if (to.meta.href) {
    window.open(to.meta.href, '_blank');

    return { path: from.fullPath, replace: true, query: from.query, hash: to.hash };
  }
}
