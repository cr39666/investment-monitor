import { app, shell, BrowserWindow, ipcMain, Tray, Menu } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // 创建浏览器窗口。
  mainWindow = new BrowserWindow({
    width: 60,
    height: 60,
    center: false,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false, // 初始为球，不让拖拽大小
    skipTaskbar: true, // 不在任务栏显示
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 基于 electron-vite cli 的渲染器 HMR。
  // 在开发环境加载远程 URL，在生产环境加载本地 html 文件。
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 创建托盘
function createTray(): void {
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open Home', 
      click: () => {
        mainWindow?.webContents.send('navigate', '/home')
        mainWindow?.setSkipTaskbar(false)
      } 
    },
    { 
      label: 'Open Ball', 
      click: () => {
        mainWindow?.webContents.send('navigate', '/')
        mainWindow?.setContentSize(80, 80)
        mainWindow?.setSkipTaskbar(true)
      } 
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  
  tray.setToolTip('Stock Watcher')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
      }
    }
  })
}

// 这个方法会在 Electron 完成初始化
// 并且准备好创建浏览器窗口时被调用。
// 部分 API 只能在此事件发生后才能使用。
app.whenReady().then(() => {
  // 设置 Windows 应用的用户模型 ID
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.electron')
  }

  createTray()
  createWindow()

  // 开发环境下的一些窗口快捷键（可自行实现或留空）
  app.on('browser-window-created', (_, window) => {
    // 简单检查是否打包
    if (!app.isPackaged) {
      window.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
          window.webContents.toggleDevTools()
          event.preventDefault()
        }
      })
    }
  })

  // IPC 测试
  ipcMain.on('ping', () => console.log('pong'))

let ballAlwaysOnTop = true
let windowAlwaysOnTop = false

function applyAlwaysOnTop(w: number, h: number): void {
  if (mainWindow) {
    // 如果尺寸较小（悬浮球状态）
    if (w <= 100 && h <= 100) {
      mainWindow.setAlwaysOnTop(ballAlwaysOnTop)
    } else {
      mainWindow.setAlwaysOnTop(windowAlwaysOnTop)
    }
  }
}

  ipcMain.on('resize-window', (event, width: number, height: number) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (browserWindow) {
      const w = Math.ceil(width)
      const h = Math.ceil(height)

      // 如果尺寸较大（非悬浮球状态），在任务栏显示，方便切换和关闭
      if (w > 100 || h > 100) {
        browserWindow.setSkipTaskbar(false)
      } else {
        browserWindow.setSkipTaskbar(true)
      }

      applyAlwaysOnTop(w, h)

      // 在 Windows 上，对不可调整大小的窗口调用 setSize 可能会失效
      // 临时启用 resizable 以确保 setContentSize 成功生效
      browserWindow.setResizable(true)
      browserWindow.setContentSize(w, h, false) // 禁用动画，防止产生透明“残影”
      browserWindow.setResizable(false)
    }
  })

  ipcMain.on('set-always-on-top-config', (_event, config: { ball: boolean; window: boolean }) => {
    ballAlwaysOnTop = config.ball
    windowAlwaysOnTop = config.window
    
    if (mainWindow) {
      const [w, h] = mainWindow.getContentSize()
      applyAlwaysOnTop(w, h)
    }
  })

  ipcMain.on('window-move', (event, { screenX, screenY, offsetX, offsetY }) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (browserWindow) {
      // 通过绝对屏幕坐标减去初始点击位移，实现像素级稳定的拖拽
      browserWindow.setPosition(Math.round(screenX - offsetX), Math.round(screenY - offsetY))
    }
  })

  app.on('activate', function () {
    // 在 macOS 上，通常在点击停靠栏图标且没有其他窗口打开时，
    // 在应用内重新创建一个窗口。
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 当所有窗口被关闭时退出应用。除了在 macOS 上，
// 应用程序和它们的菜单栏通常会保持激活状态，
// 直到用户使用 Cmd + Q 明确退出。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 在这个文件中，你可以包含应用程序其余的主进程特定代码。
// 你也可以将它们放在单独的文件中，并在这里引入。
