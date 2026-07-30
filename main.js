const { app, BrowserWindow } = require('electron')
const path = require('path')

let mainWindow = null

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: '参考库 · Reference Vault',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'electron', 'preload.js')
    },
    backgroundColor: '#f4f7fb'
  })

  mainWindow.loadURL('http://localhost:5173')
  mainWindow.webContents.openDevTools({ mode: 'detach' })
  console.log('App started!')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
