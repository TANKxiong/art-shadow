import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(1400, width),
    height: Math.min(900, height),
    minWidth: 900,
    minHeight: 600,
    title: '参考库 · Reference Vault',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    backgroundColor: '#f4f7fb',
    show: false
  })

  const isDev = !app.isPackaged
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function getUserDataPath() {
  return app.getPath('userData')
}

function getMaterialsDir() {
  const dir = path.join(getUserDataPath(), 'materials')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function loadData() {
  try {
    const dbPath = path.join(getUserDataPath(), 'data.json')
    if (fs.existsSync(dbPath)) {
      return JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
    }
  } catch (e) {
    console.error('Failed to load data:', e)
  }
  return { categories: [], materials: [], tags: [] }
}

function saveData(data) {
  const dbPath = path.join(getUserDataPath(), 'data.json')
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8')
}

// IPC Handlers
ipcMain.handle('data:getAll', () => loadData())
ipcMain.handle('data:save', (event, data) => { saveData(data); return { success: true } })

ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入素材',
    filters: [
      { name: '媒体文件', extensions: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  })

  if (result.canceled) return []

  const materialsDir = getMaterialsDir()
  const imported = []

  for (const filePath of result.filePaths) {
    const fileName = path.basename(filePath)
    const ext = path.extname(fileName).toLowerCase()
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const newName = id + ext
    const destPath = path.join(materialsDir, newName)

    try {
      fs.copyFileSync(filePath, destPath)
      const isVideo = ['.mp4', '.webm', '.mov', '.avi', '.mkv'].includes(ext)
      imported.push({
        id,
        originalName: fileName,
        fileName: newName,
        filePath: destPath,
        type: isVideo ? 'video' : 'image',
        size: fs.statSync(destPath).size,
        categoryId: null,
        tags: [],
        source: '',
        notes: '',
        importedAt: new Date().toISOString()
      })
    } catch (e) {
      console.error('Failed to copy file:', filePath, e)
    }
  }

  return imported
})

ipcMain.handle('materials:getPath', (event, fileName) => {
  return path.join(getMaterialsDir(), fileName)
})

ipcMain.handle('app:getPath', (event, name) => {
  return app.getPath(name)
})

// App Lifecycle
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
