import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import os from 'node:os'
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
  const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  // Preferred: extraResources copy (real filesystem, spawn-safe)
  const preferred = [
    path.join(process.resourcesPath, 'ffmpeg', 'win32-x64', binName),
    path.join(process.resourcesPath, 'ffmpeg', binName)
  ]
  for (const c of preferred) { if (fs.existsSync(c)) { ffmpegPath = c; break } }
  // Fallback: module path, redirect asar -> asar.unpacked (fs.existsSync lies for asar)
  if (!ffmpegPath) {
    let p = require('@ffmpeg-installer/ffmpeg').path
    if (p.includes('app.asar')) p = p.replace('app.asar', 'app.asar.unpacked')
    if (fs.existsSync(p)) ffmpegPath = p
  }
  console.log('FFmpeg path:', ffmpegPath || 'NOT FOUND')
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

// All video extensions we accept; every video is transcoded to H.264 MP4 for Chromium
const VIDEO_EXTS = ['.mp4','.webm','.mov','.avi','.mkv','.wmv','.flv','.m4v','.ts','.m2ts','.mts','.3gp','.3g2','.ogv','.ogg','.rm','.rmvb','.vob','.mpg','.mpeg','.asf','.mxf','.dv','.f4v','.nut']

// Transcode video to H.264 MP4 for compatibility
function transcode(inputPath, outputPath) {
  if (!ffmpegPath) return Promise.reject(new Error('FFmpeg not available'))
  return new Promise((resolve, reject) => {
    // Try with audio first; if that fails (no audio stream etc), retry without audio
    const run = (audio) => {
      const args = ['-y', '-i', inputPath]
      if (audio) args.push('-c:a', 'aac', '-b:a', '128k')
      args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '23')
      args.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart', outputPath)
      execFile(ffmpegPath, args, { timeout: 180000 }, (err) => {
        if (err && audio) run(false)
        else if (err) reject(err)
        else resolve()
      })
    }
    run(true)
  })
}

// HTTP server for material files
function startFileServer() {
  const mime = { '.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.mkv':'video/x-matroska','.avi':'video/x-msvideo','.ts':'video/mp2t','.m2ts':'video/mp2t','.mts':'video/mp2t','.flv':'video/x-flv','.wmv':'video/x-ms-wmv','.mpg':'video/mpeg','.mpeg':'video/mpeg','.ogv':'video/ogg','.3gp':'video/3gpp','.rmvb':'video/vnd.rn-realvideo','.jpg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp' }
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

// 处理一批文件路径：视频转码/图片复制，返回素材对象数组
async function importPaths(filePaths) {
  ensureDirs()
  const results = []
  for (const fp of filePaths) {
    const ext = path.extname(fp).toLowerCase()
    const isVideo = VIDEO_EXTS.includes(ext)
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    let destPath = fp
    let newName = path.basename(fp)
    let transcodeError = null
    // For videos, try to ensure playability with FFmpeg
    if (isVideo && ffmpegPath) {
      const dest = path.join(materialsDir, id + '.mp4')
      try {
        await transcode(fp, dest)
        destPath = dest
        newName = id + '.mp4'
      } catch(e) {
        // Transcode failed, copy original (may not play, but preserve file)
        transcodeError = (e && e.message ? e.message : String(e)).slice(0, 300)
        const dest2 = path.join(materialsDir, id + ext)
        try { fs.copyFileSync(fp, dest2); destPath = dest2; newName = id + ext } catch(e2) {
          console.error('copy failed', e2)
          continue
        }
      }
    } else {
      const dest = path.join(materialsDir, id + ext)
      try { fs.copyFileSync(fp, dest); destPath = dest; newName = id + ext } catch(e) {
        console.error('copy failed', e)
        continue
      }
    }
    results.push({
      id, originalName: path.basename(fp), fileName: newName,
      type: isVideo ? 'video' : 'image',
      transcodeError,
      size: fs.statSync(destPath).size, categoryId: null, tags: [], source: '', notes: '',
      importedAt: new Date().toISOString()
    })
  }
  return results
}

ipcMain.handle('dialog:openFiles', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '导入素材', filters: [{ name: '媒体文件', extensions: ['mp4','webm','mov','avi','mkv','wmv','flv','m4v','ts','m2ts','mts','3gp','3g2','ogv','ogg','rm','rmvb','vob','mpg','mpeg','asf','mxf','dv','f4v','nut','jpg','jpeg','png','gif','webp','bmp'] }],
    properties: ['openFile', 'multiSelections']
  })
  if (r.canceled) return []
  return importPaths(r.filePaths)
})

// 系统文件拖拽导入：接收文件路径数组（来自 renderer 拖拽的 File.path）
ipcMain.handle('dialog:openFilesWithPaths', async (_, filePaths) => {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return []
  return importPaths(filePaths)
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

// Export: receive per-frame JPEG data URLs, encode to MP4 with FFmpeg, then ask user where to save
ipcMain.handle('export:frames', async (_, { frames, fps }) => {
  if (!ffmpegPath) return { ok: false, error: 'FFmpeg 不可用' }
  if (!Array.isArray(frames) || frames.length === 0) return { ok: false, error: '无帧数据' }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artshadow-exp-'))
  try {
    // Write frames to disk as frame_0001.jpg ...
    const padding = String(frames.length).length
    for (let i = 0; i < frames.length; i++) {
      const b64 = frames[i].replace(/^data:image\/[a-z]+;base64,/, '')
      fs.writeFileSync(path.join(tmpDir, 'frame_' + String(i + 1).padStart(padding, '0') + '.jpg'), Buffer.from(b64, 'base64'))
    }
    const rate = Math.max(1, Math.min(60, Math.round(fps || 30)))
    const outPath = path.join(tmpDir, 'output.mp4')
    const pattern = path.join(tmpDir, 'frame_%0' + padding + 'd.jpg')
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-y', '-framerate', String(rate), '-i', pattern,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        outPath
      ])
      let stderr = ''
      proc.stderr.on('data', d => stderr += d)
      proc.on('close', (code) => code === 0 && fs.existsSync(outPath) ? resolve() : reject(new Error('ffmpeg code ' + code + ' ' + stderr.slice(-300))))
      proc.on('error', reject)
    })
    // Ask user where to save
    const r = await dialog.showSaveDialog(mainWindow, {
      title: '保存合成视频',
      defaultPath: '画影客对比_' + Date.now() + '.mp4',
      filters: [{ name: 'MP4 视频', extensions: ['mp4'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false, canceled: true }
    fs.copyFileSync(outPath, r.filePath)
    return { ok: true, path: r.filePath }
  } catch(e) {
    return { ok: false, error: (e && e.message ? e.message : String(e)).slice(0, 400) }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch(e) {}
  }
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
