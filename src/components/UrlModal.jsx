import React, { useState } from 'react'
import { useStore } from '../store/StoreContext'
import styles from '../styles/UrlModal.module.css'

function parseTimestamp(url) {
  // Parse t=120, t=1m30s, t=1h2m3s from URL
  const tMatch = url.match(/[?&]t=([\dhmsw]+)/i)
  if (!tMatch) return null
  const t = tMatch[1].toLowerCase()
  let seconds = 0
  let num = ''
  for (const ch of t) {
    if (ch >= '0' && ch <= '9') { num += ch }
    else {
      const n = parseInt(num) || 0
      if (ch === 'h') seconds += n * 3600
      else if (ch === 'm') seconds += n * 60
      else if (ch === 's') seconds += n
      num = ''
    }
  }
  if (num) seconds += parseInt(num) || 0
  return seconds > 0 ? seconds : null
}

function parseUrl(url) {
  const trimmed = url.trim()
  let type = 'link', embedUrl = '', service = ''
  const biliMatch = trimmed.match(/bilibili\.com\/video\/(BV[\w]+)/i) || trimmed.match(/bilibili\.com\/video\/av(\d+)/i)
  if (biliMatch) {
    embedUrl = biliMatch[1].startsWith('BV')
      ? `https://player.bilibili.com/player.html?bvid=${biliMatch[1]}&page=1&autoplay=0`
      : `https://player.bilibili.com/player.html?aid=${biliMatch[1]}&page=1&autoplay=0`
    type = 'bilibili'; service = 'B站'
  }
  const seekTime = parseTimestamp(trimmed)
  if (seekTime && embedUrl) {
    embedUrl += '#/?t=' + seekTime
  }
  const ytMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]+)/i)
  if (ytMatch) { embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`+
    (seekTime?`?start=${seekTime}`:''); type = 'youtube'; service = 'YouTube' }
  return { type, embedUrl, service }
}

export default function UrlModal({ onClose, onImport }) {
  const { state } = useStore()
  const { categories } = state
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [parsed, setParsed] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [step, setStep] = useState(1)

  const getPath = (catId) => {
    const path = []
    let current = categories.find(c => c.id === catId)
    while (current) { path.unshift(current); current = categories.find(c => c.id === current.parentId) }
    return path
  }

  const path = selectedId ? getPath(selectedId) : []
  const selectedCat = categories.find(c => c.id === selectedId)
  const hasSubCats = selectedCat && categories.some(c => c.parentId === selectedCat?.id)

  const getLevelCategories = () => {
    if (!selectedId) return categories.filter(c => !c.parentId)
    return categories.filter(c => c.parentId === selectedId)
  }

  const levelCats = getLevelCategories()

  const handleParse = async () => {
    const result = parseUrl(url); setParsed(result)
    if (!title && result.service) {
      try {
        const resp = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
        if (resp.ok) { const data = await resp.json(); if (data.title) setTitle(data.title) }
      } catch (e) {}
    }
  }

  const handleSelect = (catId) => setSelectedId(catId)
  const handleBack = () => {
    const p = getPath(selectedId)
    setSelectedId(p.length <= 1 ? null : p[p.length - 2].id)
  }

  const handleConfirm = () => {
    if (!url.trim() || !selectedId) return
    const result = parsed || parseUrl(url)
    onImport(selectedId, { title, url, ...result })
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>🔗 添加参考链接</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label>粘贴视频链接</label>
            <input value={url} onChange={e => setUrl(e.target.value)} onBlur={handleParse}
              placeholder="https://www.bilibili.com/video/BV..." autoFocus />
            <p className={styles.hint}>支持 B站、YouTube、Vimeo</p>
          </div>
          {parsed?.service && <div className={styles.detected}>✅ 识别为 <strong>{parsed.service}</strong> 视频</div>}
          <div className={styles.field}>
            <label>标题（可选）</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="输入参考名称" />
          </div>

          <div className={styles.field}>
            <label>选择分类</label>
            <div className={styles.breadcrumb}>
              {selectedId && <button className={styles.backBtn} onClick={handleBack}>← 返回</button>}
              <span>{path.length > 0 ? path.map((c,i) => <span key={c.id}>{i>0?' › ':''}{c.name}</span>) : '请选择'}</span>
            </div>
            <div className={styles.catGrid}>
              {levelCats.map(cat => (
                <div key={cat.id}
                  className={`${styles.catCard} ${selectedId===cat.id?styles.catSelected:''}`}
                  onClick={() => handleSelect(cat.id)}>
                  <span className={styles.catName}>{cat.name}</span>
                  {selectedId===cat.id && <span className={styles.catCheck}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button className={styles.importBtn} onClick={handleConfirm} disabled={!url.trim() || !selectedId}>
            {selectedId ? `添加到「${selectedCat?.name||''}」` : '请选择分类'}
          </button>
        </div>
      </div>
    </div>
  )
}
