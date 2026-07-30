console.log('Hello from Electron main process')
console.log('process.type:', process.type)
console.log('process.versions.electron:', process.versions.electron)

// Try to use app
try {
  const { app } = require('electron')
  console.log('app:', typeof app)
} catch(e) {
  console.error(e.message)
}
