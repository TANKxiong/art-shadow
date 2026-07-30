import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow = null

// Store materials in app data folder
const dataDir = path.join(app.getPath('userData'), 'ArtShadow')
const materialsDir = path.join(dataDir, 'materials')
const dbPath = path.join(dataDir, 'data.json')

function ensureDirs() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(materialsDir)) fs.mkdirSync(materialsDir, { recursive: true })
}

function loadData() {
  try {
    if (fs.existsSync(dbPath)) return JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
  } catch (e) {}
  return { categories: [], materials: [], tags: [] }
}

function saveData(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)) }

// IPC: Data operations
ipcMain.handle('data:getAll', () => loadData())
ipcMain.handle('data:save', (_, data) => { saveData(data); return { success: true } })

// IPC: Import files
ipcMain.handle('dialog:openFiles', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '导入素材', filters: [{ name: '媒体文件', extensions: ['mp4','webm','mov','avi','mkv','jpg','jpeg','png','gif','webp','bmp'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (r.canceled) return []
  ensureDirs()
  return r.filePaths.map(fp => {
    const ext = path.extname(fp).toLowerCase()
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const newName = id + ext
    const dest = path.join(materialsDir, newName)
    fs.copyFileSync(fp, dest)
    return {
      id, originalName: path.basename(fp), fileName: newName, filePath: dest,
      type: ['.mp4','.webm','.mov','.avi','.mkv'].includes(ext) ? 'video' : 'image',
      size: fs.statSync(dest).size, categoryId: null, tags: [], source: '', notes: '',
      importedAt: new Date().toISOString()
    }
  })
})

// IPC: Get material file path for playback
ipcMain.handle('materials:getPath', (_, fileName) => path.join(materialsDir, fileName))

app.whenReady().then(() => {
  ensureDirs()
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: '画影客', backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  mainWindow.removeMenu()
})

app.on('window-all-closed', () => app.quit())
