import React, { useState, useMemo } from 'react'
import { useStore } from '../store/StoreContext'
import UrlModal from './UrlModal'
import ImportModal from './ImportModal'
import { trimVideo } from './videoTrim'
import styles from '../styles/Sidebar.module.css'

// Recursive tree node component
function CategoryNode({ node, children, selectedId, onSelect, depth, expanded, onToggleExpand }) {
  const { state } = useStore()
  const hasChildren = children && children.length > 0
  const isSelected = selectedId === node.id
  const isExpanded = expanded.has(node.id)

  // Count materials in this category and all descendants
  const count = countMaterials(node, children, state)

  return (
    <div>
      <div
        className={`${styles.navItem} ${isSelected ? styles.active : ''} ${depth > 0 ? styles.child : ''}`}
        style={{ paddingLeft: 12 + depth * 16 }}
        onClick={() => onSelect(isSelected ? null : node.id)}
      >
        {hasChildren ? (
          <span className={styles.expandBtn} onClick={e => { e.stopPropagation(); onToggleExpand(node.id) }}>
            {isExpanded ? '▾' : '▸'}
          </span>
        ) : (
          <span className={styles.expandBtn} style={{ visibility: 'hidden' }}>▸</span>
        )}
        <span className={styles.treeNode}>{node.name}</span>
        {count > 0 && <span className={styles.count}>{count}</span>}
      </div>
      {isExpanded && hasChildren && children.map(child => (
        <CategoryNode
          key={child.id}
          node={child}
          children={state.categories.filter(c => c.parentId === child.id)}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth + 1}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
        />
      ))}
    </div>
  )
}

function countMaterials(node, children, state) {
  let count = state.materials.filter(m => m.categoryId === node.id).length
  if (children) {
    children.forEach(c => count += countMaterials(c, state.categories.filter(cc => cc.parentId === c.id), state))
  }
  return count
}

// Get all descendant category IDs
function getDescendantIds(catId, categories) {
  const ids = [catId]
  const children = categories.filter(c => c.parentId === catId)
  children.forEach(c => ids.push(...getDescendantIds(c.id, categories)))
  return ids
}

export default function Sidebar() {
  const { state, dispatch, addCategory } = useStore()
  const { categories, tags, selectedCategory, selectedTags } = state
  const [showAddCat, setShowAddCat] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [showImportModal, setShowImportModal] = useState(false)
  const [pendingFiles, setPendingFiles] = useState(null)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [expanded, setExpanded] = useState(new Set())

  // Get root categories
  const rootCategories = useMemo(() => categories.filter(c => !c.parentId), [categories])

  const handleSelectCategory = (id) => {
    if (id === null) {
      dispatch({ type: 'SELECT_CATEGORY', payload: null })
    } else if (selectedCategory === id) {
      dispatch({ type: 'SELECT_CATEGORY', payload: null })
    } else {
      dispatch({ type: 'SELECT_CATEGORY', payload: id })
    }
  }

  const handleToggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleToggleTag = (tagName) => {
    const newTags = selectedTags.includes(tagName)
      ? selectedTags.filter(t => t !== tagName)
      : [...selectedTags, tagName]
    dispatch({ type: 'SELECT_TAGS', payload: newTags })
  }

  const handleAddCategory = () => {
    if (newCat.trim()) {
      addCategory(newCat.trim())
      setNewCat('')
      setShowAddCat(false)
    }
  }

  const handleAddTag = () => {
    if (newTag.trim()) {
      dispatch({ type: 'ADD_TAG', payload: { id: Date.now().toString(36), name: newTag.trim() } })
      setNewTag('')
      setShowAddTag(false)
    }
  }

  const handleImport = async () => {
    try {
    if (window.electronAPI) {
      const files = await window.electronAPI.openFiles()
      if (files.length > 0) {
        const norm = files.map(f => ({ ...f, name: f.originalName, _type: f.type==='video'?'video/mp4':'image/jpeg', _isElectron: true }))
        setPendingFiles(norm)
        setShowImportModal(true)
      }
      return
    }
    const input = document.createElement('input')
    input.type = 'file'; input.multiple = true; input.accept = 'video/*,image/*'
    input.onchange = (e) => {
      const files = Array.from(e.target.files)
      if (files.length > 0) { setPendingFiles(files); setShowImportModal(true) }
    }
    input.click()
    } catch (e) { console.error('Import error:', e) }
  }

  const doImport = async (categoryId, trimRanges = {}) => {
    if (!pendingFiles) return
    const isEl = pendingFiles[0]?._isElectron
    const imported = pendingFiles.map(f => {
      const name = f.originalName || f.name || ''
      const isVid = /\.(mp4|webm|mov|avi|mkv)$/i.test(name)
      return {
        id: f.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        originalName: f.originalName || f.name,
        fileName: f.fileName || f.name,
        type: isVid ? 'video' : 'image',
        size: f.size || 0,
        categoryId,
        importedAt: f.importedAt || new Date().toISOString(),
        _file: isEl ? undefined : f
      }
    })
    dispatch({ type: 'ADD_MATERIALS', payload: imported })
    setPendingFiles(null)
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.logo}><svg width="24" height="24" viewBox="0 0 512 512"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3d7abf"/><stop offset="100%" stop-color="#2563eb"/></linearGradient></defs><circle cx="256" cy="256" r="248" fill="url(#bg)"/><rect x="120" y="280" width="272" height="100" rx="8" fill="rgba(0,0,0,0.3)"/><rect x="130" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><rect x="158" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><rect x="186" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><rect x="214" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><rect x="242" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><rect x="270" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><rect x="298" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><rect x="326" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><rect x="354" y="290" width="16" height="80" rx="3" fill="rgba(255,255,255,0.25)"/><polygon points="225,300 225,360 270,330" fill="rgba(255,255,255,0.9)"/><path d="M 180 260 Q 200 180 280 150 Q 340 130 360 100 Q 370 85 365 75 Q 360 68 350 72 Q 320 85 300 110 Q 280 140 240 160 Q 190 190 150 240 Q 140 260 160 260 Q 170 260 180 260 Z" fill="#93c5fd" opacity="0.9"/><path d="M 345 60 L 355 45 L 365 55 Z" fill="#93c5fd"/><circle cx="380" cy="80" r="8" fill="rgba(255,255,255,0.5)"/><circle cx="395" cy="130" r="5" fill="rgba(255,255,255,0.3)"/><circle cx="140" cy="130" r="6" fill="rgba(255,255,255,0.4)"/><path d="M 100 350 Q 200 310 300 340 Q 350 350 380 330" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3" stroke-linecap="round"/></svg></div>
        <div className={styles.title}>画影客</div>
      </div>

      <nav className={styles.nav}>
        <div className={styles.section}>
          <div className={styles.label}>
            <span>📁 分类</span>
            <button className={styles.addBtn} onClick={() => setShowAddCat(true)} title="添加分类">＋</button>
          </div>
          <div className={`${styles.navItem} ${selectedCategory === null && selectedTags.length === 0 ? styles.active : ''}`}
            onClick={() => handleSelectCategory(null)}>
            <span className={styles.expandBtn} style={{visibility:'hidden'}}>▸</span>
            <span className={styles.treeNode}>全部素材</span>
            <span className={styles.count}>{state.materials.length}</span>
          </div>
          {rootCategories.map(node => (
            <CategoryNode
              key={node.id}
              node={node}
              children={categories.filter(c => c.parentId === node.id)}
              selectedId={selectedCategory}
              onSelect={handleSelectCategory}
              depth={0}
              expanded={expanded}
              onToggleExpand={handleToggleExpand}
            />
          ))}
          {showAddCat && (
            <div className={styles.inlineInput} style={{marginTop:4}}>
              <input autoFocus value={newCat} onChange={e => setNewCat(e.target.value)}
                onKeyDown={e => e.key==='Enter' && handleAddCategory()}
                onBlur={() => { if (!newCat.trim()) setShowAddCat(false) }}
                placeholder="输入分类名..." />
              <button onClick={handleAddCategory}>✓</button>
            </div>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.label}>
            <span>🏷️ 标签</span>
            <button className={styles.addBtn} onClick={() => setShowAddTag(true)} title="添加标签">＋</button>
          </div>
          <div className={styles.tagList}>
            {tags.map(tag => (
              <span key={tag.id} className={`${styles.tagChip} ${selectedTags.includes(tag.name) ? styles.tagSelected : ''}`}
                onClick={() => handleToggleTag(tag.name)}>{tag.name}</span>
            ))}
            {tags.length === 0 && !showAddTag && <span className={styles.emptyHint}>暂无标签，点击 ＋ 创建</span>}
          </div>
          {showAddTag && (
            <div className={styles.inlineInput}>
              <input autoFocus value={newTag} onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key==='Enter' && handleAddTag()}
                onBlur={() => { if (!newTag.trim()) setShowAddTag(false) }} placeholder="输入标签名..." />
              <button onClick={handleAddTag}>✓</button>
            </div>
          )}
        </div>
      </nav>

      <div className={styles.footer}>
        <button className={styles.importBtn} onClick={handleImport}><span>📁</span> 导入素材</button>
        <button className={styles.linkBtn} onClick={() => setShowUrlModal(true)}><span>🔗</span> 添加链接</button>
      </div>
      {showImportModal && <ImportModal files={pendingFiles} onClose={() => { setShowImportModal(false); setPendingFiles(null) }} onImport={doImport} />}
      {showUrlModal && <UrlModal onClose={() => setShowUrlModal(false)} onImport={(catId, data) => {
        dispatch({ type: 'ADD_MATERIALS', payload: [{
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
          originalName: data.title.trim() || data.url.trim(),
          displayName: data.title.trim() || undefined,
          type: data.type, url: data.url.trim(),
          embedUrl: data.embedUrl || data.url.trim(),
          service: data.service || '', source: data.service || '',
          size: 0, categoryId: catId, tags: [], notes: '',
          importedAt: new Date().toISOString()
        }] })
        setShowUrlModal(false)
      }} />}
    </aside>
  )
}
