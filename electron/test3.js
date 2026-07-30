// Check if electron is a built-in module
const builtins = require('module').builtinModules
console.log('electron in builtins:', builtins.includes('electron'))

// Check if we can access it via process
console.log('process._linkedBinding:', typeof process._linkedBinding)
if (typeof process._linkedBinding === 'function') {
  try {
    const eb = process._linkedBinding('electron_common_electron')
    console.log('electron binding:', typeof eb)
  } catch(e) {
    console.log('electron binding error:', e.message)
  }
}

// Try accessing electron APIs differently
// In Electron, APIs might be exposed as globals
console.log('BrowserWindow global:', typeof globalThis.BrowserWindow)
console.log('app global:', typeof globalThis.app)

// Try process.electronBinding
if (typeof process.electronBinding === 'function') {
  console.log('electronBinding exists')
} else {
  console.log('electronBinding not available')
}

// Check resolve paths
console.log('__dirname:', __dirname)
console.log('module.paths:', module.paths.slice(0,3))
