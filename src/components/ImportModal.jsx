import React, { useState, useEffect } from 'react'
import { useStore } from '../store/StoreContext'
import VideoTrimmer from './VideoTrimmer'
import styles from '../styles/ImportModal.module.css'

function FilePreview({ file }) {
  const [preview, setPreview] = useState(null)
  const [thumbLoaded, setThumbLoaded] = useState(false)

  useEffect(() => {
    if (!file) return
    if (file._type?.startsWith('image/') || file.type?.startsWith('image/') || file.type === 'image') {
      const url = URL.createObjectURL(file)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
    if (file._type?.startsWith('video/') || file.type?.startsWith('video/') || file.type === 'video') {
      const url = URL.createObjectURL(file)
      setPreview(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [file])

  return (
    <div className={styles.previewItem}>
      {file.type.startsWith('video/') ? (
        <div className={styles.previewVid}>
          {preview ? (
            <video src={preview} autoPlay muted loop playsInline className={styles.previewVideo}
              onLoadedData={() => setThumbLoaded(true)} />
          ) : (
            <span className={styles.previewIcon}>🎬</span>
          )}
        </div>
      ) : (
        <div className={styles.previewImg}>
          {preview ? <img src={preview} alt="" /> : <span className={styles.previewIcon}>🖼️</span>}
        </div>
      )}
      <div className={styles.previewName}>{file.name}</div>
    </div>
  )
}

export default function ImportModal({ files, onClose, onImport }) {
  const { state } = useStore()
  const { categories } = state
  const [selectedId, setSelectedId] = useState(null)
  const [trimRanges, setTrimRanges] = useState({})
  const [step, setStep] = useState(2) // Start at category selection

  const videoFile = files?.find(f => f.type.startsWith('video/'))

  const getPath = (catId) => {
    const path = []
    let current = categories.find(c => c.id === catId)
    while (current) {
      path.unshift(current)
      current = categories.find(c => c.id === current.parentId)
    }
    return path
  }

  const path = selectedId ? getPath(selectedId) : []
  const selectedCat = categories.find(c => c.id === selectedId)
  const hasSubCats = selectedCat && categories.some(c => c.parentId === selectedCat?.id)

  // Get current level categories
  const getLevelCategories = () => {
    if (!selectedId) return categories.filter(c => !c.parentId)
    return categories.filter(c => c.parentId === selectedId)
  }

  const levelCats = getLevelCategories()

  const handleSelect = (catId) => {
    setSelectedId(catId)
    const cat = categories.find(c => c.id === catId)
    if (cat && categories.some(c => c.parentId === catId)) {
      setSelectedId(catId)
    }
  }

  const handleEnter = () => {
    if (selectedId && hasSubCats) {
      // Already selected, children will show
    }
  }

  const handleBack = () => {
    const p = getPath(selectedId)
    if (p.length <= 1) {
      setSelectedId(null)
    } else {
      setSelectedId(p[p.length - 2].id)
    }
  }

  const handleConfirm = () => {
    if (selectedId) {
      onImport(selectedId, trimRanges)
      onClose()
    }
  }

  const fileCount = files?.length || 0
  const canConfirm = selectedId && !hasSubCats

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3>📥 导入素材</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* File previews */}
        <div className={styles.previewSection}>
          {videoFile ? (
            <div className={styles.trimmerWrap} style={{width:'100%',padding:'0 16px'}}>
              <VideoTrimmer file={videoFile} onTrimChange={(s,e)=>setTrimRanges({startTime:s,endTime:e})} />
            </div>
          ) : (
            <>
            <div className={styles.previewGrid}>
              {files?.slice(0, 6).map((f, i) => (<FilePreview key={i} file={f} />))}
              {files && files.length > 6 && (
                <div className={styles.previewMore}>+{files.length - 6} 个文件</div>
              )}
            </div>
            <div className={styles.fileCount}>
              已选择 <strong>{fileCount}</strong> 个素材
            </div>
            </>
          )}
        </div>
        <div className={styles.catSection}>
          <div className={styles.catTitle}>选择导入分类</div>

          {/* Path breadcrumb */}
          <div className={styles.breadcrumb}>
            {selectedId && (
              <button className={styles.backBtn} onClick={handleBack}>← 返回</button>
            )}
            <span className={styles.pathText}>
              {path.length > 0 ? path.map((c, i) => (
                <span key={c.id}>{i > 0 ? ' › ' : ''}{c.name}</span>
              )) : '全部'}
            </span>
          </div>

          {/* Category grid */}
          <div className={styles.catGrid}>
            {levelCats.map(cat => (
              <div
                key={cat.id}
                className={`${styles.catCard} ${selectedId === cat.id ? styles.catSelected : ''}`}
                onClick={() => handleSelect(cat.id)}
              >
                <span className={styles.catName}>{cat.name}</span>
                {selectedId === cat.id && <span className={styles.catCheck}>✓</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          {canConfirm ? (
            <button className={styles.confirmBtn} onClick={handleConfirm}>
              ✅ 导入到「{selectedCat?.name}」
            </button>
          ) : hasSubCats && selectedId ? (
            <button className={styles.confirmBtn} onClick={() => setSelectedId(selectedId)} disabled style={{opacity:0.5}}>
              📁 请继续选择子分类
            </button>
          ) : (
            <button className={styles.confirmBtn} disabled>
              {selectedId ? '...' : '请选择分类'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
