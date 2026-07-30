const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Data operations
  getAllData: () => ipcRenderer.invoke('data:getAll'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),

  // File operations
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  getMaterialPath: (fileName) => ipcRenderer.invoke('materials:getPath', fileName),
  getAppPath: (name) => ipcRenderer.invoke('app:getPath', name)
})
