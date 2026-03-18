import { app, shell, BrowserWindow, ipcMain, Tray, Menu, globalShortcut } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'

// 初始化自更新器，禁用自动下载（由用户主导）
autoUpdater.autoDownload = false
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let currentHotkey: string = ''
let ballAlwaysOnTop = true
let windowAlwaysOnTop = false

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
    // 否则展开为窗口界面
    mainWindow.webContents.send('navigate', '/')
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
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Watcher',
      click: () => {
        mainWindow?.webContents.send('navigate', '/')
        mainWindow?.setSkipTaskbar(false)
        mainWindow?.setResizable(true)
        mainWindow?.setContentSize(400, 600)
        mainWindow?.setResizable(false)
        applyAlwaysOnTop(400, 600)
        mainWindow?.show()
      }
    },
    {
      label: 'Open Ball',
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

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.electron')
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
