const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getAllData: () => ipcRenderer.invoke('data:getAll'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
  openFilesWithPaths: (paths) => ipcRenderer.invoke('dialog:openFilesWithPaths', paths),
  getMaterialPath: (fileName) => ipcRenderer.invoke('materials:getPath', fileName),
  getMaterialsDir: () => ipcRenderer.invoke('settings:getMaterialsDir'),
  setMaterialsDir: () => ipcRenderer.invoke('settings:setMaterialsDir'),
  trimVideo: (filePath, startTime, endTime) => ipcRenderer.invoke('dialog:trimVideo', filePath, startTime, endTime),
  exportFrames: (frames, fps) => ipcRenderer.invoke('export:frames', { frames, fps }),
  exportImageSequence: (filePath, outDir, fps) => ipcRenderer.invoke('export:imageSequence', { filePath, outDir, fps })
})
