// Test multiple ways to get electron APIs
console.log('process.type:', process.type)
console.log('process.versions:', JSON.stringify(process.versions))

// Method 1: require('electron')
try {
  const e1 = require('electron')
  console.log('require(electron) type:', typeof e1)
  if (typeof e1 === 'object' && e1 !== null) {
    console.log('  app:', typeof e1.app)
    console.log('  ipcMain:', typeof e1.ipcMain)
  } else if (typeof e1 === 'string') {
    console.log('  (got string, not object)')
  }
} catch(e) { console.log('require failed:', e.message) }

// Method 2: check global
console.log('globalThis.electron:', typeof globalThis.electron)
console.log('globalThis.__electron__:', typeof globalThis.__electron__)

// Method 3: try require('electron/main') or 'electron/common'
try { const e2 = require('electron/main'); console.log('electron/main type:', typeof e2) } catch(e) { console.log('electron/main:', e.message) }
try { const e3 = require('electron/common'); console.log('electron/common type:', typeof e3) } catch(e) { console.log('electron/common:', e.message) }

// Method 4: builtins
try { const e4 = require('node:electron'); console.log('node:electron type:', typeof e4) } catch(e) { console.log('node:electron:', e.message) }
