import React, { useState, useMemo } from 'react'
import { useStore } from '../store/StoreContext'
import UrlModal from './UrlModal'
import ImportModal from './ImportModal'
import styles from '../styles/Sidebar.module.css'

// ... (CategoryNode and other code unchanged)

export default function Sidebar() {
  const { state, dispatch, addCategory } = useStore()
  const { categories, tags, selectedCategory, selectedTags } = state
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState(null)
  const [expanded, setExpanded] = useState(new Set())

  const rootCategories = useMemo(() => categories.filter(c => !c.parentId), [categories])

  const handleSelectCategory = (id) => {
    if (id === null) dispatch({ type: 'SELECT_CATEGORY', payload: null })
    else if (selectedCategory === id) dispatch({ type: 'SELECT_CATEGORY', payload: null })
    else dispatch({ type: 'SELECT_CATEGORY', payload: id })
  }

  const handleToggleExpand = (id) => {
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const handleToggleTag = (tagName) => {
    const newTags = selectedTags.includes(tagName) ? selectedTags.filter(t => t !== tagName) : [...selectedTags, tagName]
    dispatch({ type: 'SELECT_TAGS', payload: newTags })
  }

  const handleAddCategory = () => {
    if (newCat.trim()) { addCategory(newCat.trim()); setNewCat(''); setShowAddCat(false) }
  }

  const handleAddTag = () => {
    if (newTag.trim()) { dispatch({ type: 'ADD_TAG', payload: { id: Date.now().toString(36), name: newTag.trim() } }); setNewTag(''); setShowAddTag(false) }
  }

  const handleImport = () => {
    if (window.electronAPI) {
      window.electronAPI.openFiles().then(files => {
        if (files.length > 0) {
          const norm = files.map(f => ({ ...f, name: f.originalName, type: f.type === 'video' ? 'video/mp4' : 'image/jpeg', _isElectron: true }))
          setPendingFiles(norm)
          setShowImportModal(true)
        }
      }).catch(() => {})
      return
    }
    // Browser path - unchanged
    const input = document.createElement('input')
    input.type = 'file'; input.multiple = true; input.accept = 'video/*,image/*'
    input.onchange = (e) => {
      const files = Array.from(e.target.files)
      if (files.length > 0) { setPendingFiles(files); setShowImportModal(true) }
    }
    input.click()
  }

  const doImport = (categoryId, trimRanges = {}) => {
    if (!pendingFiles) return
    const isEl = pendingFiles[0]?._isElectron
    const imported = pendingFiles.map(f => {
      const name = f.originalName || f.name || ''
      return {
        id: f.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        originalName: name,
        fileName: f.fileName || name,
        type: /\.(mp4|webm|mov|avi|mkv)$/i.test(name) ? 'video' : 'image',
        size: f.size || 0,
        categoryId,
        importedAt: f.importedAt || new Date().toISOString(),
        _file: isEl ? undefined : f
      }
    })
    dispatch({ type: 'ADD_MATERIALS', payload: imported })
    setPendingFiles(null)
  }

  // ...rest of component unchanged
