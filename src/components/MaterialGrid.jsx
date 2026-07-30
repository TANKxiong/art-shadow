import React, { useState, useRef } from 'react'
import { useStore } from '../store/StoreContext'
import MaterialCard from './MaterialCard'
import styles from '../styles/MaterialGrid.module.css'

export default function MaterialGrid() {
  const { state, dispatch } = useStore()
  const { materials, selectedCategory, selectedTags, searchQuery, viewMode } = state
  const [dragOver, setDragOver] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(new Set())

  const importFiles = (files) => {
    const mediaFiles = Array.from(files).filter(f =>
      f.type.startsWith('video/') || f.type.startsWith('image/')
    )
    if (mediaFiles.length === 0) return
    const imported = mediaFiles.map(f => ({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
      originalName: f.name, fileName: f.name,
      type: f.type.startsWith('video/') ? 'video' : 'image',
      size: f.size, categoryId: null, tags: [], source: '', notes: '',
      importedAt: new Date().toISOString(), _file: f
    }))
    dispatch({ type: 'ADD_MATERIALS', payload: imported })
  }

  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true) }
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }
  const onDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); if (e.dataTransfer.files.length > 0) importFiles(e.dataTransfer.files) }

  const toggleSelect = (id) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }

  const selectAll = () => {
    setSelected(new Set(filtered.map(m => m.id)))
  }

  const clearSelect = () => {
    setSelected(new Set())
    setSelectMode(false)
  }

  const batchDelete = () => {
    if (selected.size === 0) return
    if (!confirm(`确定要删除选中的 ${selected.size} 个素材吗？`)) return
    selected.forEach(id => dispatch({ type: 'DELETE_MATERIAL', payload: id }))
    clearSelect()
  }

  let filtered = materials
  if (selectedCategory) {
    const allIds = (function getIds(catId, cats) {
      const ids = [catId]
      const children = cats.filter(c => c.parentId === catId)
      children.forEach(c => ids.push(...getIds(c.id, cats)))
      return ids
    })(selectedCategory, state.categories)
    filtered = filtered.filter(m => m.categoryId && allIds.includes(m.categoryId))
  }
  if (selectedTags.length > 0) filtered = filtered.filter(m => m.tags && selectedTags.some(t => m.tags.includes(t)))
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(m => (m.originalName||'').toLowerCase().includes(q) || (m.displayName||'').toLowerCase().includes(q) || (m.source||'').toLowerCase().includes(q) || (m.tags||[]).some(t=>t.toLowerCase().includes(q)))
  }
  filtered = [...filtered].sort((a,b) => new Date(b.importedAt||0) - new Date(a.importedAt||0))

  return (
    <div className={styles.content} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {dragOver && (<div className={styles.dragOverlay}><div className={styles.dragBox}>📥 松开鼠标导入文件</div></div>)}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📭</div>
          <p>{materials.length === 0 ? '还没有素材，点击左下角「导入素材」或拖拽文件到此处' : '没有找到匹配的素材'}</p>
        </div>
      ) : (
        <>
          <div className={styles.sectionTitle}>
            <span>共 {filtered.length} 个素材</span>
            <div className={styles.titleActions}>
              {selectMode ? (
                <>
                  <button className={styles.batchBtn} onClick={selectAll}>☑ 全选</button>
                  <button className={styles.batchBtn} onClick={clearSelect}>取消</button>
                  {selected.size > 0 && (
                    <button className={styles.batchDelBtn} onClick={batchDelete}>🗑 删除选中 ({selected.size})</button>
                  )}
                </>
              ) : (
                <button className={styles.batchBtn} onClick={() => setSelectMode(true)}>☑ 批量选择</button>
              )}
            </div>
          </div>
          <div className={`${styles.grid} ${viewMode==='list'?styles.list:''}`}>
            {filtered.map(m => (
              <MaterialCard key={m.id} material={m} selectMode={selectMode} selected={selected.has(m.id)} onToggleSelect={toggleSelect} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
