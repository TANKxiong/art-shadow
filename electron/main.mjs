import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow = null

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: '画影客',
    backgroundColor: '#f4f7fb',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Load built files directly
  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  mainWindow.removeMenu()
})

app.on('window-all-closed', () => {
  app.quit()
})
