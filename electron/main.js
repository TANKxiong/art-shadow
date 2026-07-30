const { app, BrowserWindow } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

let mainWindow = null
let serverProcess = null

function startServer() {
  return new Promise((resolve) => {
    serverProcess = spawn('node', [
      path.join(__dirname, 'node_modules', '.bin', 'vite'),
      'preview',
      '--port', '5801',
      '--host'
    ], {
      cwd: __dirname,
      stdio: 'pipe',
      shell: true
    })
    // Wait for server to be ready
    const check = setInterval(() => {
      require('http').get('http://localhost:5801', (res) => {
        clearInterval(check)
        resolve()
      }).on('error', () => {})
    }, 500)
  })
}

app.whenReady().then(async () => {
  await startServer()

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

  mainWindow.loadURL('http://localhost:5801')
  mainWindow.removeMenu()

  mainWindow.on('closed', () => {
    mainWindow = null
    if (serverProcess) serverProcess.kill()
  })
})

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill()
  app.quit()
})
