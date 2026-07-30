import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useStore } from '../store/StoreContext'
import styles from '../styles/MaterialCard.module.css'

const TAG_COLORS = {
  '刀光': { bg: '#fef2f2', color: '#ef4444' },
  '慢动作': { bg: '#fffbeb', color: '#f59e0b' },
  '水墨风': { bg: '#ecfdf5', color: '#10b981' },
  '粒子特效': { bg: '#eef2ff', color: '#6366f1' },
  '打击感': { bg: '#fff7ed', color: '#f97316' },
  '镜头语言': { bg: '#f5f3ff', color: '#8b5cf6' },
  '逐帧': { bg: '#fdf2f8', color: '#ec4899' },
  '蓄力': { bg: '#ecfeff', color: '#06b6d4' },
}

function VideoThumbnail({ videoSrc, onThumbnailReady }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!videoSrc) return
    const video = videoRef.current; if (!video) return
    let cancelled = false
    const onData = () => { if (!cancelled) video.currentTime = Math.min(1, video.duration * 0.1) }
    const onSeeked = () => {
      if (cancelled) return
      try {
        const c = canvasRef.current; if (!c) return
        c.width = video.videoWidth || 320; c.height = video.videoHeight || 180
        c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
        const url = c.toDataURL('image/jpeg', 0.85)
        setLoading(false)
        if (onThumbnailReady) onThumbnailReady(url)
      } catch (e) { setLoading(false) }
    }
    video.addEventListener('loadeddata', onData)
    video.addEventListener('seeked', onSeeked)
    return () => { cancelled = true; video.removeEventListener('loadeddata', onData); video.removeEventListener('seeked', onSeeked) }
  }, [videoSrc])
  return (<><video ref={videoRef} src={videoSrc} crossOrigin="anonymous" preload="metadata" style={{display:'none'}} muted /><canvas ref={canvasRef} style={{display:'none'}} /></>)
}

export default function MaterialCard({ material, selectMode, selected, onToggleSelect }) {
  const { state, dispatch } = useStore()
  const { viewMode } = state
  const [editing, setEditing] = useState(false)
  const [editKey, setEditKey] = useState(0)
  const [tagInput, setTagInput] = useState('')
  const [videoSrc, setVideoSrc] = useState(null)
  const [thumbDataUrl, setThumbDataUrl] = useState(material.thumbnail || null)
  const nameRef = useRef(null)
  const sourceRef = useRef(null)
  const catRef = useRef(null)
  const thumbReadyRef = useRef(false)

  const getDisplayName = () => material.displayName || material.originalName || '未命名素材'

  useEffect(() => {
    if (material.type !== 'video' || material.thumbnail || thumbReadyRef.current) return
    if (material._file) setVideoSrc(URL.createObjectURL(material._file))
    else if (material.fileName && window.electronAPI) window.electronAPI.getMaterialPath(material.fileName).then(p => setVideoSrc('file://' + p))
  }, [material.type, material._file, material.fileName, material.thumbnail])

  const handleThumbnailReady = useCallback((dataUrl) => {
    if (thumbReadyRef.current) return
    thumbReadyRef.current = true
    setThumbDataUrl(dataUrl)
    dispatch({ type: 'UPDATE_MATERIAL', payload: { id: material.id, thumbnail: dataUrl } })
  }, [material.id, dispatch])

  // Auto-save when clicking outside edit panel
  useEffect(() => {
    if (!editing) return
    const handler = (e) => {
      // Check if click is outside any edit panel input
      if (!e.target.closest('[class*="editPanel"]') && !e.target.closest('button')) {
        handleSave()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editing])

  const handleSave = () => {
    dispatch({
      type: 'UPDATE_MATERIAL',
      payload: {
        id: material.id,
        displayName: (nameRef.current?.value || material.originalName || '').trim(),
        source: (sourceRef.current?.value || '').trim(),
        categoryId: catRef.current?.value || null
      }
    })
    setEditing(false)
  }

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      const tag = tagInput.trim()
      const cur = material.tags || []
      if (!cur.includes(tag)) {
        dispatch({ type: 'UPDATE_MATERIAL', payload: { id: material.id, tags: [...cur, tag] } })
        if (!state.tags.find(t => t.name === tag)) dispatch({ type: 'ADD_TAG', payload: { id: Date.now().toString(36), name: tag } })
      }
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag) => {
    dispatch({ type: 'UPDATE_MATERIAL', payload: { id: material.id, tags: (material.tags || []).filter(t => t !== tag) } })
  }

  const handleDelete = () => {
    if (confirm(`确定要删除「${getDisplayName()}」吗？`)) dispatch({ type: 'DELETE_MATERIAL', payload: material.id })
  }

  const handlePreview = () => {
    if (isLink && material.url) {
      window.open(material.url, '_blank')
      return
    }
    dispatch({ type: 'SET_PREVIEW', payload: material })
  }

  const handleEditToggle = (e) => {
    e.stopPropagation()
    if (!editing) setEditKey(k => k + 1)
    setEditing(!editing)
  }

  const getTagStyle = (tag) => TAG_COLORS[tag] || { bg: '#f1f5f9', color: '#64748b' }

  const formatSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const isVideo = material.type === 'video'
  const isImage = material.type === 'image'
  const isLink = ['bilibili', 'youtube', 'vimeo', 'link'].includes(material.type)
  const hasThumbnail = !!thumbDataUrl

  const renderThumb = (isList = false) => {
    if (isLink) {
      return (<div className={styles.linkOverlay}>
        <span className={styles.thumbIcon}>🔗</span>
        <span className={styles.typeBadge}>{material.service || '链接'}</span>
      </div>)
    }
    if (isVideo) {
      return (<div className={styles.videoOverlay}>
        {hasThumbnail ? <img src={thumbDataUrl} className={styles.thumbImg} alt="" /> : <span className={styles.thumbIcon}>🎬</span>}
        {videoSrc && <VideoThumbnail videoSrc={videoSrc} onThumbnailReady={handleThumbnailReady} />}
        <span className={styles.typeBadge}>视频</span>
        {!isList && <button className={styles.playBtn} onClick={e => { e.stopPropagation(); handlePreview() }}>▶</button>}
      </div>)
    }
    if (isImage) {
      return (<div className={styles.imageOverlay}>
        {hasThumbnail ? <img src={thumbDataUrl} className={styles.thumbImg} alt="" />
          : material._file ? <img src={URL.createObjectURL(material._file)} className={styles.thumbImg} alt="" />
          : <span className={styles.thumbIcon}>🖼️</span>}
        <span className={styles.typeBadge}>图片</span>
      </div>)
    }
    return null
  }

  const EditPanel = () => (
    <div className={styles.editPanel} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div className={styles.editField}>
        <label>文件名</label>
        <input key={'name-' + editKey} ref={nameRef} defaultValue={material.displayName || material.originalName || ''} placeholder="输入自定义名称" autoFocus />
        {material.originalName && <div className={styles.editHint}>原名: {material.originalName}</div>}
      </div>
      <div className={styles.editField}>
        <label>来源</label>
        <input key={'src-' + editKey} ref={sourceRef} defaultValue={material.source || ''} placeholder="输入来源（作品名/出处）" />
      </div>
      <div className={styles.editField}>
        <label>分类</label>
        <select key={'cat-' + editKey} ref={catRef} defaultValue={material.categoryId || ''}>
          <option value="">无分类</option>
          {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className={styles.editField}>
        <label>添加标签</label>
        <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} placeholder="输入标签名后按回车" />
      </div>
      <div className={styles.editActions}>
        <button className={styles.saveBtn} onClick={handleSave}>💾 保存</button>
        <button className={styles.previewBtn} onClick={handlePreview}>👁 预览</button>
        <button className={styles.deleteBtn} onClick={handleDelete}>🗑 删除</button>
        <button className={styles.cancelBtn} onClick={() => setEditing(false)}>取消</button>
      </div>
    </div>
  )

  if (viewMode === 'list') {
    return (
      <div className={`${styles.card} ${styles.listCard}`} onClick={handlePreview}>
        <div className={styles.listThumb}>{renderThumb(true)}</div>
        <div className={styles.listInfo}>
          <div className={styles.listName}>{getDisplayName()}</div>
          {material.source && <div className={styles.listSource}>📌 {material.source}</div>}
          <div className={styles.listTags}>
            {(material.tags || []).map(tag => {
              const s = getTagStyle(tag)
              return <span key={tag} className={styles.tag} style={{background:s.bg,color:s.color}}>{tag}</span>
            })}
          </div>
        </div>
        <div className={styles.listMeta}><span>{formatSize(material.size)}</span></div>
        <div className={styles.listActions}>
          <button className={styles.actionBtn} onClick={e => { e.stopPropagation(); handlePreview() }} title="预览">👁</button>
          <button className={styles.actionBtn} onClick={handleEditToggle} title="编辑">✏️</button>
          <button className={styles.actionBtn} onClick={e => { e.stopPropagation(); handleDelete() }} title="删除">🗑</button>
        </div>
        {editing && <div className={styles.inlineEdit} onClick={e => e.stopPropagation()}><EditPanel /></div>}
      </div>
    )
  }

  return (
    <div className={styles.card} onClick={selectMode ? () => onToggleSelect(material.id) : editing ? handleSave : handlePreview}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); dispatch({ type: 'SET_CTX_MENU', payload: { x: e.clientX, y: e.clientY, id: material.id, name: getDisplayName(), time: Date.now() } }) }}>
      {selectMode && (
        <div className={styles.checkOverlay} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(material.id)} className={styles.checkbox} />
        </div>
      )}
      <div className={styles.thumb}>{renderThumb(false)}</div>
      <div className={styles.body}>
        <div className={styles.title}>
          {getDisplayName()}
          {material.displayName && material.displayName !== material.originalName && (
            <span className={styles.originalName} title={`原名: ${material.originalName}`}>{material.originalName}</span>)}
        </div>
        {material.source && <div className={styles.source}>📌 {material.source}</div>}
        <div className={styles.tags}>
          {(material.tags || []).map(tag => {
            const s = getTagStyle(tag)
            return <span key={tag} className={styles.tag} style={{background:s.bg,color:s.color}}
              onClick={e => { e.stopPropagation(); handleRemoveTag(tag) }} title="点击移除标签">{tag} ×</span>
          })}
        </div>
        <div className={styles.actionBar} onClick={e => e.stopPropagation()}>{/* Edit moved to preview modal */}</div>
        {editing && <EditPanel />}
      </div>
    </div>
  )
}
