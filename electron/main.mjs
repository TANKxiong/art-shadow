import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import http from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow = null
let httpServer = null

// Try to load FFmpeg, silently fall back if not available
let ffmpegPath = null
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
  // In packaged app, binary must be unpacked outside asar archive
  if (ffmpegPath.includes('app.asar') && !fs.existsSync(ffmpegPath)) {
    const unpacked = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
    if (fs.existsSync(unpacked)) ffmpegPath = unpacked
  }
  if (!fs.existsSync(ffmpegPath)) {
    // Fallback: extraResources copy at resources/ffmpeg
    const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    const candidates = [
      path.join(process.resourcesPath, 'ffmpeg', 'win32-x64', binName),
      path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg', 'bin', process.platform, process.arch, binName),
      path.join(process.resourcesPath, 'ffmpeg', binName)
    ]
    for (const c of candidates) { if (fs.existsSync(c)) { ffmpegPath = c; break } }
    console.log('FFmpeg fallback candidates:', candidates, '=>', ffmpegPath)
  }
} catch(e) { console.error('FFmpeg load failed:', e) }

const dataDir = path.join(app.getPath('userData'), 'ArtShadow')
let materialsDir = path.join(dataDir, 'materials')
// Load custom materials path from config
const configPath = path.join(dataDir, 'config.json')
try { if (fs.existsSync(configPath)) { const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')); if (cfg.materialsDir) materialsDir = cfg.materialsDir } } catch(e) {}

const dbPath = path.join(dataDir, 'data.json')

function ensureDirs() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  if (!fs.existsSync(materialsDir)) fs.mkdirSync(materialsDir, { recursive: true })
}

// Transcode video to H.264 MP4 for compatibility
function transcode(inputPath, outputPath) {
  if (!ffmpegPath) return Promise.reject(new Error('FFmpeg not available'))
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-y', '-i', inputPath,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      outputPath
    ], { timeout: 120000 }, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
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
    title: '导入素材', filters: [{ name: '媒体文件', extensions: ['mp4','webm','mov','avi','mkv','wmv','flv','m4v','jpg','jpeg','png','gif','webp','bmp'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (r.canceled) return []
  ensureDirs()
  const results = []
  for (const fp of r.filePaths) {
    const ext = path.extname(fp).toLowerCase()
    const isVideo = ['.mp4','.webm','.mov','.avi','.mkv','.wmv','.flv','.m4v'].includes(ext)
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    let destPath = fp
    let newName = path.basename(fp)
    // For videos, try to ensure playability with FFmpeg
    if (isVideo && ffmpegPath) {
      const dest = path.join(materialsDir, id + '.mp4')
      try {
        await transcode(fp, dest)
        destPath = dest
        newName = id + '.mp4'
      } catch(e) {
        // Transcode failed, copy original
        const dest2 = path.join(materialsDir, id + ext)
        fs.copyFileSync(fp, dest2)
        destPath = dest2
        newName = id + ext
      }
    } else {
      const dest = path.join(materialsDir, id + ext)
      fs.copyFileSync(fp, dest)
      destPath = dest
      newName = id + ext
    }
    results.push({
      id, originalName: path.basename(fp), fileName: newName,
      type: isVideo ? 'video' : 'image',
      size: fs.statSync(destPath).size, categoryId: null, tags: [], source: '', notes: '',
      importedAt: new Date().toISOString()
    })
  }
  return results
})

ipcMain.handle('materials:getPath', (_, fileName) => {
  // Try file:// first (needs webSecurity:false), fall back to HTTP
  const filePath = `file:///${path.join(materialsDir, fileName).replace(/\\/g, '/')}`
  return filePath
})

ipcMain.handle('settings:getMaterialsDir', () => materialsDir)
ipcMain.handle('settings:setMaterialsDir', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { title: '选择素材存放文件夹', properties: ['openDirectory'] })
  if (!r.canceled && r.filePaths.length > 0) {
    const newDir = r.filePaths[0]
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true })
    materialsDir = newDir
    ensureDirs()
    fs.writeFileSync(configPath, JSON.stringify({ materialsDir: newDir }))
    return newDir
  }
  return null
})

ipcMain.handle('dialog:trimVideo', async (_, filePath, startTime, endTime) => {
  if (!ffmpegPath) return { error: 'FFmpeg 不可用，无法裁剪' }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const destPath = path.join(materialsDir, id + '.mp4')
  const duration = endTime - startTime
  if (duration <= 0) return { error: '裁剪区间无效' }
  return new Promise((resolve) => {
    const args = ['-y', '-ss', String(startTime), '-i', filePath, '-t', String(duration), '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', destPath]
    const proc = spawn(ffmpegPath, args)
    let stderr = ''
    proc.stderr.on('data', d => stderr += d)
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(destPath)) resolve({ fileName: id + '.mp4', filePath: destPath })
      else resolve({ error: 'FFmpeg 裁剪失败 (code ' + code + ')' + (stderr ? ': ' + stderr.slice(-200) : '') })
    })
    proc.on('error', (err) => resolve({ error: 'FFmpeg 执行失败: ' + err.message }))
  })
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
