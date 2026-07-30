import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow = null
let httpServer = null

const dataDir = path.join(app.getPath('userData'), 'ArtShadow')
const materialsDir = path.join(dataDir, 'materials')
const dbPath = path.join(dataDir, 'data.json')

function ensureDirs() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(materialsDir)) fs.mkdirSync(materialsDir, { recursive: true })
}

// HTTP server for material files
function startFileServer() {
  const mime = { '.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mkv':'video/x-matroska','.avi':'video/x-msvideo','.jpg':'image/jpeg','.png':'image/png','.gif':'image/gif' }
  try {
    httpServer = http.createServer((req, res) => {
      const filePath = path.join(materialsDir, decodeURIComponent(req.url.slice(1)))
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end(); return }
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' })
      fs.createReadStream(filePath).pipe(res)
    })
    httpServer.listen(58099, '127.0.0.1')
    console.log('Material server on port 58099')
  } catch(e) { console.log('Server port busy, trying alternatives...') }
}

function loadData() {
  try { if (fs.existsSync(dbPath)) return JSON.parse(fs.readFileSync(dbPath, 'utf-8')) } catch (e) {}
  return { categories: [], materials: [], tags: [] }
}
function saveData(data) { fs.writeFileSync(dbPath, JSON.stringify(data, null, 2)) }

// IPC handlers
ipcMain.handle('data:getAll', () => loadData())
ipcMain.handle('data:save', (_, data) => { saveData(data); return { success: true } })

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
      id, originalName: path.basename(fp), fileName: newName,
      type: ['.mp4','.webm','.mov','.avi','.mkv'].includes(ext) ? 'video' : 'image',
      size: fs.statSync(dest).size, categoryId: null, tags: [], source: '', notes: '',
      importedAt: new Date().toISOString()
    }
  })
})

ipcMain.handle('materials:getPath', (_, fileName) => {
  // Try file:// first (needs webSecurity:false), fall back to HTTP
  const filePath = `file:///${path.join(materialsDir, fileName).replace(/\\/g, '/')}`
  return filePath
})

app.whenReady().then(() => {
  ensureDirs()
  startFileServer()

  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: '画影客', backgroundColor: '#0f1117', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.removeMenu()
})

app.on('window-all-closed', () => {
  if (httpServer) httpServer.close()
  app.quit()
})
