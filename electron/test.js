console.log('process.type:', process.type)
try {
  const e = require('electron')
  console.log('electron type:', typeof e)
  console.log('electron keys:', Object.keys(e).filter(k => isNaN(k) && k !== 'constructor').slice(0,10))
  if (typeof e === 'object') console.log('app:', typeof e.app)
} catch(err) {
  console.error('Error:', err.message)
}
