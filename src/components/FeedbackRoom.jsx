import React, { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/StoreContext'
import styles from '../styles/FeedbackRoom.module.css'

// IndexedDB helper: persist local File/Blob objects so room materials survive remounts
const IDB_NAME = 'artshadow-room'
const IDB_STORE = 'files'
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbPut(key, value) {
  const db = await idbOpen()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
async function idbGet(key) {
  const db = await idbOpen()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function idbDel(key) {
  const db = await idbOpen()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export default function FeedbackRoom({ onBack }) {
  const { state, dispatch } = useStore()
  const { materials } = state
  const [active, setActive] = useState('version')
  const [selectedMat, setSelectedMat] = useState(null)
  const [showLeft, setShowLeft] = useState(false)
  const [showRight, setShowRight] = useState(false)
  const hideRightTimer = useRef(null)
  const [importMenu, setImportMenu] = useState(false)
  const [libPicker, setLibPicker] = useState(false)
  const [libPickSet, setLibPickSet] = useState(new Set())
  const [libCat, setLibCat] = useState('all')
  const [roomMats, setRoomMats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('artshadow-roommats') || '[]') } catch { return [] }
  })
  const saveRoomMats = (arr) => { setRoomMats(arr); localStorage.setItem('artshadow-roommats', JSON.stringify(arr)) }
  // Feedback-room-only materials (local imports stay here, NOT added to library store)
  const [roomMatData, setRoomMatData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('artshadow-roommatdata') || '{}') } catch { return {} }
  })
  const saveRoomMatData = (data) => { setRoomMatData(data); localStorage.setItem('artshadow-roommatdata', JSON.stringify(Object.fromEntries(Object.entries(data).map(([k,v])=>{ const {_file, ...rest} = v; return [k, rest] })))) }
  const roomMaterial = (id) => roomMatData[id] || materials.find(m => m.id === id)

  const removeRoomMats = (ids) => {
    saveRoomMats(roomMats.filter(x => !ids.includes(x)))
    // clean IndexedDB file bodies for removed local materials
    const data = { ...roomMatData }
    ids.forEach(id => {
      if (data[id] && data[id]._idbOnly !== undefined) { /* placeholder */ }
      delete data[id]
      idbDel(id).catch(()=>{})
    })
    saveRoomMatData(data)
  }

  // On mount: restore persisted local files from IndexedDB so playback works after re-entering
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const keys = Object.keys(roomMatData)
        if (keys.length === 0) return
        const updates = {}
        for (const id of keys) {
          const blob = await idbGet(id)
          if (blob && !cancelled) updates[id] = { ...roomMatData[id], _file: blob }
        }
        if (!cancelled && Object.keys(updates).length > 0) setRoomMatData(prev => ({ ...prev, ...updates }))
      } catch(e) { console.error('idb restore failed', e) }
    })()
    return () => { cancelled = true }
  }, [])
  const [confirmBox, setConfirmBox] = useState(null) // {x,y,message,onConfirm}
  const [multiMode, setMultiMode] = useState(false)
  const [selSet, setSelSet] = useState(new Set())

  // Category tree helpers (same logic as Sidebar)
  const catChildren = (id) => state.categories.filter(c => c.parentId === id)
  const collectCatIds = (id) => {
    let ids = [id]
    catChildren(id).forEach(c => ids = ids.concat(collectCatIds(c.id)))
    return ids
  }
  const libMaterials = libCat === 'all'
    ? materials
    : materials.filter(m => collectCatIds(libCat).includes(m.categoryId))
  const rootCats = state.categories.filter(c => !c.parentId)

  const handleImport = () => {
    // In Electron, use native dialog which transcodes videos to MP4 for compatibility
    if (window.electronAPI) {
      window.electronAPI.openFiles().then(files => {
        if (!files || files.length === 0) return
        const norm = files.map(f => ({ ...f, name: f.originalName || '', type: f.type === 'video' ? 'video/mp4' : 'image/jpeg', _isElectron: true }))
        const data = { ...roomMatData }
        norm.forEach(m => { data[m.id] = m })
        saveRoomMatData(data)
        saveRoomMats([...new Set([...roomMats, ...norm.map(m=>m.id)])])
        // warn if some videos failed to transcode
        const failed = norm.filter(m => m.transcodeError)
        if (failed.length > 0) alert('有 ' + failed.length + ' 个视频转码失败，可能无法播放（原文件已保留）：\n' + failed.map(f=>f.originalName).join('、'))
      }).catch(e => console.error('Electron import failed:', e))
      return
    }
    const inp = document.createElement('input'); inp.type='file'; inp.multiple=true; inp.accept='video/*,image/*'
    inp.onchange = async e => {
      const arr = Array.from(e.target.files).map(f => ({
        id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),
        originalName:f.name,type:f.type.startsWith('video/')?'video':'image',
        size:f.size,categoryId:null,importedAt:new Date().toISOString(),_file:f
      }))
      // Keep local imports in the feedback room only (not added to library store)
      // Persist file bodies in IndexedDB so they survive leaving/re-entering the room
      const data = { ...roomMatData }
      for (const m of arr) {
        data[m.id] = { ...m, _file: undefined }
        try { await idbPut(m.id, m._file) } catch(err) { console.error('idb put failed', err) }
      }
      saveRoomMatData(data)
      saveRoomMats([...new Set([...roomMats, ...arr.map(m=>m.id)])])
    }
    inp.click()
  }

  const confirmLibPick = () => {
    if (libPickSet.size === 0) { setLibPicker(false); return }
    saveRoomMats([...new Set([...roomMats, ...libPickSet])])
    setLibPickSet(new Set())
    setLibPicker(false)
  }

  const toggleLibPick = (id) => {
    setLibPickSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleDragStart = (e, m) => { e.dataTransfer.setData('materialId', m.id) }
  const handleDrop = (e) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('materialId')
    if (id) { const m = materials.find(m => m.id === id); if (m) dispatch({type:'SET_PREVIEW',payload:m}) }
  }
  const handleDragOver = e => e.preventDefault()

  const [verA, setVerA] = useState(''); const [verB, setVerB] = useState('')
  const matA = roomMaterial(verA); const matB = roomMaterial(verB)

  // ---- Version compare: dual video sync ----
  const [vaSrc, setVaSrc] = useState(null)
  const [vbSrc, setVbSrc] = useState(null)
  const [vaDur, setVaDur] = useState(0)
  const [vbDur, setVbDur] = useState(0)
  const [vcTime, setVcTime] = useState(0)
  const [vcPlaying, setVcPlaying] = useState(false)
  const [vcDragging, setVcDragging] = useState(false)
  const [vcMode, setVcMode] = useState('side') // side | stack | overlay
  const [vaOpacity, setVaOpacity] = useState(1)
  const [vbOpacity, setVbOpacity] = useState(0.5)
  const [vcFps, setVcFps] = useState(30)
  const [vcDraw, setVcDraw] = useState(false)
  const [vcTool, setVcTool] = useState('pen') // pen | rect | ellipse | line | arrow | text | eraser
  const [vcDrawColor, setVcDrawColor] = useState('#ff4757')
  const [vcDrawSize, setVcDrawSize] = useState(4)
  const [vcEraseSize, setVcEraseSize] = useState(40)
  const [vcOnion, setVcOnion] = useState(false)
  const [vcFrameNum, setVcFrameNum] = useState(0)
  const [vcDrawnFrames, setVcDrawnFrames] = useState([])
  const [vcTextPrompt, setVcTextPrompt] = useState(null) // {x,y} -> centered input overlay
  const [vcVol, setVcVol] = useState(1)
  const [vcLoop, setVcLoop] = useState(false)
  const [vcLoopStart, setVcLoopStart] = useState(0)
  const [vcMouse, setVcMouse] = useState(null)
  const [vcDownloading, setVcDownloading] = useState(false)
  const vcCanvasRef = useRef(null)
  const vcDrawingRef = useRef(false)
  const vcLastPosRef = useRef(null)
  const vcShapeStartRef = useRef(null)
  const vcShapeEndRef = useRef(null)
  const vcStrokeRef = useRef(null) // in-progress pen stroke points
  const vcFramesRef = useRef({}) // { frameNum: [stroke...] }
  const vcDirtyRef = useRef(false)
  const vcSelTextRef = useRef(null) // selected text object {fn, x,y,content,color,size}
  const vcSelDragRef = useRef(null) // 'move' | 'scale' | null
  const vcSelStartRef = useRef(null) // drag start snapshot
  const hideLeftTimer = useRef(null)
  const vcToolbar = [
    { key:'select', icon:'🖱️', label:'选择' },
    { key:'pen', icon:'🖊️', label:'画笔' },
    { key:'rect', icon:'▭', label:'矩形' },
    { key:'ellipse', icon:'◯', label:'圆形' },
    { key:'line', icon:'╱', label:'直线' },
    { key:'arrow', icon:'➡️', label:'箭头' },
    { key:'text', icon:'🅣', label:'文字' },
    { key:'eraser', icon:'🧽', label:'橡皮' }
  ]
  const vaRef = useRef(null)
  const vbRef = useRef(null)
  const vcSyncRef = useRef(0)

  const resolveSrc = (m, setSrc) => {
    if (!m) { setSrc(null); return }
    if (window.electronAPI && m.fileName) {
      window.electronAPI.getMaterialPath(m.fileName).then(p => setSrc(p))
    } else if (m._file) {
      setSrc(URL.createObjectURL(m._file))
    } else if (m.embedUrl) {
      setSrc(m.embedUrl)
    } else { setSrc(null) }
  }

  useEffect(() => {
    resolveSrc(matA, setVaSrc)
    resolveSrc(matB, setVbSrc)
    setVcTime(0); setVcPlaying(false); setVaDur(0); setVbDur(0)
    vcFramesRef.current = {}
    vcStrokeRef.current = null
    vcShapeStartRef.current = null; vcShapeEndRef.current = null
    vcSelTextRef.current = null
    setVcFrameNum(0)
    setVcDrawnFrames([])
  }, [verA, verB])

  // Sync play/pause: both videos follow the same state
  useEffect(() => {
    const va = vaRef.current, vb = vbRef.current
    if (!va || !vb) return
    vcSyncRef.current++
    if (vcPlaying) { va.play().catch(()=>{}); vb.play().catch(()=>{}) }
    else { va.pause(); vb.pause() }
    const t = setTimeout(() => vcSyncRef.current--, 50)
    return () => clearTimeout(t)
  }, [vcPlaying])

  // Sync volume + loop on both videos
  useEffect(() => {
    const va = vaRef.current, vb = vbRef.current
    if (va) { va.volume = vcVol; va.loop = vcLoop }
    if (vb) { vb.volume = vcVol; vb.loop = vcLoop }
  }, [vcVol, vcLoop])

  // Loop range: when either video ends, restart from loopStart if set
  const onVcEnded = () => {
    if (!vcLoop) return
    const va = vaRef.current, vb = vbRef.current
    if (!va || !vb) return
    const restart = Math.min(vcLoopStart, va.duration||0, vb.duration||0)
    vcSyncRef.current++
    va.currentTime = restart
    vb.currentTime = restart
    setVcTime(restart)
    setVcFrameNum(Math.round(restart * vcFps))
    va.play().catch(()=>{}); vb.play().catch(()=>{})
    setTimeout(() => vcSyncRef.current--, 50)
  }

  // Sync seek: when one video seeks during drag, mirror to the other
  const onVcSeek = (e) => {
    const va = vaRef.current, vb = vbRef.current
    if (!va || !vb) return
    if (vcSyncRef.current > 0) return
    const t = parseFloat(e.target.value) || 0
    vcSyncRef.current++
    va.currentTime = Math.min(t, va.duration || t)
    vb.currentTime = Math.min(t, vb.duration || t)
    setVcTime(t)
    setVcFrameNum(Math.round(t * vcFps))
    setTimeout(() => vcSyncRef.current--, 50)
  }

  // Timeupdate from either video drives the shared slider (only when not dragging)
  const onVaTime = () => {
    if (vcDragging || vcSyncRef.current > 0) return
    const va = vaRef.current
    if (va && !isNaN(va.currentTime)) {
      setVcTime(va.currentTime)
      setVcFrameNum(Math.round(va.currentTime * vcFps))
    }
  }

  // Master time slider drag
  const onVcSliderDown = () => setVcDragging(true)
  const onVcSliderUp = () => setVcDragging(false)

  // Global keyboard: space toggles play, arrow keys step frames (smooth rAF while held)
  useEffect(() => {
    const stepTimer = { t: null }
    const stepRaf = { id: null }
    const pauseAll = () => {
      const va = vaRef.current, vb = vbRef.current
      if (va) va.pause()
      if (vb) vb.pause()
      setVcPlaying(false)
    }
    const step = (dir) => {
      const va = vaRef.current, vb = vbRef.current
      if (!va || !vb) return
      const maxDur = Math.max(va.duration||0, vb.duration||0)
      const nt = Math.max(0, Math.min(maxDur, (va.currentTime||0) + dir / vcFps))
      vcSyncRef.current++
      va.currentTime = Math.min(nt, va.duration||nt)
      vb.currentTime = Math.min(nt, vb.duration||nt)
      setVcTime(nt)
      setVcFrameNum(Math.round(nt * vcFps))
      setTimeout(() => vcSyncRef.current--, 50)
    }
    const startLoop = (dir) => {
      if (stepRaf.id) return
      const loop = () => {
        step(dir)
        stepRaf.id = requestAnimationFrame(loop)
      }
      loop()
    }
    const stopLoop = () => {
      if (stepTimer.t) { clearTimeout(stepTimer.t); stepTimer.t = null }
      if (stepRaf.id) { cancelAnimationFrame(stepRaf.id); stepRaf.id = null }
    }
    const onKeyDown = (e) => {
      const tag = e.target && e.target.tagName
      if (tag === 'TEXTAREA' || tag === 'SELECT') return
      if (tag === 'INPUT') {
        const t = e.target.type
        // allow space on range sliders, block on text/number inputs
        if (t !== 'range') return
      }
      if (e.code === 'Space') {
        if (!matA || !matB) return
        e.preventDefault()
        setVcPlaying(p => !p)
        return
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (!matA || !matB) return
        e.preventDefault()
        if (e.repeat) return // repeat handled by rAF loop
        pauseAll()
        const dir = e.code === 'ArrowLeft' ? -1 : 1
        step(dir) // immediate single frame
        // Enter continuous mode after short hold
        stopLoop()
        stepTimer.t = setTimeout(() => { startLoop(dir) }, 120)
      }
    }
    const onKeyUp = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') stopLoop()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', onKeyUp)
      stopLoop()
    }
  }, [matA, matB, vcFps])

  const fmtVc = (s) => { if (!isFinite(s)) s = 0; const m = Math.floor(s/60), ss = Math.floor(s%60); return `${m}:${String(ss).padStart(2,'0')}` }

  // Detect fps from first video
  useEffect(() => {
    const v = vaRef.current
    if (!v) return
    let f = 30
    if (v.captureStream) {
      try {
        const tracks = v.captureStream().getVideoTracks()
        if (tracks.length > 0 && tracks[0]?.getSettings) {
          const s = tracks[0].getSettings()
          if (s.frameRate && s.frameRate > 0) f = Math.round(s.frameRate)
        }
      } catch(e) {}
    }
    setVcFps(f)
  }, [vaSrc])

  // Step both videos by one frame
  const stepVc = (dir) => {
    const va = vaRef.current, vb = vbRef.current
    if (!va || !vb) return
    const maxDur = Math.max(va.duration||0, vb.duration||0)
    const nt = Math.max(0, Math.min(maxDur, vcTime + dir / vcFps))
    vcSyncRef.current++
    va.currentTime = Math.min(nt, va.duration||nt)
    vb.currentTime = Math.min(nt, vb.duration||nt)
    setVcTime(nt)
    setVcFrameNum(Math.round(nt * vcFps))
    setTimeout(() => vcSyncRef.current--, 50)
  }

  // Canvas drawing helpers (vector strokes per frame)
  const vcCanvasPos = (e) => {
    const c = vcCanvasRef.current
    if (!c) return {x:0,y:0}
    const r = c.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const vcCurFrame = () => {
    // Follow the actual playing video frame (like library DrawingTool)
    const v = vaRef.current
    if (v && !isNaN(v.currentTime)) return Math.round(v.currentTime * vcFps)
    return Math.round(vcTime * vcFps)
  }
  const vcGetStrokes = (fn) => vcFramesRef.current[fn] || []
  const vcSaveFrame = (fn, strokes) => {
    vcFramesRef.current[fn] = strokes
    setVcDrawnFrames(Object.keys(vcFramesRef.current).map(Number).filter(k => (vcFramesRef.current[k]||[]).length > 0).sort((a,b)=>a-b))
    vcDirtyRef.current = true
  }
  // Jump both videos to a specific frame
  const vcGotoFrame = (n) => {
    const va = vaRef.current, vb = vbRef.current
    if (!va || !vb) return
    const maxDur = Math.max(va.duration||0, vb.duration||0)
    const t = Math.max(0, Math.min(maxDur, n / vcFps))
    vcSyncRef.current++
    va.currentTime = Math.min(t, va.duration||t)
    vb.currentTime = Math.min(t, vb.duration||t)
    setVcTime(t)
    setVcFrameNum(Math.round(t * vcFps))
    setTimeout(() => vcSyncRef.current--, 50)
  }

  // Text hit-testing: return the text object at (mx,my) on current frame, or null
  const vcTextSize = (t) => {
    const fs = t.size * 5 // matches render font size (bold size*5 px)
    return { tw: Math.max(60, (t.content||'').length * fs * 0.62 + 20), th: fs * 1.6 }
  }
  const vcTextCorners = (t) => {
    const { tw, th } = vcTextSize(t)
    return [
      {x:t.x-3, y:t.y-3},
      {x:t.x+tw+3, y:t.y-3},
      {x:t.x+tw+3, y:t.y+th+3},
      {x:t.x-3, y:t.y+th+3}
    ]
  }
  const vcHitText = (mx, my) => {
    const fn = vcCurFrame()
    const strokes = vcGetStrokes(fn)
    for (let i = strokes.length - 1; i >= 0; i--) {
      const st = strokes[i]
      if (st.type !== 'text') continue
      const { tw, th } = vcTextSize(st)
      if (mx >= st.x && mx <= st.x + tw && my >= st.y && my <= st.y + th) {
        return { fn, idx: i, ...st }
      }
    }
    return null
  }

  // Render one stroke (vector)
  const vcPaintStroke = (ctx, st) => {
    ctx.globalCompositeOperation = 'source-over'
    if (st.type === 'pen') {
      const pts = st.points || []
      if (pts.length === 0) return
      ctx.strokeStyle = st.color; ctx.lineWidth = st.size
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    } else if (st.type === 'rect') {
      ctx.strokeStyle = st.color; ctx.lineWidth = st.size; ctx.lineCap = 'round'
      ctx.strokeRect(st.x, st.y, st.w, st.h)
    } else if (st.type === 'ellipse') {
      ctx.strokeStyle = st.color; ctx.lineWidth = st.size
      ctx.beginPath(); ctx.ellipse(st.cx, st.cy, st.rx, st.ry, 0, 0, Math.PI*2); ctx.stroke()
    } else if (st.type === 'line' || st.type === 'arrow') {
      ctx.strokeStyle = st.color; ctx.lineWidth = st.size; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(st.x1, st.y1); ctx.lineTo(st.x2, st.y2); ctx.stroke()
      if (st.type === 'arrow') {
        const dx = st.x2-st.x1, dy = st.y2-st.y1, len = Math.hypot(dx,dy)
        if (len > 5) {
          const nx = dx/len, ny = dy/len, as = Math.max(8, st.size * 3)
          ctx.fillStyle = st.color
          ctx.beginPath()
          ctx.moveTo(st.x2, st.y2)
          ctx.lineTo(st.x2 - nx*as + ny*as*0.4, st.y2 - ny*as - nx*as*0.4)
          ctx.lineTo(st.x2 - nx*as - ny*as*0.4, st.y2 - ny*as + nx*as*0.4)
          ctx.closePath(); ctx.fill()
        }
      }
    } else if (st.type === 'text') {
      ctx.fillStyle = st.color
      ctx.font = `bold ${st.size * 5}px sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(st.content, st.x, st.y)
    }
  }

  // Full redraw: onion skins (other frames) + current frame + in-progress stroke + shape preview
  const vcRender = () => {
    const c = vcCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    const cfn = vcCurFrame()
    if (vcOnion) {
      for (const key of Object.keys(vcFramesRef.current)) {
        const fn = Number(key)
        if (isNaN(fn) || fn === cfn) continue
        ctx.save(); ctx.globalAlpha = 0.45
        vcGetStrokes(fn).forEach(st => vcPaintStroke(ctx, st))
        ctx.restore()
      }
    }
    vcGetStrokes(cfn).forEach(st => vcPaintStroke(ctx, st))
    // in-progress pen stroke
    if (vcStrokeRef.current && vcStrokeRef.current.points.length > 1) {
      ctx.save(); ctx.globalAlpha = 0.9
      vcPaintStroke(ctx, vcStrokeRef.current)
      ctx.restore()
    }
    // shape preview
    if (vcShapeStartRef.current && vcShapeEndRef.current && ['rect','ellipse','line','arrow'].includes(vcTool)) {
      const s = vcShapeStartRef.current, e = vcShapeEndRef.current
      const preview = {
        type: vcTool, color: vcDrawColor, size: vcDrawSize,
        ...(vcTool==='rect' ? {x:s.x, y:s.y, w:e.x-s.x, h:e.y-s.y}
          : vcTool==='ellipse' ? {cx:(s.x+e.x)/2, cy:(s.y+e.y)/2, rx:Math.abs(e.x-s.x)/2, ry:Math.abs(e.y-s.y)/2}
          : {x1:s.x, y1:s.y, x2:e.x, y2:e.y})
      }
      ctx.save(); ctx.globalAlpha = 0.85
      vcPaintStroke(ctx, preview)
      ctx.restore()
    }
    // selected text box (dashed rect + 4 corner handles)
    const sel = vcSelTextRef.current
    if (sel && sel.fn === cfn) {
      const { tw, th } = vcTextSize(sel)
      ctx.strokeStyle = '#5b9bd5'; ctx.lineWidth = 1; ctx.setLineDash([4,4])
      ctx.strokeRect(sel.x - 3, sel.y - 3, tw + 6, th + 6)
      ctx.setLineDash([])
      const corners = [{x:sel.x-3,y:sel.y-3},{x:sel.x+tw+3,y:sel.y-3},{x:sel.x+tw+3,y:sel.y+th+3},{x:sel.x-3,y:sel.y+th+3}]
      corners.forEach(c => { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3d7abf'; ctx.lineWidth = 1.5; ctx.fillRect(c.x-4,c.y-4,8,8); ctx.strokeRect(c.x-4,c.y-4,8,8) })
    }
    vcDirtyRef.current = false
  }

  // Render loop: redraw every frame so strokes follow the current video frame
  useEffect(() => {
    let raf
    const loop = () => {
      vcRender()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [vcDraw, vcMode, vcOnion, vcTool])

  const vcDrawDown = (e) => {
    if (!vcDraw) return
    e.preventDefault()
    const pos = vcCanvasPos(e)
    if (vcTool === 'select') {
      // hit corner handle first, then body
      const sel = vcSelTextRef.current
      if (sel && sel.fn === vcCurFrame()) {
        const corners = vcTextCorners(sel)
        const corner = corners.find(c => Math.abs(pos.x-c.x) < 9 && Math.abs(pos.y-c.y) < 9)
        if (corner) {
          vcSelDragRef.current = 'scale'
          vcSelStartRef.current = { ...sel, corner }
          vcDrawingRef.current = true
          return
        }
        const { tw, th } = vcTextSize(sel)
        if (pos.x >= sel.x-3 && pos.x <= sel.x+tw+3 && pos.y >= sel.y-3 && pos.y <= sel.y+th+3) {
          vcSelDragRef.current = 'move'
          vcSelStartRef.current = { ...sel, mx: pos.x, my: pos.y }
          vcDrawingRef.current = true
          return
        }
      }
      const hit = vcHitText(pos.x, pos.y)
      if (hit) {
        vcSelTextRef.current = hit
        vcDirtyRef.current = true
      } else {
        vcSelTextRef.current = null
        vcDirtyRef.current = true
      }
      return
    }
    if (vcTool === 'text') {
      // open centered text input overlay at click position
      setVcTextPrompt({ x: pos.x, y: pos.y })
      return
    }
    vcDrawingRef.current = true
    vcLastPosRef.current = pos
    if (vcTool === 'pen') {
      vcStrokeRef.current = { type:'pen', points:[pos], color:vcDrawColor, size:vcDrawSize }
    } else if (vcTool === 'eraser') {
      vcEraseAt(pos.x, pos.y)
    } else {
      vcShapeStartRef.current = pos
      vcShapeEndRef.current = pos
    }
    vcDirtyRef.current = true
  }
  const vcDrawMove = (e) => {
    if (!vcDraw) return
    const pos = vcCanvasPos(e)
    setVcMouse(pos)
    if (!vcDrawingRef.current) return
    e.preventDefault()
    if (vcTool === 'select' && vcSelDragRef.current) {
      const sel = vcSelTextRef.current
      if (!sel) { vcSelDragRef.current = null; return }
      const start = vcSelStartRef.current
      const strokes = vcGetStrokes(sel.fn)
      const cur = strokes[sel.idx]
      if (!cur) { vcSelDragRef.current = null; return }
      if (vcSelDragRef.current === 'move') {
        const nx = cur.x + (pos.x - start.mx)
        const ny = cur.y + (pos.y - start.my)
        const next = strokes.map((s,i) => i===sel.idx ? { ...s, x:nx, y:ny } : s)
        vcSaveFrame(sel.fn, next)
        vcSelTextRef.current = { ...sel, x:nx, y:ny }
        vcSelStartRef.current = { ...start, mx: pos.x, my: pos.y }
      } else if (vcSelDragRef.current === 'scale') {
        const { tw } = vcTextSize(cur)
        const base = Math.max(tw, 40)
        const dist = Math.hypot(pos.x - cur.x, pos.y - cur.y)
        const origDist = Math.hypot(start.corner.x - cur.x, start.corner.y - cur.y) || base
        const ratio = dist / origDist
        const newSize = Math.max(6, Math.round(cur.size * ratio))
        const next = strokes.map((s,i) => i===sel.idx ? { ...s, size:newSize } : s)
        vcSaveFrame(sel.fn, next)
        vcSelTextRef.current = { ...sel, size:newSize }
      }
      vcDirtyRef.current = true
      return
    }
    if (vcTool === 'pen' && vcStrokeRef.current) {
      const last = vcStrokeRef.current.points[vcStrokeRef.current.points.length-1]
      if (Math.hypot(pos.x-last.x, pos.y-last.y) > 1.5) vcStrokeRef.current.points.push(pos)
      vcDirtyRef.current = true
    } else if (vcTool === 'eraser') {
      vcEraseAt(pos.x, pos.y)
    } else if (['rect','ellipse','line','arrow'].includes(vcTool)) {
      vcShapeEndRef.current = pos
      vcDirtyRef.current = true
    }
  }
  const vcDrawUp = () => {
    vcSelDragRef.current = null
    vcSelStartRef.current = null
    if (!vcDrawingRef.current) return
    vcDrawingRef.current = false
    if (vcTool === 'pen' && vcStrokeRef.current) {
      const fn = vcCurFrame()
      const st = vcStrokeRef.current
      if (st.points.length > 1) vcSaveFrame(fn, [...vcGetStrokes(fn), st])
      vcStrokeRef.current = null
    } else if (['rect','ellipse','line','arrow'].includes(vcTool) && vcShapeStartRef.current && vcShapeEndRef.current) {
      const s = vcShapeStartRef.current, e = vcShapeEndRef.current
      const fn = vcCurFrame()
      const st = {
        type: vcTool, color: vcDrawColor, size: vcDrawSize,
        ...(vcTool==='rect' ? {x:s.x, y:s.y, w:e.x-s.x, h:e.y-s.y}
          : vcTool==='ellipse' ? {cx:(s.x+e.x)/2, cy:(s.y+e.y)/2, rx:Math.abs(e.x-s.x)/2, ry:Math.abs(e.y-s.y)/2}
          : {x1:s.x, y1:s.y, x2:e.x, y2:e.y})
      }
      vcSaveFrame(fn, [...vcGetStrokes(fn), st])
      vcShapeStartRef.current = null; vcShapeEndRef.current = null
    }
    vcLastPosRef.current = null
    vcDirtyRef.current = true
  }

  // Erase: remove points/strokes within radius on current frame
  const vcEraseAt = (mx, my) => {
    const fn = vcCurFrame()
    const strokes = vcGetStrokes(fn)
    if (strokes.length === 0) return
    const r = vcEraseSize / 2
    const next = strokes.map(st => {
      if (st.type === 'pen') {
        const kept = (st.points || []).filter(p => Math.hypot(p.x-mx, p.y-my) >= r)
        if (kept.length < 2) return null
        return { ...st, points: kept }
      }
      if (st.type === 'text') {
        if (Math.hypot(st.x-mx, st.y-my) < r) return null
        return st
      }
      const cx = st.type==='rect' ? st.x+st.w/2 : st.type==='ellipse' ? st.cx : (st.x1+st.x2)/2
      const cy = st.type==='rect' ? st.y+st.h/2 : st.type==='ellipse' ? st.cy : (st.y1+st.y2)/2
      if (Math.hypot(cx-mx, cy-my) < r) return null
      return st
    }).filter(Boolean)
    vcSaveFrame(fn, next)
    vcDirtyRef.current = true
  }

  const vcClearDraw = () => {
    vcFramesRef.current = {}
    setVcDrawnFrames([])
    vcStrokeRef.current = null
    vcShapeStartRef.current = null; vcShapeEndRef.current = null
    vcDirtyRef.current = true
    vcRender()
  }

  // Download: composite video(s) + per-frame drawings into a new video (WebM)
  // Uses source resolution for sharp output + native captureStream auto-sampling for smoothness
  const vcDownload = async () => {
    const va = vaRef.current, vb = vbRef.current
    if (!va || !vb || vcDownloading) return
    // Use original video resolution (no quality loss)
    const vw = va.videoWidth || 1280, vh = va.videoHeight || 720
    const bw = vb.videoWidth || vw, bh = vb.videoHeight || vh
    let W = vw, H = vh
    if (vcMode === 'side') { W = vw * 2; H = vh }
    else if (vcMode === 'stack') { W = vw; H = vh * 2 }
    else if (vcMode === 'overlay') { W = Math.max(vw, bw); H = Math.max(vh, bh) }
    // Cap extremely large canvases for practical recording
    const MAX = 3840
    if (W > MAX || H > MAX) {
      const s = Math.min(MAX / W, MAX / H)
      W = Math.round(W * s); H = Math.round(H * s)
    }
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')

    // Stroke coords are in display-space (screen canvas CSS px); map them to output canvas
    const srcCanvas = vcCanvasRef.current
    const dispRect = srcCanvas ? srcCanvas.getBoundingClientRect() : { width: W, height: H }
    const sx = W / Math.max(1, dispRect.width)
    const sy = H / Math.max(1, dispRect.height)

    const drawContain = (video, dx, dy, dw, dh) => {
      const vwd = video.videoWidth || 1, vhd = video.videoHeight || 1
      const s = Math.min(dw / vwd, dh / vhd)
      const w = vwd * s, h = vhd * s
      ctx.drawImage(video, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h)
    }
    const drawFrame = (fn) => {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)
      if (vcMode === 'side') {
        drawContain(va, 0, 0, W / 2, H)
        drawContain(vb, W / 2, 0, W / 2, H)
      } else if (vcMode === 'stack') {
        drawContain(va, 0, 0, W, H / 2)
        drawContain(vb, 0, H / 2, W, H / 2)
      } else if (vcMode === 'overlay') {
        ctx.save(); ctx.globalAlpha = vaOpacity; drawContain(va, 0, 0, W, H); ctx.restore()
        ctx.save(); ctx.globalAlpha = vbOpacity; drawContain(vb, 0, 0, W, H); ctx.restore()
      } else {
        drawContain(va, 0, 0, W, H)
      }
      // Draw strokes in display-space, scaled to output canvas
      ctx.save()
      ctx.scale(sx, sy)
      vcGetStrokes(fn).forEach(st => vcPaintStroke(ctx, st))
      ctx.restore()
    }

    const maxDur = Math.max(va.duration || 0, vb.duration || 0)
    if (maxDur <= 0) { alert('视频未加载完成，无法下载'); return }
    const fps = Math.max(1, Math.min(60, vcFps || 30))

    // Prefer MP4 (H.264) for wide compatibility; fall back to WebM on older engines
    let stream, rec
    try {
      stream = canvas.captureStream(fps)
      const candidates = [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm'
      ]
      const highBitrate = { videoBitsPerSecond: 20_000_000 } // 20 Mbps: sharp but fast to encode
      const mime = candidates.find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m))
      rec = new MediaRecorder(stream, { mimeType: mime, ...highBitrate })
    } catch(e) { alert('当前环境不支持视频录制'); return }
    const chunks = []
    rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data) }
    rec.onstop = () => {
      setVcDownloading(false)
      const isMp4 = (rec.mimeType || '').includes('mp4')
      const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' })
      if (blob.size === 0) { alert('录制失败（无数据）'); return }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = '画影客对比_' + (matA.displayName||matA.originalName||'A') + '_' + (matB.displayName||matB.originalName||'B') + '_' + Date.now() + (isMp4 ? '.mp4' : '.webm')
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }

    setVcPlaying(false)
    setVcDownloading(true)
    va.muted = true; vb.muted = true
    va.pause(); vb.pause()
    // Seek to start and wait for the first frame to actually render
    await new Promise(res => {
      let done = false
      const finish = () => { if (!done) { done = true; res() } }
      va.onseeked = finish; vb.onseeked = finish
      try { va.currentTime = 0; vb.currentTime = 0 } catch(e) { finish() }
      setTimeout(finish, 300)
    })
    // Wait one rAF so the first frame is painted, then draw frame 0 before recording starts
    // Also ensure video frames are actually decodable before we draw
    await new Promise(res => {
      let done = false
      const finish = () => { if (!done) { done = true; res() } }
      const wait = () => {
        const ok = (va.readyState >= 2 || va.videoWidth > 0) && (vb.readyState >= 2 || vb.videoWidth > 0)
        if (ok || tries > 40) finish()
        else { tries++; requestAnimationFrame(wait) }
      }
      let tries = 0
      requestAnimationFrame(wait)
      setTimeout(finish, 800)
    })
    drawFrame(0)

    rec.start(500) // timeslice flushes data periodically
    va.play().catch(()=>{}); vb.play().catch(()=>{})

    // Draw exactly once per video frame via requestVideoFrameCallback (perfect sync),
    // with an independent watchdog timer that guarantees rec.stop() runs even if
    // the video element never fires another frame callback (e.g. ended/edge cases).
    let stopped = false
    const drawTick = () => {
      if (stopped) return
      const t = va.currentTime || 0
      // keep vb in sync with va
      try {
        const vbT = vb.currentTime || 0
        if (Math.abs(vbT - t) > 0.08) vb.currentTime = Math.min(t, vb.duration || t)
      } catch(e) {}
      drawFrame(Math.round(t * fps))
      if (t >= maxDur - 0.05 || va.ended) {
        stopped = true
        setTimeout(() => { try { rec.stop() } catch(e) {} }, 200)
        return
      }
      if (typeof va.requestVideoFrameCallback === 'function') {
        va.requestVideoFrameCallback(drawTick)
      } else {
        setTimeout(drawTick, 1000 / fps)
      }
    }
    if (typeof va.requestVideoFrameCallback === 'function') va.requestVideoFrameCallback(drawTick)
    else setTimeout(drawTick, 1000 / fps)

    // Watchdog: always stop shortly after expected duration
    setTimeout(() => {
      if (!stopped) {
        stopped = true
        setTimeout(() => { try { rec.stop() } catch(e) {} }, 200)
      }
    }, (maxDur + 4) * 1000)
  }
  const vcWheel = (e) => {
    if (!vcDraw || vcTool !== 'eraser') return
    e.preventDefault()
    setVcEraseSize(s => Math.max(8, Math.min(200, s + (e.deltaY < 0 ? 5 : -5))))
  }
  const vcTextConfirm = (txt) => {
    setVcTextPrompt(null)
    const pos = vcTextPrompt
    if (!pos || !txt) return
    const fn = vcCurFrame()
    const strokes = vcGetStrokes(fn)
    const size = Math.max(4, vcDrawSize)
    const obj = { type:'text', x:pos.x, y:pos.y, content:txt, color:vcDrawColor, size }
    vcSaveFrame(fn, [...strokes, obj])
    // auto-select the new text and switch to select tool so user can move/scale
    vcSelTextRef.current = { fn, idx: strokes.length, ...obj }
    setVcTool('select')
    vcDirtyRef.current = true
  }
  const vcResizeCanvas = () => {
    const c = vcCanvasRef.current
    if (!c) return
    const parent = c.parentElement
    if (!parent) return
    const dpr = window.devicePixelRatio || 1
    const w = parent.clientWidth, h = parent.clientHeight
    if (w === 0 || h === 0) return
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  useEffect(() => {
    if (!vcDraw) return
    vcResizeCanvas()
    const parent = vcCanvasRef.current?.parentElement
    let ro = null
    if (parent && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => vcResizeCanvas())
      ro.observe(parent)
    }
    const t = setTimeout(vcResizeCanvas, 300)
    window.addEventListener('resize', vcResizeCanvas)
    return () => { clearTimeout(t); if (ro) ro.disconnect(); window.removeEventListener('resize', vcResizeCanvas) }
  }, [vcDraw, vcMode])

  return (
    <div className={styles.room}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← 返回首页</button>
        <div className={styles.topTitle}>💬 反馈室</div>
        <div className={styles.topTabs}>
          <button className={`${styles.topTab} ${styles.topTabOn}`}>🔄 版本对比</button>
        </div>
        <div style={{position:'relative'}}>
          <button className={styles.importBtn} onClick={()=>setImportMenu(!importMenu)}>+ 导入素材</button>
          {importMenu && (
            <div className={styles.importMenu}>
              <button className={styles.importMenuItem} onClick={()=>{setImportMenu(false);handleImport()}}>📁 本地文件</button>
              <button className={styles.importMenuItem} onClick={()=>{setImportMenu(false);setLibPicker(true)}}>🗂️ 素材库</button>
            </div>
          )}
        </div>
        <button className={styles.toggleBtn} onClick={()=>setShowLeft(!showLeft)}>{showLeft?'◀':'▶'}</button>
        <button className={styles.toggleBtn} onClick={()=>setShowRight(!showRight)}>{showRight?'▶':'◀'}</button>
      </div>

      <div className={styles.body}>
        <div className={`${styles.leftPanel} ${showLeft?styles.leftOpen:''}`}
          onMouseEnter={()=>{clearTimeout(hideLeftTimer.current);setShowLeft(true)}}
          onMouseLeave={()=>{hideLeftTimer.current=setTimeout(()=>setShowLeft(false),300)}}>
          <div className={styles.panelTitle}>
            反馈素材 ({roomMats.length})
            <div style={{display:'flex',gap:4,alignItems:'center'}}>
              {multiMode && (
                <>
                  <button className={styles.addBtn} style={{background:'#ef4444'}}
                    onClick={e=>{
                      const pos = e.currentTarget.getBoundingClientRect()
                      setConfirmBox({ x: pos.left, y: pos.bottom, message:`确定删除选中的 ${selSet.size} 个素材？`, onConfirm:()=>{
                        removeRoomMats([...selSet])
                        setSelSet(new Set()); setMultiMode(false)
                      }})
                    }} disabled={selSet.size===0}>删除({selSet.size})</button>
                  <button className={styles.addBtn} style={{background:'#475569'}} onClick={()=>{setSelSet(new Set());setMultiMode(false)}}>完成</button>
                </>
              )}
              <button className={styles.addBtn} onClick={()=>{setMultiMode(!multiMode);setSelSet(new Set())}}>
                {multiMode ? '✓' : '☑️'}
              </button>
            </div>
          </div>
          <div className={styles.matList}>
            {roomMats.length === 0 && <div className={styles.emptyTxt}>点右上角「+ 导入素材」<br/>从本地或素材库添加</div>}
            {roomMats.map(id => {
              const m = roomMaterial(id)
              if (!m) return null
              const isSel = selSet.has(m.id)
              return (
                <div key={m.id} className={`${styles.matItem} ${selectedMat===m.id?styles.matActive:''} ${isSel?styles.matSel:''}`}
                  onClick={()=>{
                    if (multiMode) {
                      setSelSet(prev => { const n = new Set(prev); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })
                    } else {
                      setSelectedMat(m.id)
                    }
                  }} draggable={!multiMode} onDragStart={e=>handleDragStart(e,m)}>
                  {multiMode && <span className={styles.matCheck}>{isSel?'✓':''}</span>}
                  <span>{m.type==='video'?'🎬':'🖼️'}</span>
                  <span className={styles.matName}>{m.displayName||m.originalName}</span>
                  <button className={styles.matDel} onClick={e=>{
                    e.stopPropagation()
                    const pos = e.currentTarget.getBoundingClientRect()
                    setConfirmBox({ x: pos.left, y: pos.bottom, message:'从反馈室移除？', onConfirm:()=>removeRoomMats([m.id]) })
                  }}>×</button>
                </div>
              )
            })}
          </div>
        </div>
        <div className={styles.edgeZone} onMouseEnter={()=>{clearTimeout(hideLeftTimer.current);setShowLeft(true)}} title="靠近显示素材列表" />

        <div className={styles.centerPanel} onDrop={handleDrop} onDragOver={handleDragOver}>
          {active==='version' ? (
            <div className={styles.vcStage}>
              <div className={styles.vcSelects}>
                <select value={verA} onChange={e=>setVerA(e.target.value)} className={styles.verSelect}>
                  <option value="">← 旧版本</option>
                  {roomMats.map(id => {
                    const m = roomMaterial(id)
                    return m ? <option key={m.id} value={m.id}>{m.displayName||m.originalName}</option> : null
                  })}
                </select>
                <div className={styles.vsBadge}>VS</div>
                <select value={verB} onChange={e=>setVerB(e.target.value)} className={styles.verSelect}>
                  <option value="">新版本 →</option>
                  {roomMats.map(id => {
                    const m = roomMaterial(id)
                    return m ? <option key={m.id} value={m.id}>{m.displayName||m.originalName}</option> : null
                  })}
                </select>
              </div>
              {(!matA || !matB) ? (
                <div className={styles.vcHint}>👆 分别选择旧/新版本素材，生成对比</div>
              ) : (
                <div className={styles.vcPanel}>
                  <div className={styles.vcModeBar}>
                    <button className={`${styles.vcModeBtn} ${vcMode==='side'?styles.vcModeOn:''}`} onClick={()=>setVcMode('side')}>↔️ 横向对比</button>
                    <button className={`${styles.vcModeBtn} ${vcMode==='stack'?styles.vcModeOn:''}`} onClick={()=>setVcMode('stack')}>↕️ 上下对比</button>
                    <button className={`${styles.vcModeBtn} ${vcMode==='overlay'?styles.vcModeOn:''}`} onClick={()=>setVcMode('overlay')}>🔀 重叠对比</button>
                  </div>
                  <div className={`${styles.vcVideos} ${vcMode==='stack'?styles.vcStack:''} ${vcMode==='overlay'?styles.vcOverlay:''}`}>
                    <div className={styles.vcBox}>
                      <div className={styles.vcLabel}>旧版本</div>
                      {vaSrc
                        ? <video ref={vaRef} src={vaSrc} onLoadedMetadata={e=>setVaDur(e.target.duration||0)} onTimeUpdate={onVaTime} onEnded={onVcEnded} style={vcMode==='overlay'?{opacity:vaOpacity}:undefined} />
                        : <div className={styles.vcPlaceholder}>无法加载</div>}
                    </div>
                    <div className={styles.vcBox}>
                      <div className={styles.vcLabel}>新版本</div>
                      {vbSrc
                        ? <video ref={vbRef} src={vbSrc} onLoadedMetadata={e=>setVbDur(e.target.duration||0)} onEnded={onVcEnded} style={vcMode==='overlay'?{opacity:vbOpacity}:undefined} />
                        : <div className={styles.vcPlaceholder}>无法加载</div>}
                    </div>
                    {vcMode==='overlay' && (
                      <div className={styles.vcOpacityBar}>
                        <div className={styles.vcOpacityTitle}>透明度</div>
                        <div className={styles.vcOpacityRow}>
                          <span>旧</span>
                          <input type="range" min="0" max="1" step="0.05" value={vaOpacity}
                            onChange={e=>setVaOpacity(parseFloat(e.target.value))} />
                          <span>{Math.round(vaOpacity*100)}%</span>
                          <button className={`${styles.vcTransBtn} ${vaOpacity===0?styles.vcTransOn:''}`}
                            onClick={()=>setVaOpacity(vaOpacity===0?1:0)} title="一键全透明/恢复">{vaOpacity===0?'👁️':'🫥'}</button>
                        </div>
                        <div className={styles.vcOpacityRow}>
                          <span>新</span>
                          <input type="range" min="0" max="1" step="0.05" value={vbOpacity}
                            onChange={e=>setVbOpacity(parseFloat(e.target.value))} />
                          <span>{Math.round(vbOpacity*100)}%</span>
                          <button className={`${styles.vcTransBtn} ${vbOpacity===0?styles.vcTransOn:''}`}
                            onClick={()=>setVbOpacity(vbOpacity===0?0.5:0)} title="一键全透明/恢复">{vbOpacity===0?'👁️':'🫥'}</button>
                        </div>
                      </div>
                    )}
                    <canvas ref={vcCanvasRef} className={`${styles.vcCanvas} ${vcDraw?styles.vcCanvasOn:''}`}
                      onMouseDown={vcDrawDown} onMouseMove={vcDrawMove} onMouseUp={vcDrawUp} onMouseLeave={vcDrawUp}
                      onWheel={vcWheel} style={vcTool==='eraser'?{cursor:'none'}:undefined} />
                    {vcDraw && vcTool==='eraser' && vcMouse && (
                      <div className={styles.vcEraseCursor} style={{left:vcMouse.x, top:vcMouse.y, width:vcEraseSize, height:vcEraseSize}} />
                    )}
                    {vcTextPrompt && (
                      <div className={styles.vcTextOverlay} style={{left:vcTextPrompt.x, top:vcTextPrompt.y}}>
                        <div className={styles.vcTextBox}>
                          <div className={styles.vcTextBoxTitle}>✏️ 输入文字</div>
                          <input className={styles.vcTextInput} autoFocus
                            placeholder="在这里输入文字…"
                            onKeyDown={e=>{
                              if (e.key==='Enter') vcTextConfirm(e.target.value)
                              if (e.key==='Escape') setVcTextPrompt(null)
                            }}
                            onBlur={e=>setVcTextPrompt(null)} />
                          <div className={styles.vcTextBoxBtns}>
                            <button className={styles.vcTextCancel} onClick={()=>setVcTextPrompt(null)}>取消</button>
                            <button className={styles.vcTextOk} onClick={e=>vcTextConfirm(e.target.value)}>确定</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={styles.vcControls}>
                    <button className={styles.vcBtn} onClick={()=>setVcPlaying(!vcPlaying)}>
                      {vcPlaying ? '⏸ 暂停' : '▶ 播放'}
                    </button>
                    <button className={`${styles.vcFrameBtn} ${vcDownloading?styles.vcLoopOn:''}`} onClick={vcDownload} title="下载合成视频（含涂鸦）">
                      {vcDownloading ? '⏳ 录制中…' : '⬇️ 下载'}
                    </button>
                    <button className={styles.vcFrameBtn} onClick={()=>stepVc(-1)} title="上一帧">⏮</button>
                    <button className={styles.vcFrameBtn} onClick={()=>stepVc(1)} title="下一帧">⏭</button>
                    <span className={styles.vcTime}>{fmtVc(vcTime)}</span>
                    <div className={styles.vcSliderWrap}>
                      <input type="range" className={styles.vcSlider} min="0" max={Math.max(vaDur, vbDur) || 1} step="0.01"
                        value={vcTime}
                        onChange={onVcSeek}
                        onMouseDown={onVcSliderDown}
                        onMouseUp={onVcSliderUp}
                        onTouchStart={onVcSliderDown}
                        onTouchEnd={onVcSliderUp}
                      />
                      <div className={styles.vcTicks}>
                        {(() => {
                          const dur = Math.max(vaDur, vbDur) || 0
                          const marks = []
                          const totalSec = Math.floor(dur)
                          for (let s = 0; s <= totalSec; s++) {
                            marks.push({ s, major: s % 5 === 0 })
                          }
                          return marks.map((m, i) => (
                            <span key={i} className={`${styles.vcTick} ${m.major?styles.vcTickMajor:''}`}
                              style={{ left: (m.s/dur*100)+'%' }}
                              title={`${fmtVc(m.s)} · 帧 ${Math.round(m.s*vcFps)}`} />
                          ))
                        })()}
                      </div>
                    </div>
                    <span className={styles.vcTime}>{fmtVc(Math.max(vaDur, vbDur))}</span>
                    <button className={`${styles.vcFrameBtn} ${vcLoop?styles.vcLoopOn:''}`} onClick={()=>{
                      setVcLoop(!vcLoop)
                      if (!vcLoop) setVcLoopStart(vcTime)
                    }} title="循环播放（点按当前时间为循环起点）">{vcLoop?'🔁 循环':'🔂 循环'}</button>
                    <button className={`${styles.vcVolBtn} ${vcVol===0?styles.vcVolMute:''}`} onClick={()=>setVcVol(vcVol===0?1:0)} title="一键静音">
                      {vcVol===0 ? '🔇' : '🔊'}
                    </button>
                    <input type="range" className={styles.vcVol} min="0" max="1" step="0.05" value={vcVol}
                      onChange={e=>setVcVol(parseFloat(e.target.value))} title="音量" />
                    <input type="number" className={styles.vcFrameInput} min="0" max={Math.round(Math.max(vaDur,vbDur)*vcFps)}
                      value={vcFrameNum}
                      onChange={e=>{
                        const n = parseInt(e.target.value)
                        if (!isNaN(n)) {
                          const t = Math.max(0, Math.min(Math.max(vaDur,vbDur)||0, n / vcFps))
                          const va = vaRef.current, vb = vbRef.current
                          if (va && vb) {
                            vcSyncRef.current++
                            va.currentTime = Math.min(t, va.duration||t)
                            vb.currentTime = Math.min(t, vb.duration||t)
                            setVcTime(t)
                            setVcFrameNum(Math.round(t * vcFps))
                            setTimeout(() => vcSyncRef.current--, 50)
                          }
                        }
                      }} title="输入帧号跳转" />
                    <span className={styles.vcFrameLabel}>帧</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.centerEmpty}>
              <span style={{fontSize:64,opacity:.15}}>🎬</span>
              <p style={{fontSize:16,color:'#94a3b8'}}>从左侧拖入素材</p>
              <p style={{fontSize:12,color:'#475569'}}>自动弹出完整预览 · 画笔 · 逐帧 · 标注</p>
            </div>
          )}
        </div>

        <div className={styles.edgeZoneRight} onMouseEnter={()=>{clearTimeout(hideRightTimer.current);setShowRight(true)}} title="靠近显示反馈/画笔" />

        <div className={`${styles.rightPanel} ${showRight?styles.rightOpen:''}`}
          onMouseEnter={()=>{clearTimeout(hideRightTimer.current);setShowRight(true)}}
          onMouseLeave={()=>{hideRightTimer.current=setTimeout(()=>setShowRight(false),300)}}>
          <div className={styles.vcDrawPanel}>
            <div className={styles.panelTitle}>✏️ 画笔工具</div>
            <div className={styles.vcDrawTools}>
              <button className={`${styles.vcModeBtn} ${vcDraw?styles.vcModeOn:''}`} onClick={()=>setVcDraw(!vcDraw)}>
                {vcDraw ? '✅ 画笔已开启' : '✏️ 开启画笔'}
              </button>
                {vcDraw && (
                  <>
                    <div className={styles.vcToolGroup}>
                      {vcToolbar.map(t => (
                        <button key={t.key} className={`${styles.vcToolBtn} ${vcTool===t.key?styles.vcToolOn:''}`}
                          onClick={()=>{setVcTool(t.key); vcSelTextRef.current=null; vcDirtyRef.current=true}} title={t.label}>{t.icon}</button>
                      ))}
                    </div>
                    <div className={styles.vcDrawRow}>
                      <span className={styles.vcDrawLabel}>颜色</span>
                      <input type="color" value={vcDrawColor} onChange={e=>setVcDrawColor(e.target.value)} className={styles.vcColorPick} />
                    </div>
                    <div className={styles.vcDrawRow}>
                      <span className={styles.vcDrawLabel}>{vcTool==='eraser'?'橡皮大小':'粗细'}</span>
                      {vcTool==='eraser' ? (
                        <span className={styles.vcEraseHint}>滚轮 · {vcEraseSize}px</span>
                      ) : (
                        <input type="range" min="1" max="20" value={vcDrawSize} onChange={e=>setVcDrawSize(parseInt(e.target.value))} className={styles.vcDrawSize} />
                      )}
                    </div>
                    <div className={styles.vcDrawRow}>
                      <button className={`${styles.vcModeBtn} ${vcOnion?styles.vcModeOn:''}`} onClick={()=>setVcOnion(!vcOnion)} title="叠影：显示其他帧笔迹">👻 叠影</button>
                      <button className={styles.vcModeBtn} onClick={vcClearDraw}>🗑️ 清空</button>
                    </div>
                    <div className={styles.vcDrawRow}>
                      <span className={styles.vcFrameBadge}>当前帧 {vcFrameNum}</span>
                    </div>
                    {vcDrawnFrames.length > 0 && (
                      <div className={styles.vcDrawnBox}>
                        <div className={styles.vcDrawnLabel}>已绘制帧（点击跳转）</div>
                        <div className={styles.vcDrawnList}>
                          {vcDrawnFrames.map(n => (
                            <button key={n} className={`${styles.vcDrawnChip} ${n===vcFrameNum?styles.vcDrawnOn:''}`}
                              onClick={()=>vcGotoFrame(n)} title={`跳转到帧 ${n}`}>帧{n}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

      {confirmBox && (
        <div className={styles.confirmMask} onClick={()=>setConfirmBox(null)}>
          <div className={styles.confirmBox} style={{left:confirmBox.x, top:confirmBox.y}} onClick={e=>e.stopPropagation()}>
            <div className={styles.confirmMsg}>{confirmBox.message}</div>
            <div className={styles.confirmBtns}>
              <button className={styles.vcTextCancel} onClick={()=>setConfirmBox(null)}>取消</button>
              <button className={styles.confirmOk} onClick={()=>{confirmBox.onConfirm(); setConfirmBox(null)}}>确定</button>
            </div>
          </div>
        </div>
      )}

      {libPicker && (
        <div className={styles.modalMask} onClick={()=>{setLibPicker(false);setLibPickSet(new Set());setLibCat('all')}}>
          <div className={styles.libModal} onClick={e=>e.stopPropagation()}>
            <div className={styles.libTitle}>
              <span>🗂️ 从素材库选择素材</span>
              <span style={{fontSize:11,color:'#64748b'}}>已选 {libPickSet.size} 项</span>
            </div>
            <div className={styles.libBody}>
              <div className={styles.libCats}>
                <div className={`${styles.libCatItem} ${libCat==='all'?styles.libCatOn:''}`} onClick={()=>setLibCat('all')}>
                  📦 全部素材 <span className={styles.libCatCount}>{materials.length}</span>
                </div>
                {rootCats.map(cat => (
                  <div key={cat.id} className={`${styles.libCatItem} ${libCat===cat.id?styles.libCatOn:''}`} onClick={()=>setLibCat(cat.id)}>
                    📁 {cat.name} <span className={styles.libCatCount}>{collectCatIds(cat.id).length}</span>
                  </div>
                ))}
                {state.categories.filter(c => c.parentId).map(cat => (
                  <div key={cat.id} className={`${styles.libCatItem} ${styles.libCatChild} ${libCat===cat.id?styles.libCatOn:''}`} onClick={()=>setLibCat(cat.id)}>
                    📄 {cat.name} <span className={styles.libCatCount}>{collectCatIds(cat.id).length}</span>
                  </div>
                ))}
              </div>
              <div className={styles.libList}>
                {libMaterials.map(m => (
                  <div key={m.id} className={`${styles.libItem} ${libPickSet.has(m.id)?styles.libItemOn:''}`}
                    onClick={()=>toggleLibPick(m.id)}>
                    <span className={styles.libCheck}>{libPickSet.has(m.id)?'✓':''}</span>
                    <span>{m.type==='video'?'🎬':'🖼️'}</span>
                    <span className={styles.matName}>{m.displayName||m.originalName}</span>
                  </div>
                ))}
                {libMaterials.length === 0 && <div className={styles.emptyTxt}>该分类暂无素材</div>}
              </div>
            </div>
            <div className={styles.libFooter}>
              <button className={styles.libCancel} onClick={()=>{setLibPicker(false);setLibPickSet(new Set());setLibCat('all')}}>取消</button>
              <button className={styles.libOk} onClick={confirmLibPick} disabled={libPickSet.size===0}>确认导入 ({libPickSet.size})</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
