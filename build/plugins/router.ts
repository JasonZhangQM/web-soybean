import type { RouteMeta } from 'vue-router';
import ElegantVueRouter from '@elegant-router/vue/vite';
import type { RouteKey } from '@elegant-router/types';

export function setupElegantRouter() {
  return ElegantVueRouter({
    layouts: {
      base: 'src/layouts/base-layout/index.vue',
      blank: 'src/layouts/blank-layout/index.vue'
    },
    // 注册 irs 多级菜单的父路由名，elegant-router 会自动生成对应的 RouteMap 类型和 routeMap 条目
    // irs_option → /irs/option, irs_value → /irs/value
    customRoutes: {
      map: {
        root: '/',
        'not-found': '/:pathMatch(.*)*'
      },
      names: ['irs_option', 'irs_value']
    },
    routePathTransformer(routeName, routePath) {
      const key = routeName as RouteKey;

      if (key === 'login') {
        const modules: UnionKey.LoginModule[] = ['pwd-login', 'code-login', 'register', 'reset-pwd', 'bind-wechat'];

        const moduleReg = modules.join('|');

        return `/login/:module(${moduleReg})?`;
      }

      return routePath;
    },
    onRouteMetaGen(routeName) {
      const key = routeName as RouteKey;

      const meta: Partial<RouteMeta> = {
        title: key,
        i18nKey: `route.${key}` as App.I18n.I18nKey
      };

      // 本项目不使用鉴权，所有路由均设为 constant 绕过登录守卫
      meta.constant = true;

      return meta;
    }
  });
}
