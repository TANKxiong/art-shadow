const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getAllData: () => ipcRenderer.invoke('data:getAll'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  getMaterialPath: (fileName) => ipcRenderer.invoke('materials:getPath', fileName),
  getMaterialsDir: () => ipcRenderer.invoke('settings:getMaterialsDir'),
  setMaterialsDir: () => ipcRenderer.invoke('settings:setMaterialsDir')
})
