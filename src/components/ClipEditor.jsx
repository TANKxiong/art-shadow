import React, { useState, useRef, useEffect } from 'react'
import styles from '../styles/ClipEditor.module.css'

// 剪映风格剪辑编辑器 - 阶段1：整体布局
// 左素材面板 | 中预览区 | 右调节面板 | 底轨道区
export default function ClipEditor({ roomMaterial, roomMats, onImport }) {
  const [activePanel, setActivePanel] = useState('media') // media | audio | text | sticker
  const [selectedClipId, setSelectedClipId] = useState(null)
  const [canvasRatio, setCanvasRatio] = useState('16:9')
  const [playhead, setPlayhead] = useState(0) // 秒
  const [clipPlaying, setClipPlaying] = useState(false)
  const clipPlayingRef = useRef(false)
  useEffect(() => { clipPlayingRef.current = clipPlaying }, [clipPlaying])
  const playheadRef = useRef(0)
  const mainVideoRef = useRef(null)
  const mainVideoBRef = useRef(null) // 双缓冲备用 video
  const activeVideoRef = useRef(null) // 当前显示/播放的 video（A 或 B）
  const [showB, setShowB] = useState(false) // true = B 显示，false = A 显示
  const getActiveVideo = () => (showB ? mainVideoBRef.current : mainVideoRef.current)
  const pipVideoRef = useRef(null)
  const [mainSrc, setMainSrc] = useState(null)
  const [pipSrc, setPipSrc] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [clips, setClips] = useState(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('artshadow-clips') || '[]')
      // 兼容旧数据：只有轨道无效的片段才归入 v1（不再强制改所有片段）
      return arr.map(c => ({ ...c, track: (c.track && /^v\d/.test(c.track)) ? c.track : 'v1' }))
    } catch { return [] }
  })
  const saveClips = (arr) => { setClips(arr); localStorage.setItem('artshadow-clips', JSON.stringify(arr)) }
  // 撤销历史
  const undoStackRef = useRef([])
  const undoLockRef = useRef(false) // 拖拽期间不逐帧记录，松手时记录一次
  const pushUndo = (prev) => {
    if (undoLockRef.current) return
    undoStackRef.current.push(prev)
    if (undoStackRef.current.length > 50) undoStackRef.current.shift()
  }
  const setClipsWithUndo = (arr) => {
    pushUndo(clips)
    saveClips(arr)
  }
  const clipTotal = clips.reduce((a, c) => a + (c.dur || 0), 0)
  // 轨道：动态视频轨列表（剪映风格，可添加多条同时编辑）
  const [tracks, setTracks] = useState(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('artshadow-tracks') || '[]')
      const clipsArr = JSON.parse(localStorage.getItem('artshadow-clips') || '[]')
      // 清理：只保留有素材引用的轨道（主轨 v1 除外，永远保留）
      const usedKeys = new Set(clipsArr.map(c => c.track))
      const kept = arr.filter(t => t.key === 'v1' || usedKeys.has(t.key))
      // 确保主轨 v1 存在
      if (!kept.some(t => t.key === 'v1')) kept.unshift({ key: 'v1', label: '视频轨 1' })
      return kept
    } catch { return [{ key: 'v1', label: '视频轨 1' }] }
  })
  const saveTracks = (arr) => { setTracks(arr); localStorage.setItem('artshadow-tracks', JSON.stringify(arr)) }
  // 轨道1（主轨）固定底部，其他轨道在其上方
  const TRACK1 = 'v1'
  const orderedTracks = [...tracks.filter(t => t.key !== TRACK1), ...tracks.filter(t => t.key === TRACK1)]
  const nextTrackNum = () => {
    // 基于当前有素材的轨道数计算（残留空轨不占编号），主轨固定 1
    const visible = tracks.filter(t => t.key === TRACK1 || clips.some(c => c.track === t.key)).length
    return visible + 1
  }
  const makeTrack = () => ({ key: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), label: '视频轨 ' + nextTrackNum() })
  const addTrack = () => { saveTracks([...tracks, makeTrack()]) }
  const removeTrack = (key) => {
    if (tracks.length <= 1) return
    // 移除该轨道上的片段
    saveClips(clips.filter(c => c.track !== key))
    saveTracks(tracks.filter(t => t.key !== key))
  }

  // 片段起始时间：基于 clip.start 字段（自由定位），无则按顺序累加兜底
  const clipStart = (idx, track) => {
    const tc = clips.filter(c => c.track === track)
    const c = tc[idx]
    if (c && c.start != null) return c.start
    return tc.slice(0, idx).reduce((a, x) => a + (x.dur || 0), 0)
  }
  const trackEnd = (track) => {
    const tc = clips.filter(c => c.track === track)
    let end = 0
    tc.forEach(c => { const s = (c.start != null ? c.start : 0) + (c.dur || 0); if (s > end) end = s })
    return end
  }
  const clipAt = (t, track) => {
    const tc = clips.filter(c => c.track === track)
    for (let i = 0; i < tc.length; i++) {
      const s = tc[i].start != null ? tc[i].start : 0
      if (t >= s && t < s + (tc[i].dur || 0)) return { clip: tc[i], idx: i, offset: t - s, list: tc }
    }
    return null
  }
  // 最上层轨道：从顶部（orderedTracks 顺序）往下找第一个在 t 时间有素材的轨道片段
  const topClipAt = (t) => {
    for (const tr of orderedTracks) {
      const hit = clipAt(t, tr.key)
      if (hit) return hit
    }
    return null
  }
  // 1秒 = 100px 时间轴缩放
  const [tickScale, setTickScale] = useState(100)
  const TICK = tickScale
  // 吸附开关（默认开）
  const [snapOn, setSnapOn] = useState(() => { try { return localStorage.getItem('artshadow-snap') !== '0' } catch { return true } })
  // 可拖拽面板尺寸（剪映风格）
  const [leftW, setLeftW] = useState(240)      // 左侧素材面板宽度
  const [rightW, setRightW] = useState(240)    // 右侧调节面板宽度
  const [trackH, setTrackH] = useState(180)    // 底部轨道区高度
  const [resizing, setResizing] = useState(null) // 'left' | 'right' | 'track'
  const resizeStart = useRef({ x: 0, y: 0, w: 0 })
  // 片段拖拽：移动 / 裁剪
  const clipDragRef = useRef(null) // { id, mode:'move'|'trimL'|'trimR', startX, startDur, startTrim }
  const [dragGhost, setDragGhost] = useState(null) // { id, dx, dy } 拖动中视觉跟随
  const dragData = useRef(null)
  const trackAreaRef = useRef(null)

  useEffect(() => {
    if (!resizing) return
    const onMove = (e) => {
      const dx = e.clientX - resizeStart.current.x
      const dy = e.clientY - resizeStart.current.y
      if (resizing === 'left') setLeftW(Math.max(140, Math.min(420, resizeStart.current.w + dx)))
      if (resizing === 'right') setRightW(Math.max(160, Math.min(420, resizeStart.current.w - dx)))
      if (resizing === 'track') setTrackH(Math.max(110, Math.min(window.innerHeight * 0.6, resizeStart.current.w - dy)))
    }
    const onUp = () => setResizing(null)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [resizing])

  const startResize = (which, e) => {
    e.preventDefault()
    resizeStart.current = {
      x: e.clientX, y: e.clientY,
      w: which === 'left' ? leftW : which === 'right' ? rightW : trackH
    }
    setResizing(which)
  }

  const setPlayheadFromX = (e, pauseAndSeek = false) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const sec = (e.clientX - rect.left - 60) / TICK
    const val = Math.max(0, Math.min(clipTotal, sec))
    playheadRef.current = val
    setPlayhead(val)
    if (pauseAndSeek) {
      // 点击轨道：立即跳转该时间点并暂停
      const v = getActiveVideo()
      if (v) v.pause()
      if (clipPlayingRef.current) setClipPlaying(false)
      loadMainClip(val)
      loadPipClip(val)
    } else if (!clipPlaying) {
      // 暂停状态下，拖动播放头时同步预览画面
      loadMainClip(val)
      loadPipClip(val)
    }
  }

  const resolveSrc = async (m) => {
    if (!m) return null
    if (window.electronAPI && m.fileName) return (await window.electronAPI.getMaterialPath(m.fileName)) || null
    if (m._file instanceof Blob) return URL.createObjectURL(m._file)
    if (m._blobUrl) return m._blobUrl
    if (m.embedUrl) return m.embedUrl
    return null
  }

  const mainSrcKeyRef = useRef(null) // 当前已加载的素材 id（避免重复重载闪烁）
  const standbyReadyRef = useRef(null) // standby 已预加载的目标时间
  // 预加载下一个片段到备用 video（不交换，播放中提前准备）
  const prepareNextClip = async (t) => {
    const hit = topClipAt(t)
    if (!hit) return
    if (mainSrcKeyRef.current === hit.clip.materialId) return // 同一素材无需预载
    const m = roomMaterial(hit.clip.materialId)
    const src = await resolveSrc(m)
    if (!src) return
    const standbyV = showB ? mainVideoRef.current : mainVideoBRef.current
    if (!standbyV) return
    const targetT = hit.offset + (hit.clip.trimStart || 0)
    standbyReadyRef.current = null
    await new Promise(res => {
      let done = false
      const finish = () => { if (!done) { done = true; res() } }
      standbyV.onloadeddata = () => { try { standbyV.currentTime = targetT } catch(e) {} ; finish() }
      standbyV.onerror = finish
      standbyV.src = src
      standbyV.load()
      setTimeout(finish, 800)
    })
    standbyReadyRef.current = targetT
  }
  // 交换显示：将已预加载的 standby 变为当前显示（瞬时无黑屏）
  const swapToNext = async (t) => {
    const hit = topClipAt(t)
    if (!hit) return hit
    const standbyV = showB ? mainVideoRef.current : mainVideoBRef.current
    if (!standbyV) return hit
    // 若未预加载，先立即加载
    if (standbyReadyRef.current === null) {
      const m = roomMaterial(hit.clip.materialId)
      const src = await resolveSrc(m)
      if (src) {
        standbyV.src = src
        standbyV.load()
      }
    }
    const targetT = hit.offset + (hit.clip.trimStart || 0)
    if (clipPlayingRef.current) { try { await standbyV.play() } catch(e) {} }
    else { standbyV.pause() }
    try { standbyV.currentTime = targetT } catch(e) {}
    standbyReadyRef.current = null
    mainSrcKeyRef.current = hit.clip.materialId
    setMainSrc(await (async () => { const mm = roomMaterial(hit.clip.materialId); const s = await resolveSrc(mm); return s })())
    setShowB(!showB)
    return hit
  }
  // 加载播放头位置对应的最上层视频片段（上方轨道覆盖下方）
  const loadMainClip = async (t, force = false, seek = true) => {
    const hit = topClipAt(t)
    if (!hit) return hit
    const m = roomMaterial(hit.clip.materialId)
    const src = await resolveSrc(m)
    if (!src) return hit
    const needReload = force || mainSrcKeyRef.current !== hit.clip.materialId
    const activeV = showB ? mainVideoBRef.current : mainVideoRef.current
    if (!needReload) {
      // 同一素材：直接 seek
      if (activeV && seek) activeV.currentTime = hit.offset + (hit.clip.trimStart || 0)
      return hit
    }
    // 素材切换（用户点击跳转等）：走预加载+交换
    return swapToNext(t)
  }
  // 加载画中画片段
  const loadPipClip = async (t) => {
    const hit = clipAt(t, 'pip')
    const v = pipVideoRef.current
    if (!hit || !v) { if (v) v.pause(); setPipSrc(null); return }
    const m = roomMaterial(hit.clip.materialId)
    const src = await resolveSrc(m)
    if (!src) return
    if (pipSrc !== src) { setPipSrc(src); v.src = src }
    v.currentTime = hit.offset + (hit.clip.trimStart || 0)
    try { v.play() } catch(e) {}
  }

  const togglePlay = async () => {
    const v = getActiveVideo()
    if (!v) return
    if (clipPlaying) { v.pause(); if (pipVideoRef.current) pipVideoRef.current.pause(); setClipPlaying(false); return }
    // 必须有素材才能播放
    if (clips.length === 0) { alert('请先把素材拖到视频轨'); return }
    if (playheadRef.current >= clipTotal - 0.05) { playheadRef.current = 0; setPlayhead(0) }
    setClipPlaying(true)
    // 素材未变时恢复播放（不 seek，避免回退几帧）；素材变了才定位
    const top = topClipAt(playheadRef.current)
    const sameSrc = top && mainSrcKeyRef.current === top.clip.materialId && v.src
    await loadMainClip(playheadRef.current, false, !sameSrc)
    await loadPipClip(playheadRef.current)
    try { await v.play() } catch(e) {}
  }

  // 播放中：主视频 timeupdate → 更新播放头，片段结束切下一个
  useEffect(() => {
    const v = getActiveVideo()
    if (!v || !clipPlaying) return
    const onTime = () => {
      const hit = topClipAt(playheadRef.current)
      if (!hit) { setClipPlaying(false); v.pause(); return }
      const clipStartT = hit.clip.start != null ? hit.clip.start : 0
      const local = v.currentTime - (hit.clip.trimStart || 0)
      // 播放到 70%：提前预加载下一个素材（双缓冲，切换无缝）
      if (local >= (hit.clip.dur || 0) * 0.7 && local < (hit.clip.dur || 0) - 0.06) {
        const nextT = clipStartT + (hit.clip.dur || 0)
        const nextHit = topClipAt(nextT)
        if (nextHit && mainSrcKeyRef.current !== nextHit.clip.materialId) {
          prepareNextClip(nextT)
        }
      }
      if (local >= (hit.clip.dur || 0) - 0.06) {
        // 当前片段结束 → 跳到片段末尾，无缝切下一个最上层片段
        const ns = clipStartT + (hit.clip.dur || 0)
        if (ns >= clipTotal - 0.05) { setClipPlaying(false); v.pause(); playheadRef.current = clipTotal; setPlayhead(clipTotal) }
        else {
          playheadRef.current = ns; setPlayhead(ns)
          swapToNext(ns).then(() => {
            const vv = getActiveVideo()
            if (vv && clipPlayingRef.current) { try { vv.play() } catch(e) {} }
          })
          loadPipClip(ns)
        }
        return
      }
      const absT = clipStartT + local
      playheadRef.current = absT; setPlayhead(absT)
      loadPipClip(absT)
    }
    v.addEventListener('timeupdate', onTime)
    return () => v.removeEventListener('timeupdate', onTime)
  }, [clipPlaying, clips, showB])

  // 读取素材真实时长（视频用 duration；图片默认 5s）
  const getMediaDuration = async (m) => {
    if (!m) return 5
    if (m.type === 'image') return 5
    const src = await resolveSrc(m)
    if (!src) return 5
    return new Promise(res => {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      let done = false
      const finish = (d) => { if (!done) { done = true; res(d) } }
      v.onloadedmetadata = () => finish(v.duration && isFinite(v.duration) ? v.duration : 5)
      v.onerror = () => finish(5)
      v.src = src
      setTimeout(() => finish(5), 3000) // 超时兜底
    })
  }

  const addClip = async (mId, track = TRACK1) => {
    const m = roomMaterial(mId)
    if (!m) return
    const dur = await getMediaDuration(m)
    // 新片段放在该轨道末尾（自动拼接）
    const start = trackEnd(track)
    setClipsWithUndo([...clips, { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), materialId: mId, dur, start, trimStart: 0, track, opacity: 1, speed: 1 }])
  }

  // 拖入素材：按落点垂直位置确定目标轨道，上方/下方空隙自动新建轨道（剪映式）
  const onDropToTrack = (e) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('materialId')
    if (!id) return
    const rows = Array.from(document.querySelectorAll('[data-track]'))
    const newTrackObj = () => makeTrack()
    // 无可见轨道 → 放第一条轨道
    if (rows.length === 0) { addClip(id, TRACK1); return }
    // 检查是否落在某条轨道内部
    for (const el of rows) {
      const r = el.getBoundingClientRect()
      if (e.clientY >= r.top && e.clientY <= r.bottom) { addClip(id, el.dataset.track); return }
    }
    // 落在所有轨道上方 → 新建轨道插到主轨（轨道1）上方
    const topRow = rows[0].getBoundingClientRect()
    if (e.clientY < topRow.top) {
      const nt = newTrackObj()
      // 插到 v1 之前（v1 保持底部）
      saveTracks([...tracks.filter(t => t.key !== TRACK1), nt, ...tracks.filter(t => t.key === TRACK1)])
      addClip(id, nt.key)
      return
    }
    // 落在所有轨道下方 → 同样在轨道1上方新建（轨道1始终在底部）
    const nt2 = newTrackObj()
    saveTracks([...tracks.filter(t => t.key !== TRACK1), nt2, ...tracks.filter(t => t.key === TRACK1)])
    addClip(id, nt2.key)
  }
  // 键盘快捷键：空格播放/暂停，左右键逐帧
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); return }
      if (e.code === 'ArrowLeft') {
        e.preventDefault()
        const v = getActiveVideo()
        const nt = Math.max(0, playheadRef.current - 0.2)
        playheadRef.current = nt; setPlayhead(nt)
        if (v) { v.pause(); loadMainClip(nt); loadPipClip(nt) }
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault()
        const v = getActiveVideo()
        const nt = Math.min(clipTotal, playheadRef.current + 0.2)
        playheadRef.current = nt; setPlayhead(nt)
        if (v) { v.pause(); loadMainClip(nt); loadPipClip(nt) }
      }
      // Delete / Backspace 删除选中片段（剪映风格）
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedClipId) { e.preventDefault(); removeClip(selectedClipId) }
      }
      // Ctrl+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault()
        const prev = undoStackRef.current.pop()
        if (prev) { saveClips(prev); setSelectedClipId(null) }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const removeClip = (id) => { setClipsWithUndo(clips.filter(c => c.id !== id)); if (selectedClipId === id) setSelectedClipId(null) }

  // 片段拖拽：move（水平移动+跨轨） / trimL / trimR（首尾裁剪）
  const [clipDragging, setClipDragging] = useState(false)
  const onClipDragStart = (e, id, mode) => {
    e.preventDefault(); e.stopPropagation()
    clipDragRef.current = { id, mode, startX: e.clientX, startY: e.clientY, startDur: 0, startTrim: 0, startIdx: 0, startClips: JSON.parse(JSON.stringify(clips)) }
    undoLockRef.current = true // 拖拽期间不逐帧记录历史
    setClipDragging(true) // 触发 effect 重新注册监听
    const c = clips.find(x => x.id === id)
    if (c) { clipDragRef.current.startDur = c.dur; clipDragRef.current.startTrim = c.trimStart || 0 }
  }
  useEffect(() => {
    if (!clipDragRef.current) return
    const d = clipDragRef.current
    const onMove = (e) => {
      const dxPx = e.clientX - d.startX
      const dyPx = e.clientY - d.startY
      const cur = clips.find(x => x.id === d.id)
      if (!cur) return
      const secPerPx = 1 / TICK
      if (d.mode === 'trimL') {
        const delta = dxPx * secPerPx
        const newDur = Math.max(0.3, d.startDur - delta)
        const trimDelta = (d.startDur - newDur)
        updateClip(d.id, { dur: newDur, trimStart: Math.max(0, (d.startTrim || 0) + trimDelta) })
      } else if (d.mode === 'trimR') {
        const delta = dxPx * secPerPx
        updateClip(d.id, { dur: Math.max(0.3, d.startDur + delta) })
      } else if (d.mode === 'move') {
        // 拖动中：只更新视觉偏移（片段跟随鼠标），不提交数据
        setDragGhost({ id: d.id, dx: dxPx, dy: dyPx })
      }
    }
    const onUp = (e) => {
      const d = clipDragRef.current
      if (d) {
        undoLockRef.current = false
        // move 模式：松手时提交最终位置（跨轨 + 水平偏移）
        if (d.mode === 'move') {
          const secPerPx = 1 / TICK
          const cur = clips.find(x => x.id === d.id)
          if (cur) {
            const trackEls = Array.from(document.querySelectorAll('[data-track]'))
            let targetTrack = cur.track
            for (const el of trackEls) {
              const r = el.getBoundingClientRect()
              if (e.clientY >= r.top && e.clientY <= r.bottom) { targetTrack = el.dataset.track; break }
            }
            // 落在所有轨道上方空隙 → 自动新建轨道（插主轨上方）；下方不建轨
            if (trackEls.length > 0) {
              const fr = trackEls[0].getBoundingClientRect()
              if (e.clientY < fr.top - 8) {
                const nt = makeTrack()
                saveTracks([...tracks.filter(t => t.key !== TRACK1), nt, ...tracks.filter(t => t.key === TRACK1)])
                targetTrack = nt.key
              }
            }
            const delta = (e.clientX - d.startX) * secPerPx
            // 新位置 = 原始 start + 水平偏移（含吸附）
            let newStart = Math.max(0, (cur.start ?? 0) + delta)
            if (snapOn) {
              // 吸附目标：同轨其他片段的开始/结束点 + 整秒刻度
              const candidates = [0]
              clips.filter(c => c.track === targetTrack && c.id !== cur.id).forEach(c => {
                candidates.push(c.start ?? 0)
                candidates.push((c.start ?? 0) + (c.dur || 0))
              })
              let best = newStart, bestDist = 8 / TICK // 8px 吸附阈值
              candidates.forEach(pt => {
                const dist = Math.abs(newStart - pt)
                if (dist < bestDist) { bestDist = dist; best = pt }
              })
              // 整秒吸附
              const nearestSec = Math.round(newStart)
              if (Math.abs(newStart - nearestSec) < bestDist) best = nearestSec
              newStart = Math.max(0, best)
            }
            const changed = cur.track !== targetTrack || Math.abs((cur.start ?? 0) - newStart) > 0.001
            if (changed) {
              if (JSON.stringify(d.startClips) !== JSON.stringify(clips)) {
                undoStackRef.current.push(d.startClips)
                if (undoStackRef.current.length > 50) undoStackRef.current.shift()
              }
              updateClip(d.id, { track: targetTrack, start: newStart })
            }
          }
          setDragGhost(null)
        } else {
          // trim 模式：记录一次撤销（拖拽前状态）
          if (d.startClips && JSON.stringify(d.startClips) !== JSON.stringify(clips)) {
            undoStackRef.current.push(d.startClips)
            if (undoStackRef.current.length > 50) undoStackRef.current.shift()
          }
        }
      }
      clipDragRef.current = null
      setClipDragging(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [clips, clipDragging])

  // 工具栏：分割 / 复制 / 倒放 / 删除
  const splitAt = () => {
    const sel = clips.find(c => c.id === selectedClipId)
    if (!sel) { alert('请先选中一个片段'); return }
    // 分割点在片段内部时间（用播放头相对片段起点）
    const trackList = clips.filter(c => c.track === sel.track)
    const myIdx = trackList.findIndex(c => c.id === sel.id)
    const startT = trackList.slice(0, myIdx).reduce((a, c) => a + (c.dur || 0), 0)
    const local = playheadRef.current - startT
    if (local < 0.3 || local > sel.dur - 0.3) { alert('播放头需在片段中间位置'); return }
    const left = { ...sel, id: Date.now().toString(36) + 'L', dur: local }
    const right = { ...sel, id: Date.now().toString(36) + 'R', dur: sel.dur - local, trimStart: (sel.trimStart || 0) + local }
    const next = []
    clips.forEach(c => {
      if (c.id === sel.id) { next.push(left, right) } else { next.push(c) }
    })
    setClipsWithUndo(next)
  }
  const duplicateClip = () => {
    const sel = clips.find(c => c.id === selectedClipId)
    if (!sel) return
    setClipsWithUndo([...clips, { ...sel, id: Date.now().toString(36) + 'D' }])
  }
  const reverseClip = () => {
    const sel = clips.find(c => c.id === selectedClipId)
    if (!sel) return
    updateClip(sel.id, { reversed: !sel.reversed })
  }
  // 更新片段参数
  const updateClip = (id, patch) => { setClipsWithUndo(clips.map(c => c.id === id ? { ...c, ...patch } : c)) }
  const selectedClip = clips.find(c => c.id === selectedClipId)

  // 导出：逐帧渲染（视频轨+覆盖层）→ Electron用FFmpeg / 网页用MediaRecorder
  const exportVideo = async () => {
    if (exporting) return
    if (clips.length === 0) { alert('轨道为空，先添加素材'); return }
    setExporting(true)
    try {
      // 计算画布尺寸
      let W = 1280, H = 720
      if (canvasRatio === '9:16') { W = 720; H = 1280 }
      else if (canvasRatio === '1:1') { W = 720; H = 720 }
      else if (canvasRatio === '4:3') { W = 960; H = 720 }
      const canvas = document.createElement('canvas')
      canvas.width = W; canvas.height = H
      const ctx = canvas.getContext('2d')
      const fps = 25
      const totalFrames = Math.max(1, Math.round(clipTotal * fps))
      const frames = []
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))
      const seekVideo = (v, t) => new Promise(res => {
        if (!v) { res(); return }
        let done = false
        const finish = () => { if (!done) { done = true; res() } }
        v.onseeked = finish; v.onloadeddata = finish
        try { v.currentTime = t } catch(e) { finish() }
        setTimeout(finish, 150)
      })
      const drawContain = (v, dx, dy, dw, dh, opacity = 1) => {
        if (!v || !v.videoWidth) return
        ctx.save(); ctx.globalAlpha = opacity
        const s = Math.min(dw / v.videoWidth, dh / v.videoHeight)
        const w = v.videoWidth * s, h = v.videoHeight * s
        ctx.drawImage(v, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h)
        ctx.restore()
      }
      // 预加载所有涉及的主视频/画中画片段源
      const loadClipInto = async (v, hit) => {
        const m = roomMaterial(hit.clip.materialId)
        const src = await resolveSrc(m)
        if (src && v.src !== src) { v.src = src; await new Promise(r => { v.onloadeddata = r; setTimeout(r, 500) }) }
      }
      const tmpVideo = document.createElement('video')
      const tmpPip = document.createElement('video')
      tmpVideo.muted = true; tmpPip.muted = true
      for (let f = 0; f < totalFrames; f++) {
        const t = f / fps
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
        const vHit = clipAt(t, TRACK1)
        if (vHit) {
          await loadClipInto(tmpVideo, vHit)
          await seekVideo(tmpVideo, vHit.offset + (vHit.clip.trimStart || 0))
          drawContain(tmpVideo, 0, 0, W, H)
        }
        const pHit = clipAt(t, 'pip')
        if (pHit) {
          await loadClipInto(tmpPip, pHit)
          await seekVideo(tmpPip, pHit.offset + (pHit.clip.trimStart || 0))
          drawContain(tmpPip, W * 0.55, H * 0.55, W * 0.4, H * 0.4, pHit.clip.opacity ?? 1)
        }
        const tHit = clipAt(t, 'text')
        if (tHit) {
          ctx.save(); ctx.globalAlpha = tHit.clip.opacity ?? 1
          ctx.fillStyle = '#fff'; ctx.font = `bold ${H * 0.06}px sans-serif`; ctx.textAlign = 'center'
          ctx.fillText(roomMaterial(tHit.clip.materialId)?.displayName || '文字', W / 2, H * 0.15)
          ctx.restore()
        }
        const sHit = clipAt(t, 'sticker')
        if (sHit) {
          ctx.save(); ctx.globalAlpha = sHit.clip.opacity ?? 1
          ctx.font = `${H * 0.15}px sans-serif`; ctx.textAlign = 'center'
          ctx.fillText('⭐', W * 0.85, H * 0.2)
          ctx.restore()
        }
        frames.push(canvas.toDataURL('image/jpeg', 0.92))
        if (f % 10 === 0) { setExportProgress(Math.round(f / totalFrames * 100)); await sleep(0) }
      }
      setExportProgress(100)
      // Electron：FFmpeg 合成；网页：MediaRecorder 回退
      if (window.electronAPI && window.electronAPI.exportFrames) {
        const res = await window.electronAPI.exportFrames(frames, fps)
        if (res && res.ok) alert('✅ 已保存：' + res.path)
        else if (res && res.canceled) {}
        else alert('导出失败：' + ((res && res.error) || '未知错误'))
      } else {
        // 网页：逐帧动画 + MediaRecorder
        const stream = canvas.captureStream(fps)
        let rec
        try { rec = new MediaRecorder(stream, { mimeType: 'video/webm' }) } catch(e) { alert('当前环境不支持导出'); return }
        const chunks = []
        rec.ondataavailable = e => e.data.size && chunks.push(e.data)
        rec.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = '画影客剪辑_' + Date.now() + '.webm'; a.click()
          setTimeout(() => URL.revokeObjectURL(url), 5000)
        }
        rec.start(200)
        for (let f = 0; f < totalFrames; f++) {
          const t = f / fps
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
          const vHit = clipAt(t, TRACK1)
          if (vHit) {
            await loadClipInto(tmpVideo, vHit); await seekVideo(tmpVideo, vHit.offset + (vHit.clip.trimStart || 0))
            drawContain(tmpVideo, 0, 0, W, H)
          }
          const pHit = clipAt(t, 'pip')
          if (pHit) {
            await loadClipInto(tmpPip, pHit); await seekVideo(tmpPip, pHit.offset + (pHit.clip.trimStart || 0))
            drawContain(tmpPip, W * 0.55, H * 0.55, W * 0.4, H * 0.4, pHit.clip.opacity ?? 1)
          }
          await sleep(1000 / fps / 2)
        }
        rec.stop()
      }
    } catch(e) {
      alert('导出出错：' + (e.message || e))
    } finally {
      setExporting(false)
    }
  }

  const panelTabs = [
    { key: 'media', icon: '🎬', name: '素材' },
    { key: 'audio', icon: '🎵', name: '音频' },
    { key: 'text', icon: '🅣', name: '文字' },
    { key: 'sticker', icon: '🎀', name: '贴纸' }
  ]

  return (
    <div className={styles.editor} style={{ gridTemplateColumns: `${leftW}px 1fr ${rightW}px`, gridTemplateRows: `1fr ${trackH}px` }}>
      {/* 左侧素材面板 */}
      <aside className={styles.leftPanel}>
        <div className={styles.panelTabs}>
          {panelTabs.map(t => (
            <button key={t.key} className={`${styles.panelTab} ${activePanel===t.key?styles.panelTabOn:''}`}
              onClick={()=>setActivePanel(t.key)} title={t.name}>{t.icon}</button>
          ))}
        </div>
        <div className={styles.panelBody}>
          {activePanel === 'media' && (
            <>
              <div className={styles.panelHeader}>
                <span>项目素材</span>
                <button className={styles.importBtn} onClick={onImport}>+ 导入</button>
              </div>
              <div className={styles.matGrid}>
                {roomMats.map(id => {
                  const m = roomMaterial(id)
                  if (!m) return null
                  return (
                    <div key={id} className={styles.matItem} draggable
                      onDragStart={e => e.dataTransfer.setData('materialId', id)}>
                      <span className={styles.matIcon}>{m.type === 'video' ? '🎬' : '🖼️'}</span>
                      <span className={styles.matName}>{(m.displayName || m.originalName || '素材').slice(0, 10)}</span>
                      <button className={styles.matAdd} onClick={()=>addClip(id)}>+</button>
                    </div>
                  )
                })}
                {roomMats.length === 0 && <div className={styles.emptyHint}>导入素材后显示在这里</div>}
              </div>
            </>
          )}
          {activePanel === 'audio' && <div className={styles.emptyHint}>🎵 音频素材（开发中）</div>}
          {activePanel === 'text' && <div className={styles.emptyHint}>🅣 文字功能后续版本开放</div>}
          {activePanel === 'sticker' && <div className={styles.emptyHint}>🎀 贴纸功能后续版本开放</div>}
        </div>
      </aside>
      <div className={styles.resizeH} style={{ left: leftW, height: `calc(100% - ${trackH}px)` }} onMouseDown={e=>startResize('left', e)} title="拖拽调整素材面板宽度" />

      {/* 中间预览区 */}
      <main className={styles.centerArea}>
        <div className={styles.previewBar}>
          <span className={styles.ratioLabel}>画布</span>
          {['16:9','9:16','1:1','4:3'].map(r => (
            <button key={r} className={`${styles.ratioBtn} ${canvasRatio===r?styles.ratioOn:''}`}
              onClick={()=>setCanvasRatio(r)}>{r}</button>
          ))}
        </div>
        <div className={styles.previewStage}>
          <div className={styles.previewBox} style={{
            aspectRatio: canvasRatio==='9:16' ? '9 / 16' : canvasRatio==='1:1' ? '1 / 1' : canvasRatio==='4:3' ? '4 / 3' : '16 / 9'
          }}>
            {/* 主视频轨（轨道1） */}
            {clips.length > 0 ? (
              <>
              <video ref={mainVideoRef} muted playsInline className={`${styles.mainVideo} ${showB?styles.videoHidden:''}`} />
              <video ref={mainVideoBRef} muted playsInline className={`${styles.mainVideo} ${showB?'':styles.videoHidden}`} />
              </>
            ) : (
              <div className={styles.previewEmpty}>🎬 拖入视频素材到轨道<br/><span>从左侧素材面板拖入</span></div>
            )}
          </div>
        </div>
        {/* 播放控制条 */}
        <div className={styles.playBar}>
          <button className={styles.playBtn} onClick={togglePlay}>{clipPlaying ? '⏸' : '▶'}</button>
          <span className={styles.timeCode}>{playhead.toFixed(1)}s / {clipTotal.toFixed(1)}s</span>
          <button className={styles.exportBtn} onClick={exportVideo} disabled={exporting}>
            {exporting ? `⏳ 导出中 ${exportProgress}%` : '⬇️ 导出'}
          </button>
        </div>
      </main>

      <div className={styles.resizeH} style={{ right: rightW, height: `calc(100% - ${trackH}px)` }} onMouseDown={e=>startResize('right', e)} title="拖拽调整调节面板宽度" />
      {/* 右侧调节面板 */}
      <aside className={styles.rightPanel}>
        <div className={styles.panelHeader}>调节</div>
        <div className={styles.rightBody}>
          {selectedClip ? (
            <div className={styles.paramList}>
              <div className={styles.paramRow}>
                <span className={styles.paramLabel}>片段</span>
                <span className={styles.paramVal}>{(roomMaterial(selectedClip.materialId)?.displayName || '素材').slice(0, 12)}</span>
              </div>
              <div className={styles.paramRow}>
                <span className={styles.paramLabel}>时长</span>
                <span className={styles.paramVal}>{selectedClip.dur.toFixed(1)}s</span>
              </div>
              <div className={styles.paramRow}>
                <span className={styles.paramLabel}>不透明度</span>
                <input type="range" min="0" max="1" step="0.05" value={selectedClip.opacity ?? 1}
                  onChange={e => updateClip(selectedClip.id, { opacity: parseFloat(e.target.value) })} />
                <span className={styles.paramVal}>{Math.round((selectedClip.opacity ?? 1) * 100)}%</span>
              </div>
              <div className={styles.paramRow}>
                <span className={styles.paramLabel}>变速</span>
                <input type="range" min="0.25" max="4" step="0.05" value={selectedClip.speed ?? 1}
                  onChange={e => updateClip(selectedClip.id, { speed: parseFloat(e.target.value) })} />
                <span className={styles.paramVal}>{selectedClip.speed ?? 1}x</span>
              </div>
              <div className={styles.paramRow}>
                <span className={styles.paramLabel}>轨道</span>
                <select value={selectedClip.track || 'v1'} onChange={e => updateClip(selectedClip.id, { track: e.target.value })}>
                  {tracks.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <button className={styles.delBtn} onClick={() => removeClip(selectedClip.id)}>删除片段</button>
            </div>
          ) : (
            <div className={styles.rightHint}>选中轨道片段后，<br/>这里显示参数调节</div>
          )}
        </div>
      </aside>
      <div className={styles.resizeV} style={{ bottom: trackH }} onMouseDown={e=>startResize('track', e)} title="拖拽调整轨道区高度" />

      {/* 底部轨道区（含工具栏） */}
      <section className={styles.trackArea} onDrop={onDropToTrack} onDragOver={e=>e.preventDefault()}>
        <div className={styles.toolbar}>
          <button className={styles.toolBtn} onClick={splitAt} title="在播放头处分割片段">✂️ 分割</button>
          <button className={styles.toolBtn} onClick={duplicateClip} title="复制选中片段">⧉ 复制</button>
          <button className={styles.toolBtn} onClick={reverseClip} title="倒放选中片段">🔁 倒放</button>
          <button className={styles.toolBtn} onClick={() => selectedClipId && removeClip(selectedClipId)} title="删除选中片段">🗑️ 删除</button>
          <span className={styles.toolSep}></span>
          <button className={styles.addTrackBtn} onClick={addTrack}>+ 添加轨道</button>
          <span className={styles.trackTotal}>总时长 {clipTotal.toFixed(1)}s</span>
          <span className={styles.toolSep}></span>
          <span className={styles.zoomLabel}>缩放</span>
          <input type="range" min="20" max="400" step="5" value={tickScale}
            onChange={e=>setTickScale(parseInt(e.target.value))} title="调整时间轴缩放" />
          <span className={styles.zoomVal}>{tickScale}px/s</span>
          <span className={styles.toolSep}></span>
          <button className={`${styles.snapBtn} ${snapOn?styles.snapOn:''}`} onClick={()=>{ const v=!snapOn; setSnapOn(v); localStorage.setItem('artshadow-snap', v?'1':'0') }} title="吸附开关：开启后片段移动自动吸附到边缘/刻度">
            {snapOn ? '🧲 吸附开' : '🧲 吸附关'}
          </button>
        </div>
        {/* 时间轴容器（标尺 + 轨道，播放头覆盖全高） */}
        <div className={styles.timelineArea}>
        {/* 时间标尺（可点击/拖动移动播放头） */}
        <div className={styles.rulerRow} onMouseDown={e=>setPlayheadFromX(e, true)} onMouseMove={e=>{ if(e.buttons===1) setPlayheadFromX(e) }}>
          <div className={styles.trackLabel}></div>
          <div className={styles.ruler}>
            {(() => {
              const marks = []
              const step = clipTotal > 60 ? 10 : clipTotal > 20 ? 5 : 1
              for (let s = 0; s <= Math.ceil(clipTotal); s += step) marks.push(s)
              return marks.map(s => (
                <span key={s} className={styles.rulerMark} style={{ left: s * TICK }}>
                  <span className={styles.rulerTick} />
                  <span className={styles.rulerLabel}>{s}s</span>
                </span>
              ))
            })()}
          </div>
        </div>
        {/* 轨道主体（多轨） */}
        <div className={styles.trackRows} onMouseDown={e=>setPlayheadFromX(e, true)} onMouseMove={e=>{ if(e.buttons===1) setPlayheadFromX(e) }}>
          {!clips.some(c => tracks.some(t => t.key === c.track)) && (
            <div className={styles.trackEmpty}>← 从左侧素材面板拖入素材，自动创建轨道</div>
          )}
          {/* 顶部空白区：拖素材到这里自动新建轨道 */}
          <div className={styles.trackDropZone} onDrop={onDropToTrack} onDragOver={e=>e.preventDefault()}>
            ＋ 拖素材到这里自动新建视频轨
          </div>
          {orderedTracks.filter(t => t.key === TRACK1 || clips.some(c => c.track === t.key)).map(track => {
            const trackClips = clips.filter(c => c.track === track.key)
            return (
              <div key={track.key} className={styles.trackRow} data-track={track.key}>
                <div className={styles.trackLabel}>
                  🎬<br/>{track.label}
                </div>
                <div className={styles.trackBody}>
                  <div className={styles.trackGrid} style={{ width: Math.max(clipTotal * TICK + 20, 100) }}>
                    {trackClips.map((c, i) => {
                      const m = roomMaterial(c.materialId)
                      return (
                        <div key={c.id} className={`${styles.clipBlock} ${selectedClipId===c.id?styles.clipSel:''}`}
                          onClick={e=>{e.stopPropagation(); setSelectedClipId(c.id)}}
                          onMouseDown={e=>onClipDragStart(e, c.id, 'move')}
                          style={{ left: clipStart(i, track.key) * TICK, width: Math.max(40, (c.dur||5) * TICK), zIndex: dragGhost?.id === c.id ? 50 : undefined, transform: dragGhost?.id === c.id ? `translate(${dragGhost.dx}px, calc(-50% + ${dragGhost.dy}px))` : undefined }}>
                          <div className={styles.trimL} onMouseDown={e=>onClipDragStart(e, c.id, 'trimL')} title="裁剪开头" />
                          <span className={styles.clipName}>{(m?.displayName || m?.originalName || '素材').slice(0,8)}</span>
                          <span className={styles.clipDur}>{(c.dur||5).toFixed(1)}s</span>
                          <div className={styles.trimR} onMouseDown={e=>onClipDragStart(e, c.id, 'trimR')} title="裁剪结尾" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
          {/* 底部空白区：拖素材到这里 → 在轨道1（主轨）上方新建轨道 */}
          <div className={styles.trackDropZone} onDrop={onDropToTrack} onDragOver={e=>e.preventDefault()}>
            ＋ 拖素材到这里 → 在轨道1上方新建视频轨
          </div>
          {/* 播放头（跨全部轨道，带可拖拽头部手柄） */}
          <div className={styles.playhead} style={{ left: playhead * TICK + 60 }}>
            <div className={styles.playheadHead} onMouseDown={e=>{e.stopPropagation(); const startX=e.clientX; const startP=playheadRef.current; const mv=(ev)=>{const dx=(ev.clientX-startX)/TICK; const nt=Math.max(0,Math.min(clipTotal,startP+dx)); playheadRef.current=nt; setPlayhead(nt); if(!clipPlaying){loadMainClip(nt);loadPipClip(nt)}}; const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up)}; document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up)}} title="拖拽播放头" />
          </div>
        </div>
        </div>
      </section>
    </div>
  )
}
