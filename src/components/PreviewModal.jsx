import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store/StoreContext'
import DrawingTool from './DrawingTool'
import styles from '../styles/PreviewModal.module.css'

const DEFAULT_FPS = 30

export default function PreviewModal() {
  const { state, dispatch } = useStore()
  const previewMaterial = state.previewMaterial
  const videoRef = useRef(null)
  const contentRef = useRef(null)
  const [videoSrc, setVideoSrc] = useState('')
  const [currentFrame, setCurrentFrame] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [fps, setFps] = useState(DEFAULT_FPS)
  const [drawMode, setDrawMode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [videoTime, setVideoTime] = useState(0)
  const [videoDur, setVideoDur] = useState(0)
  const videoDurRef = useRef(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [timelineDrag, setTimelineDrag] = useState(false)
  const [loop, setLoop] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loopRange, setLoopRange] = useState(null)
  const [loopDrag, setLoopDrag] = useState(null)
  const [editMode, setEditMode] = useState(false)
  const [editName, setEditName] = useState('')
  const [editSource, setEditSource] = useState('')
  const [editCat, setEditCat] = useState('')
  const [hoverTime, setHoverTime] = useState(null)
  const timelineElRef = useRef(null)
  const frameIntervalRef = useRef(null)

  useEffect(() => {
    if (!previewMaterial) {
      setVideoSrc('')
      setCurrentFrame(0)
      setTotalFrames(0)
      return
    }

    if (window.electronAPI && previewMaterial.fileName) {
      window.electronAPI.getMaterialPath(previewMaterial.fileName).then(p => {
        setVideoSrc(p)
        // Fallback: if file:// fails, try HTTP
        setTimeout(() => {
          const v = videoRef.current
          if (v && v.readyState === 0 && p.startsWith('file://')) {
            const httpUrl = p.replace(/file:\/\/\/.*materials\//, 'http://localhost:58099/')
            setVideoSrc(httpUrl)
          }
        }, 1000)
      })
    } else if (previewMaterial._file) {
      const url = URL.createObjectURL(previewMaterial._file)
      setVideoSrc(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [previewMaterial])

  const onVideoLoaded = useCallback((e) => {
    const video = e.target
    const duration = video.duration || 0
    let detectedFps = 30
    if (video.captureStream) {
      try {
        const tracks = video.captureStream().getVideoTracks()
        if (tracks.length > 0 && tracks[0]?.getSettings) {
          const settings = tracks[0].getSettings()
          if (settings.frameRate && settings.frameRate > 0) detectedFps = Math.round(settings.frameRate)
        }
      } catch (e) {}
    }
    setFps(detectedFps)
    setTotalFrames(Math.floor(duration * detectedFps))
  }, [])

  const stepFrame = useCallback((direction) => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    const step = 1 / fps
    const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + direction * step))
    video.currentTime = newTime
    setCurrentFrame(Math.floor(newTime * fps))
  }, [fps])

  const formatTime = (s) => {
    if (!s || !isFinite(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return m + ':' + String(sec).padStart(2, '0')
  }

  const seekToFrame = useCallback((frameNum) => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    // Force exact frame time
    const time = Math.max(0, Math.min(video.duration || 0, frameNum / fps))
    video.currentTime = time
    // Manually update frame number immediately
    setCurrentFrame(Math.floor(time * fps))
  }, [fps])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }, [])

  const timelineSeek = useCallback((e, el) => {
    const v = videoRef.current
    if (!v || !videoDur) return
    const rect = el.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = pct * videoDur
  }, [videoDur])

  const timelineMouseDown = useCallback((e) => {
    const v = videoRef.current
    if (!v || !videoDur) return
    setTimelineDrag(true)
    // Direct seek without React state overhead
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    v.currentTime = pct * videoDur
  }, [videoDur])

  useEffect(() => {
    if (!timelineDrag) return
    const el = timelineElRef.current
    const v = videoRef.current
    if (!el || !v) return
    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      v.currentTime = Math.max(0, Math.min(videoDur, ((e.clientX - rect.left) / rect.width) * videoDur))
    }
    const onUp = () => setTimelineDrag(false)
    document.addEventListener('mousemove', onMove, {passive: true})
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [timelineDrag, videoDur])

  useEffect(() => {
    if (!loopDrag || !videoDur) return
    const el = timelineElRef.current
    if (!el) return
    const onMove = (e) => {
      const rect = el.getBoundingClientRect()
      const t = Math.max(0, Math.min(videoDur, ((e.clientX - rect.left) / rect.width) * videoDur))
      setLoopRange(prev => {
        if (!prev) return null
        if (loopDrag === 'start' && t < prev.end) return { ...prev, start: t }
        if (loopDrag === 'end' && t > prev.start) return { ...prev, end: t }
        return prev
      })
    }
    const onUp = () => setLoopDrag(null)
    document.addEventListener('mousemove', onMove, {passive: true})
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [loopDrag, videoDur])

  const toggleFullscreen = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  useEffect(() => { const lr = loopRange; if (!lr || !playing) return; const v = videoRef.current; if (!v) return; const check = () => { if (v.currentTime >= lr.end) v.currentTime = lr.start }; v.addEventListener('timeupdate', check); return () => v.removeEventListener('timeupdate', check) }, [loopRange, playing])

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setCurrentFrame(Math.floor(video.currentTime * fps))
    setVideoTime(video.currentTime)
  }, [fps])

  const onDurationChange = useCallback((e) => {
    const video = e.target
    setVideoDur(video.duration || 0)
    setTotalFrames(Math.floor((video.duration || 0) * fps))
  }, [fps])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!previewMaterial) return
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(-1); return }
      if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(1); return }
      if (e.key === ' ') { e.preventDefault(); const v = videoRef.current; if (v) v.paused ? v.play() : v.pause(); return }
    }
    if (previewMaterial) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewMaterial, stepFrame])

  const close = () => {
    setDrawMode(false)
    setEditMode(false)
    dispatch({ type: 'SET_PREVIEW', payload: null })
  }

  if (!previewMaterial) return null

  const isVideo = previewMaterial.type === 'video'
  const isLink = ['bilibili', 'youtube', 'vimeo', 'link'].includes(previewMaterial.type)
  const isImage = previewMaterial.type === 'image'
  const category = state.categories.find(c => c.id === previewMaterial.categoryId)

  return (
    <div className={styles.overlay} onClick={drawMode ? undefined : close}>
      <div className={styles.content} onClick={e => e.stopPropagation()} ref={contentRef}>
        <div className={styles.header}>
          <h3>{previewMaterial.displayName || previewMaterial.originalName || '素材预览'}</h3>
          <div className={styles.headerActions}>
            {isVideo && (<>
              <button className={`${styles.drawToggle} ${drawMode ? styles.drawActive : ''}`}
                onClick={() => { setDrawMode(!drawMode); setEditMode(false) }} title="逐帧画笔 (D)">🖌️ 画笔</button>
              <button className={styles.drawToggle}
                onClick={() => {
                  const v = videoRef.current; if (!v) return
                  const c = document.createElement('canvas')
                  c.width = v.videoWidth; c.height = v.videoHeight
                  c.getContext('2d').drawImage(v, 0, 0)
                  const dataUrl = c.toDataURL('image/jpeg', 0.85)
                  dispatch({ type: 'UPDATE_MATERIAL', payload: { id: previewMaterial.id, thumbnail: dataUrl } })
                  const btn = document.activeElement; if (btn) { btn.textContent = '✅'; setTimeout(() => { btn.textContent = '🖼️ 设为封面' }, 800) }
                }} title="取当前帧为封面">🖼️ 设为封面</button>
              <button className={styles.drawToggle}
                onClick={async () => {
                  if (!window.electronAPI) { alert('导入 Maya 需要打包版（Electron）'); return }
                  if (!previewMaterial?.fileName) { alert('该素材无文件路径'); return }
                  const btn = document.activeElement
                  try {
                    const p = await window.electronAPI.getMaterialPath(previewMaterial.fileName)
                    const rawPath = (p || '').replace('file:///', '').replace(/\//g, '\\')
                    const outDir = rawPath.replace(/\.[^.]+$/, '_maya')
                    if (btn) btn.textContent = '⏳ 转换中…'
                    const res = await window.electronAPI.exportImageSequence(rawPath, outDir, 25)
                    if (res && res.ok) {
                      alert('✅ 已导出 ' + res.frameCount + ' 帧 PNG 序列到：\n' + res.outDir + '\n\n在 Maya 中运行 artshadow_ref.py，选择该文件夹即可导入参考')
                    } else {
                      alert('导出失败：' + ((res && res.error) || '未知错误'))
                    }
                  } catch(e) { alert('导出出错：' + (e.message || e)) }
                  if (btn) { btn.textContent = '🎬 导入 Maya'; setTimeout(() => {}, 0) }
                }} title="导出 PNG 序列帧供 Maya 参考素材导入">🎬 导入 Maya</button>
            </>)}
            <button className={`${styles.drawToggle} ${editMode ? styles.drawActive : ''}`}
              onClick={() => { setEditMode(!editMode); setDrawMode(false); if (!editMode) { setEditName(previewMaterial.displayName || previewMaterial.originalName || ''); setEditSource(previewMaterial.source || ''); setEditCat(previewMaterial.categoryId || '') } }} title="编辑信息">✏️ 编辑</button>
            <button className={styles.closeBtn} onClick={close}>✕</button>
          </div>
        </div>

        <div className={styles.media} onMouseDown={drawMode ? e => e.stopPropagation() : undefined}>
          {isLink ? (
            previewMaterial.embedUrl ? (
              <iframe
                src={previewMaterial.embedUrl}
                className={styles.video}
                style={{ border: 'none' }}
                allowFullScreen
                allow="autoplay; encrypted-media"
              />
            ) : (
              <div className={styles.placeholder}>
                <span style={{fontSize:'48px'}}>🔗</span>
                <p><a href={previewMaterial.url} target="_blank" rel="noreferrer">在浏览器中打开</a></p>
              </div>
            )
          ) : isVideo ? (
            videoSrc ? (
              <>
              <div className={styles.videoWrapper}>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className={styles.video}
                  onLoadedMetadata={onVideoLoaded}
                  onDurationChange={onDurationChange}
                  onTimeUpdate={onTimeUpdate}
                  onSeeked={onTimeUpdate}
                  onPlay={() => { setPlaying(true); const v=videoRef.current; if(v && previewMaterial.startTime!==undefined && v.currentTime < previewMaterial.startTime) v.currentTime = previewMaterial.startTime }}
                  onPause={() => setPlaying(false)}
                  onEnded={() => { setPlaying(false); const v=videoRef.current; if(v && previewMaterial.startTime!==undefined) { v.currentTime = previewMaterial.startTime; v.play() } }}
                  onTimeUpdate={(e) => { onTimeUpdate(e); const v=e.target; if(v && previewMaterial.endTime!==undefined && v.currentTime >= previewMaterial.endTime) { v.currentTime = previewMaterial.startTime||0 } }}
                />
              </div>
              {/* Control bar row 1: play, speed, time, volume, loop, fullscreen */}
              <div className={styles.controlBar}>
                <button className={styles.ctrlBtn} onClick={togglePlay} title={playing ? '暂停' : '播放'}>
                  {playing ? '⏸' : '▶'}
                </button>
                {/* Speed */}
                <select className={styles.ctrlSelect}
                  value={speed}
                  onChange={e => { const s=parseFloat(e.target.value); setSpeed(s); if(videoRef.current) videoRef.current.playbackRate = s }}
                  title="播放速度">
                  {[0.25,0.5,0.75,1,1.25,1.5,2].map(s => <option key={s} value={s}>{s}x</option>)}
                </select>
                {/* Volume */}
                <button className={styles.ctrlBtn} onClick={() => { const v=videoRef.current; if(v){ v.muted=!v.muted; setMuted(v.muted) } }} title={muted?'取消静音':'静音'}>
                  {muted ? '🔇' : '🔊'}
                </button>
                <input type="range" min="0" max="100" value={Math.round(volume*100)}
                  onChange={e => { const v = parseFloat(e.target.value)/100; setVolume(v); if(videoRef.current) videoRef.current.volume = v; setMuted(false) }}
                  className={styles.volSlider}
                  title="音量" />
                {/* Loop */}
                <button className={`${styles.ctrlBtn} ${loop ? styles.active : ''}`}
                  onClick={() => { const v=videoRef.current; if(v){ v.loop=!v.loop; setLoop(v.loop) } }} title="循环播放">
                  🔁
                </button>
                {/* Fullscreen */}
                <button className={styles.ctrlBtn} onClick={toggleFullscreen} title={isFullscreen?'退出全屏':'全屏'}>
                  ⛶
                </button>
              </div>
              {/* Control bar row 2: timeline + frame info + fps */}
              <div className={styles.controlBar2}>
                <div
                  ref={timelineElRef}
                  className={styles.timeline}
                  onMouseDown={timelineMouseDown}
                  onMouseMove={e => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const pct = (e.clientX - rect.left) / rect.width
                    const t = pct * videoDur
                    setHoverTime({ pct: pct * 100, time: t, frame: Math.floor(t * fps) })
                  }}
                  onMouseLeave={() => setHoverTime(null)}
                  title="拖拽或点击跳转"
                >
                  {hoverTime && (
                    <div className={styles.timelineTooltip} style={{left: hoverTime.pct + '%'}}>
                      {formatTime(hoverTime.time)} · 第{hoverTime.frame}帧
                    </div>
                  )}
                  {/* Frame tick marks */}
                  {totalFrames > 0 && [...Array(Math.min(totalFrames + 1, 200))].map((_, i) => {
                    const isMajor = i % 5 === 0
                    return (
                      <div key={i} className={isMajor ? styles.tickMajor : styles.tickMinor}
                        style={{left: (i/totalFrames*100)+'%'}} />
                    )
                  })}
                  {loopRange && loopRange.end > loopRange.start && (
                    <div className={styles.loopRangeBg} style={{
                      left: (loopRange.start/videoDur*100)+'%',
                      width: ((loopRange.end-loopRange.start)/videoDur*100)+'%'
                    }} />
                  )}
                  {loopRange && (<>
                    <div className={styles.loopMarker}
                      style={{left:(loopRange.start/videoDur*100)+'%'}}
                      onMouseDown={e=>{e.stopPropagation();e.preventDefault();setLoopDrag('start')}}>
                      <div className={styles.loopHandle} />
                    </div>
                    <div className={styles.loopMarker}
                      style={{left:(loopRange.end/videoDur*100)+'%'}}
                      onMouseDown={e=>{e.stopPropagation();e.preventDefault();setLoopDrag('end')}}>
                      <div className={styles.loopHandle} />
                    </div>
                  </>)}
                  <div className={styles.timelineFill}
                    style={{width: videoDur ? (videoTime/videoDur*100)+'%' : '0%'}} />
                  <div className={styles.timelineThumb}
                    style={{left: videoDur ? (videoTime/videoDur*100)+'%' : '0%'}} />
                </div>
                <span className={styles.ctrlInfo}>{fps}fps · {formatTime(videoDur)}</span>
                <button className={styles.ctrlBtn} onClick={() => stepFrame(-1)} title="上一帧 (←)">⏪</button>
                <span className={styles.ctrlFrame}>
                  {totalFrames > 0 ? `${currentFrame}/${totalFrames}f` : formatTime(videoTime)}
                </span>
                <button className={styles.ctrlBtn} onClick={() => stepFrame(1)} title="下一帧 (→)">⏩</button>
              </div>
              {drawMode && (
                <DrawingTool
                  videoRef={videoRef}
                  currentFrame={currentFrame}
                  fps={fps}
                  enabled={drawMode}
                  onToggle={() => setDrawMode(false)}
                  onSeek={seekToFrame}
                />
              )}
              </>
            ) : (
              <div className={styles.placeholder}>
                <span style={{fontSize:'48px'}}>🎬</span>
                <p>视频加载中...</p>
              </div>
            )
          ) : (
            videoSrc ? (
              <img src={videoSrc} alt={previewMaterial.originalName} className={styles.image} />
            ) : (
              <div className={styles.placeholder}>
                <span style={{fontSize:'48px'}}>🖼️</span>
                <p>图片预览</p>
              </div>
            )
          )}
        </div>

        {!isFullscreen && (<div className={styles.info}>
          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>来源</span>
              <span className={styles.metaValue}>{previewMaterial.source || '未设置'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>分类</span>
              <span className={styles.metaValue}>{category?.name || '未分类'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>大小</span>
              <span className={styles.metaValue}>
                {previewMaterial.size
                  ? previewMaterial.size < 1024 * 1024
                    ? Math.round(previewMaterial.size / 1024) + ' KB'
                    : (previewMaterial.size / (1024 * 1024)).toFixed(1) + ' MB'
                  : '—'}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>导入时间</span>
              <span className={styles.metaValue}>
                {previewMaterial.importedAt
                  ? new Date(previewMaterial.importedAt).toLocaleString('zh-CN')
                  : '—'}
              </span>
            </div>
          </div>
          {(previewMaterial.tags || []).length > 0 && (
            <div className={styles.previewTags}>
              <span className={styles.metaLabel}>标签</span>
              <div className={styles.tagRow}>
                {(previewMaterial.tags || []).map(tag => (
                  <span key={tag} className={styles.tag}>{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>)}
      {editMode && (
        <div className={styles.editSidebar}>
          <div className={styles.editSideTitle}>✏️ 编辑素材</div>
          <div className={styles.editSideBody}>
            <div>
              <label>文件名</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="输入文件名" />
            </div>
            <div>
              <label>来源</label>
              <input value={editSource||''} onChange={e => setEditSource(e.target.value)} placeholder="来源" />
            </div>
            <div>
              <label>分类</label>
              <select value={editCat||''} onChange={e => setEditCat(e.target.value)}>
                <option value="">无分类</option>
                {state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className={styles.drawToggle} onClick={() => {
                dispatch({ type: 'UPDATE_MATERIAL', payload: { id: previewMaterial.id, displayName: editName.trim()||previewMaterial.originalName, source: editSource.trim(), categoryId: editCat || null } })
                setEditMode(false)
              }}>保存</button>
              <button className={styles.drawToggle} onClick={() => setEditMode(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}