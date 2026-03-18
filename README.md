# 📈 Stock Watcher

一款基于 **Electron + Vue 3 + TypeScript** 的 A 股桌面盯盘工具，支持悬浮球模式，可常驻桌面实时监控自选股行情与持仓盈亏。

> Designed by **Croyell** 🌙

---

## ✨ 功能特性

### 🫧 悬浮球模式

- 启动后默认以 **80×80** 透明悬浮球形式常驻桌面顶层
- 支持鼠标 **拖拽移动**，不占用任务栏
- 单击悬浮球展开至详情页，可随时在悬浮球 ⇄ 详情页间切换

### 📊 实时行情

- 接入 **腾讯财经行情接口**，支持 A 股（上海 / 深圳 / 北交所）全市场
- 行情数据 **每秒自动刷新**，包含最新价、昨收价、涨跌额、涨跌幅
- 输入 **6 位纯数字代码** 即可自动识别并补齐市场前缀（`sh` / `sz` / `bj`）

### 💼 持仓管理

- **添加自选**：输入股票代码，通过弹窗设置初始成本价和持仓手数
- **调仓操作**：支持加仓 / 减仓，加仓时自动计算 **加权平均成本**
- **删除 / 清空**：右键删除单只股票，一键清空全部自选
- 数据基于 **localStorage** 本地持久化存储

### 📋 详情展示

- 表格展示核心数据列：名称、现价、当日盈亏 (D.PnL)、持仓总盈亏 (T.PnL)、均摊成本、涨跌幅、持仓手数
- 涨跌以 **红涨蓝跌** 配色直观显示
- **名称显示模式** 三档切换：仅名称 → 仅代码 → 名称 + 代码
- **多列排序**：支持按现价、当日盈亏、持仓盈亏、涨跌幅排序（升序 / 降序 / 默认）
- 默认按 **拼音首字母** 排序
- 底部汇总展示 **每日总盈亏** 和 **持仓总盈亏**

### 🔒 隐私模式

- 一键切换 **隐私遮盖**，所有敏感数据（名称、价格、盈亏、成本、手数）以 `❇❇` 替代显示
- 适用于办公场景，防止敏感信息被旁人看到

### 🖱️ 交互细节

- 点击价格列 **一键复制** 到剪贴板
- 点击行高亮选中，再次点击取消
- 操作反馈通过 **Toast 提示**（成功 / 信息 / 警告 / 失败）
- 弹窗确认删除 / 清空等危险操作，防止误操作

### 🪟 无边框窗口

- 完全 **无边框透明** 窗口，圆角暗色主题，视觉沉浸
- 自定义 **iOS 风格拖拽条**，支持 IPC 手动拖拽，稳定可靠
- 窗口大小随内容 **自适应调整**（基于 ResizeObserver）
- **置顶显示**，不遮挡其他窗口的交互

---

## 🛠️ 技术栈

| 分类     | 技术                                                                        |
| -------- | --------------------------------------------------------------------------- |
| 框架     | [Electron](https://www.electronjs.org/) 39 + [Vue 3](https://vuejs.org/)    |
| 语言     | [TypeScript](https://www.typescriptlang.org/)                               |
| 构建     | [electron-vite](https://electron-vite.org/) + [Vite](https://vitejs.dev/) 7 |
| 路由     | [Vue Router](https://router.vuejs.org/) 4                                   |
| 打包     | [electron-builder](https://www.electron.build/)                             |
| 代码规范 | ESLint + Prettier                                                           |

---

## 📁 项目结构

```
stock-watcher/
├── src/
│   ├── main/               # Electron 主进程
│   │   └── index.ts        # 窗口创建、IPC 事件处理
│   ├── preload/             # 预加载脚本
│   └── renderer/            # 渲染进程 (Vue 应用)
│       └── src/
│           ├── views/
│           │   ├── FloatingBall.vue   # 悬浮球视图
│           │   ├── Home.vue           # 主页视图
│           │   └── Detail.vue         # 股票详情/盯盘视图
│           ├── components/
│           │   ├── DragHandle.vue     # 自定义拖拽条
│           │   ├── Modal.vue          # 模态弹窗
│           │   ├── Confirm.vue        # 确认对话框
│           │   ├── Toast.vue          # 消息提示
│           │   └── Versions.vue       # 版本信息
│           ├── router/               # 路由配置
│           └── assets/               # 静态资源
├── electron-builder.yml     # 打包配置
├── electron.vite.config.ts  # electron-vite 配置
└── package.json
```

---

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发调试

```bash
npm run dev
```

> 启动后将自动打开 Electron 窗口，支持 HMR 热更新。按 `F12` 可打开 DevTools。

### 生产构建

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

---

## 📌 使用说明

1. 启动应用后，桌面右侧出现一个旋转的 **悬浮球**
2. **单击** 悬浮球进入股票详情页
3. 在底部输入框中输入 **6 位股票代码**（如 `600519`），按回车或点击 ➕ 添加
4. 弹窗中设置成本价和持仓手数，确认后即可看到实时行情
5. 点击 **Qty（手数）列** 可进行调仓操作
6. **右键** 某只股票可删除
7. 点击底部的 🔓 / 🔒 切换隐私模式
8. 点击悬浮球 LOGO 可缩回悬浮球模式

---

## 📜 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

---

## 📄 License

MIT
