import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut, Notification } from 'electron'
import { join, dirname } from 'path'
import { execSync } from 'child_process'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'

// 初始化自更新器，禁用自动下载（由用户主导）
autoUpdater.autoDownload = false
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let currentHotkey: string = ''
let ballAlwaysOnTop = true
let windowAlwaysOnTop = false
let currentLang: string = 'default'

// 托盘菜单多语言文本
const trayTexts: Record<string, { openMonitor: string; openBall: string; quit: string; tooltip: string }> = {
  default: { openMonitor: 'Open Monitor', openBall: 'Open Ball', quit: 'Quit', tooltip: 'AssetPulse' },
  en: { openMonitor: 'Open Monitor', openBall: 'Open Ball', quit: 'Quit ', tooltip: 'AssetPulse' },
  zh: { openMonitor: '打开面板', openBall: '打开悬浮球', quit: '退出程序', tooltip: 'AssetPulse' }
}

// 悬浮球右键菜单多语言文本
const ballMenuTexts: Record<string, {
  hideBall: string
  displayLabel: string
  modeStock: string
  modeGold: string
  modeNone: string
}> = {
  default: { hideBall: 'Hide Ball', displayLabel: 'Display', modeStock: 'Stock PnL', modeGold: 'Gold Price', modeNone: 'Off' },
  en: { hideBall: 'Hide Ball', displayLabel: 'Display', modeStock: 'Stock PnL', modeGold: 'Gold Price', modeNone: 'Off' },
  zh: { hideBall: '隐藏悬浮球', displayLabel: '显示金额', modeStock: '股票盈亏', modeGold: '黄金价格', modeNone: '不显示' }
}

function applyAlwaysOnTop(w: number, h: number): void {
  if (mainWindow) {
    if (w <= 100 && h <= 100) {
      mainWindow.setAlwaysOnTop(ballAlwaysOnTop)
    } else {
      mainWindow.setAlwaysOnTop(windowAlwaysOnTop)
    }
  }
}

function toggleMainWindow(): void {
  if (!mainWindow) return

  const [w, h] = mainWindow.getContentSize()
  const isWindowMode = w > 100 || h > 100

  if (isWindowMode && mainWindow.isVisible()) {
    // 如果是窗口界面且可见，则切换回悬浮球
    mainWindow.webContents.send('navigate', '/ball')
    mainWindow.setResizable(true)
    mainWindow.setContentSize(80, 80)
    mainWindow.setResizable(false)
    mainWindow.setSkipTaskbar(true)
    applyAlwaysOnTop(80, 80)
  } else {
    // 否则展开为窗口界面，让渲染进程恢复到上次浏览的主视图
    mainWindow.webContents.send('navigate-back')
    mainWindow.show()
    mainWindow.setSkipTaskbar(false)
    mainWindow.setResizable(true)
    mainWindow.setContentSize(400, 600)
    mainWindow.setResizable(false)
    applyAlwaysOnTop(400, 600)
  }
}

function registerHotkey(hotkey: string): void {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey)
  }

  if (!hotkey) return

  try {
    const success = globalShortcut.register(hotkey.replace('Ctrl', 'CommandOrControl'), () => {
      toggleMainWindow()
    })
    if (success) {
      currentHotkey = hotkey
    }
  } catch (e) {
    console.error('Failed to register hotkey:', e)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    center: false,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()

    // 启动后延迟自动检查更新
    if (app.isPackaged) {
      setTimeout(() => {
        autoUpdater.checkForUpdates()
      }, 3000)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  const texts = trayTexts[currentLang] || trayTexts['default']

  if (!tray) {
    tray = new Tray(icon)
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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: texts.openMonitor,
      click: () => {
        mainWindow?.webContents.send('navigate-back')
        mainWindow?.setSkipTaskbar(false)
        mainWindow?.setResizable(true)
        mainWindow?.setContentSize(400, 600)
        mainWindow?.setResizable(false)
        applyAlwaysOnTop(400, 600)
        mainWindow?.show()
      }
    },
    {
      label: texts.openBall,
      click: () => {
        mainWindow?.webContents.send('navigate', '/ball')
        mainWindow?.setResizable(true)
        mainWindow?.setContentSize(80, 80)
        mainWindow?.setResizable(false)
        mainWindow?.setSkipTaskbar(true)
        applyAlwaysOnTop(80, 80)
        mainWindow?.show()
      }
    },
    { type: 'separator' },
    { label: texts.quit, click: () => app.quit() }
  ])

  tray.setToolTip(texts.tooltip)
  tray.setContextMenu(contextMenu)
}

// 启动时检测安装路径是否被挪动，若已挪动则修正注册表，确保更新安装到当前目录
// NSIS 可能在 HKCU 或 HKLM 中记录 InstallLocation，两处都需要检查
if (app.isPackaged && process.platform === 'win32') {
  const exePath = app.getPath('exe')
  const currentDir = dirname(exePath).replace(/\\$/, '')
  const appId = 'com.electron.app'
  const regSubKey = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${appId}_is1`

  for (const hive of ['HKCU', 'HKLM']) {
    try {
      const regKey = `${hive}\\${regSubKey}`
      const result = execSync(`reg query "${regKey}" /v InstallLocation`, { encoding: 'utf-8' })
      const match = result.match(/REG_SZ\s+(.+)/)
      if (match && match[1].trim().replace(/\\$/, '') !== currentDir) {
        execSync(`reg add "${regKey}" /v InstallLocation /t REG_SZ /d "${currentDir}\\" /f`, { encoding: 'utf-8' })
      }
    } catch {
      // 该注册表项不存在，跳过
    }
  }
}

// 单实例锁（仅打包环境生效，开发环境允许多开便于调试）
const gotTheLock = !app.isPackaged || app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.electron')
    // 确保更新安装到当前 exe 所在目录，而非注册表中可能过时的旧路径
    ;(autoUpdater as any).installDirectory = dirname(app.getPath('exe'))
  }

  createTray()

  app.on('browser-window-created', (_, window) => {
    if (!app.isPackaged) {
      window.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' && input.type === 'keyDown') {
          window.webContents.toggleDevTools()
          event.preventDefault()
        }
      })
    }
  })

  createWindow()

  ipcMain.on('resize-window', (event, width: number, height: number) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (browserWindow) {
      const w = Math.ceil(width)
      const h = Math.ceil(height)

      if (w > 100 || h > 100) {
        browserWindow.setSkipTaskbar(false)
      } else {
        browserWindow.setSkipTaskbar(true)
      }

      applyAlwaysOnTop(w, h)

      browserWindow.setResizable(true)
      browserWindow.setContentSize(w, h, false)
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

  ipcMain.on('set-global-hotkey', (_event, hotkey: string) => {
    registerHotkey(hotkey)
  })

  ipcMain.on('set-language', (_event, lang: string) => {
    currentLang = lang
    createTray()
  })

  ipcMain.on('show-ball-context-menu', (event) => {
    const texts = ballMenuTexts[currentLang] || ballMenuTexts['default']
    const menu = Menu.buildFromTemplate([
      {
        label: texts.displayLabel,
        submenu: [
          {
            label: texts.modeStock,
            type: 'radio',
            checked: true,
            click: () => {
              mainWindow?.webContents.send('set-ball-display-mode', 'stock')
            }
          },
          {
            label: texts.modeGold,
            type: 'radio',
            click: () => {
              mainWindow?.webContents.send('set-ball-display-mode', 'gold')
            }
          },
          {
            label: texts.modeNone,
            type: 'radio',
            click: () => {
              mainWindow?.webContents.send('set-ball-display-mode', 'none')
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: texts.hideBall,
        click: () => {
          mainWindow?.hide()
        }
      }
    ])
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (browserWindow) {
      menu.popup({ window: browserWindow })
    }
  })

  ipcMain.on('window-move', (event, { screenX, screenY, offsetX, offsetY }) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender)
    if (browserWindow) {
      browserWindow.setPosition(Math.round(screenX - offsetX), Math.round(screenY - offsetY))
    }
  })

  // === 自动更新 IPC 处理 ===
  ipcMain.on('check-for-update', () => {
    if (!app.isPackaged) {
      // 本地开发环境无法真正更新
      mainWindow?.webContents.send('update-error', 'Cannot update in development mode')
      return
    }
    autoUpdater.checkForUpdates()
  })

  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.on('quit-and-install', () => {
    autoUpdater.quitAndInstall()
  })

  autoUpdater.on('error', (info) => {
    mainWindow?.webContents.send('update-error', info)
  })
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info)
  })
  autoUpdater.on('update-not-available', (info) => {
    mainWindow?.webContents.send('update-not-available', info)
  })
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('download-progress', progressObj)
  })
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info)
  })

  // 系统通知
  ipcMain.on('show-notification', (_event, data: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: data.title,
        body: data.body
      })
      notification.show()
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
