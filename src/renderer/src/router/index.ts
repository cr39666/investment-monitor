import { createRouter, createWebHashHistory, type RouteLocationNormalized } from 'vue-router'
import FloatingBall from '../views/FloatingBall.vue'
import MainList from '../views/MainList.vue'
import GoldView from '../views/GoldView.vue'
import FundView from '../views/FundView.vue'
import About from '../views/About.vue'
import Setting from '../views/Setting.vue'

// 记录上一个"主视图"路径（stock 或 gold 或 fund），供设置页/悬浮球返回时使用
const MAIN_VIEW_KEY = 'last_main_view'
const MAIN_VIEWS = ['/', '/gold', '/fund']

function recordLastMainView(to: RouteLocationNormalized) {
  if (MAIN_VIEWS.includes(to.path)) {
    localStorage.setItem(MAIN_VIEW_KEY, to.path)
  }
}

function getLastMainView(): string {
  return localStorage.getItem(MAIN_VIEW_KEY) || '/'
}

export { getLastMainView }

const routes = [
  {
    path: '/ball',
    name: 'FloatingBall',
    component: FloatingBall
  },
  {
    path: '/',
    name: 'MainList',
    component: MainList
  },
  {
    path: '/gold',
    name: 'GoldView',
    component: GoldView
  },
  {
    path: '/fund',
    name: 'FundView',
    component: FundView
  },
  {
    path: '/setting',
    name: 'Setting',
    component: Setting
  },
  {
    path: '/about',
    name: 'About',
    component: About
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.afterEach((to) => {
  recordLastMainView(to)
})

export default router
