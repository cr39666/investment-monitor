import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  globalShortcut,
  Notification,
  screen
} from 'electron'
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
// 展开前保存悬浮球位置，切回时恢复
let ballPosition: { x: number; y: number } | null = null
// 自动更新周期检查定时器（窗口关闭时清理，避免 macOS 重建窗口时累积）
let updateCheckTimer: ReturnType<typeof setInterval> | null = null

// 托盘菜单多语言文本
const trayTexts: Record<string, { openMonitor: string; openBall: string; quit: string; tooltip: string }> = {
  default: {
    openMonitor: 'Open Monitor',
    openBall: 'Open Ball',
    quit: 'Quit',
    tooltip: 'AssetPulse'
  },
  en: { openMonitor: 'Open Monitor', openBall: 'Open Ball', quit: 'Quit ', tooltip: 'AssetPulse' },
  zh: { openMonitor: '打开面板', openBall: '打开悬浮球', quit: '退出程序', tooltip: 'AssetPulse' }
}

// 悬浮球右键菜单多语言文本
const ballMenuTexts: Record<
  string,
  {
    hideBall: string
    displayLabel: string
    modeStock: string
    modeGold: string
    modeNone: string
  }
> = {
  default: {
    hideBall: 'Hide Ball',
    displayLabel: 'Display',
    modeStock: 'Stock PnL',
    modeGold: 'Gold Price',
    modeNone: 'Off'
  },
  en: {
    hideBall: 'Hide Ball',
    displayLabel: 'Display',
    modeStock: 'Stock PnL',
    modeGold: 'Gold Price',
    modeNone: 'Off'
  },
  zh: {
    hideBall: '隐藏悬浮球',
    displayLabel: '显示金额',
    modeStock: '股票盈亏',
    modeGold: '实时金价',
    modeNone: '不显示'
  }
}

/**
 * 智能调整窗口展开位置，防止溢出屏幕。
 * 根据当前窗口位置和目标尺寸，选择最佳展开方向：
 * - 默认向右下展开（锚点=左上角）
 * - 如果右侧空间不足，则向左展开
 * - 如果下方空间不足，则向上展开
 *
 * 使用 getBounds() 获取窗口外框尺寸（含 DWM 阴影边框），
 * 避免 transparent 窗口的隐形边框导致计算偏差。
 */
function adjustWindowPosition(win: BrowserWindow, targetW: number, targetH: number): void {
  const bounds = win.getBounds()
  const { x, y, width: boundsW, height: boundsH } = bounds

  // 如果当前是悬浮球尺寸，保存位置以便切回时恢复
  const [curContentW, curContentH] = win.getContentSize()
  if (curContentW <= 100 && curContentH <= 100) {
    ballPosition = { x, y }
  }

  // 计算外框与内容区的差值（标题栏、边框等），展开后仍会保持
  const frameDeltaW = boundsW - curContentW
  const frameDeltaH = boundsH - curContentH
  const expandedW = targetW + frameDeltaW
  const expandedH = targetH + frameDeltaH

  const display = screen.getDisplayNearestPoint({ x, y })
  const { x: sx, y: sy, width: sw, height: sh } = display.workArea

  let newX = x
  let newY = y

  // 水平方向：如果向右展开会超出屏幕右边界，则将窗口右边缘对齐到当前窗口右边缘（向左展开）
  if (x + expandedW > sx + sw) {
    newX = x + boundsW - expandedW
  }
  // 确保不超出左边界
  if (newX < sx) {
    newX = sx
  }

  // 垂直方向：如果向下展开会超出屏幕下边界，则将窗口下边缘对齐到当前窗口下边缘（向上展开）
  if (y + expandedH > sy + sh) {
    newY = y + boundsH - expandedH
  }
  // 确保不超出上边界
  if (newY < sy) {
    newY = sy
  }

  win.setPosition(newX, newY)
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
    // 恢复展开前保存的悬浮球位置
    if (ballPosition) {
      mainWindow.setPosition(ballPosition.x, ballPosition.y)
      ballPosition = null
    }
    applyAlwaysOnTop(80, 80)
  } else {
    // 悬浮球 → 展开为窗口界面
    // 只做路由切换，位置和大小由渲染进程 mounted 后的 resize-window 统一处理
    // 与鼠标点击展开走完全相同的路径
    mainWindow.webContents.send('navigate-back')
    mainWindow.show()
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

    // 启动后延迟自动检查更新并启动周期性检查
    if (app.isPackaged) {
      const initTimer = setTimeout(() => {
        // 初始检查
        autoUpdater.checkForUpdates()
        // 之后每 2 小时静默检查一次新版本 (1000 * 60 * 60 * 2)
        updateCheckTimer = setInterval(() => {
          autoUpdater.checkForUpdates()
        }, 7200000)
      }, 2000)
      // 将首次延迟 timer 也挂在 mainWindow 上，window 关闭前如果还没触发，
      // 一并清理；避免后续 createWindow 重建时旧 timer 仍在跑
      mainWindow?.once('closed', () => {
        clearTimeout(initTimer)
        if (updateCheckTimer) {
          clearInterval(updateCheckTimer)
          updateCheckTimer = null
        }
      })
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
        if (!mainWindow) return
        mainWindow.webContents.send('navigate-back')
        mainWindow.show()
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
        // 恢复展开前保存的悬浮球位置
        if (ballPosition && mainWindow) {
          mainWindow.setPosition(ballPosition.x, ballPosition.y)
          ballPosition = null
        }
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
        // 更新安装位置
        execSync(`reg add "${regKey}" /v InstallLocation /t REG_SZ /d "${currentDir}\\" /f`, {
          encoding: 'utf-8'
        })
        // 同时更新卸载程序路径，有助于安装程序 UI 在更新时识别当前实际路径
        const uninstallerName = 'Uninstall AssetPulse.exe'
        const uninstallerPath = join(currentDir, uninstallerName)
        execSync(`reg add "${regKey}" /v UninstallString /t REG_SZ /d "\\"${uninstallerPath}\\"" /f`, {
          encoding: 'utf-8'
        })
        execSync(`reg add "${regKey}" /v DisplayIcon /t REG_SZ /d "${exePath},0" /f`, {
          encoding: 'utf-8'
        })
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
    app.setAppUserModelId('com.electron.app')
    // 确保更新安装到当前 exe 所在目录，而非注册表中可能过时的旧路径
    ;(autoUpdater as unknown as { installDirectory: string }).installDirectory = dirname(app.getPath('exe'))
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

      // 从悬浮球展开为主界面时，智能调整展开方向
      const [curW, curH] = browserWindow.getContentSize()
      if (curW <= 100 && curH <= 100 && (w > 100 || h > 100)) {
        adjustWindowPosition(browserWindow, w, h)
      }

      // 从主界面切回悬浮球时需要恢复位置
      const isBackToBall = (curW > 100 || curH > 100) && w <= 100 && h <= 100

      if (w > 100 || h > 100) {
        browserWindow.setSkipTaskbar(false)
      } else {
        browserWindow.setSkipTaskbar(true)
      }

      applyAlwaysOnTop(w, h)

      browserWindow.setResizable(true)
      browserWindow.setContentSize(w, h, false)
      browserWindow.setResizable(false)

      // 恢复位置必须在 setContentSize 之后，确保外框/阴影尺寸与保存时一致
      if (isBackToBall && ballPosition) {
        browserWindow.setPosition(ballPosition.x, ballPosition.y)
        ballPosition = null
      }
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

  ipcMain.on('set-auto-launch', (_event, enabled: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.platform === 'win32' ? app.getPath('exe') : undefined
    })
  })

  ipcMain.handle('get-auto-launch', () => {
    const settings = app.getLoginItemSettings()
    return settings.openAtLogin
  })

  ipcMain.on('show-ball-context-menu', (event, currentMode: string = 'stock') => {
    const texts = ballMenuTexts[currentLang] || ballMenuTexts['default']
    const menu = Menu.buildFromTemplate([
      {
        label: texts.displayLabel,
        submenu: [
          {
            label: texts.modeStock,
            type: 'radio',
            checked: currentMode === 'stock',
            click: () => {
              mainWindow?.webContents.send('set-ball-display-mode', 'stock')
            }
          },
          {
            label: texts.modeGold,
            type: 'radio',
            checked: currentMode === 'gold',
            click: () => {
              mainWindow?.webContents.send('set-ball-display-mode', 'gold')
            }
          },
          {
            label: texts.modeNone,
            type: 'radio',
            checked: currentMode === 'none',
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
      menu.popup({
        window: browserWindow,
        callback: () => {
          browserWindow.webContents.send('ball-context-menu-closed')
        }
      })
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
