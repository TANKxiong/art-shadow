import React, { useRef, useState, useEffect } from 'react'
import styles from '../styles/DrawingTool.module.css'

const COLORS = ['#ff4444','#ff8800','#ffdd00','#44cc44','#4488ff','#aa44ff','#ffffff']
const SIZES = [2, 4, 6, 10]
const ONION_RANGE = 5

function renderStrokes(ctx, strokes, alpha) {
  if (!strokes || strokes.length === 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  strokes.forEach(stroke => {
    if (stroke.type === 'text') {
      ctx.font = `${stroke.size || 16}px "Noto Sans SC", sans-serif`
      ctx.fillStyle = stroke.color || '#ff4444'
      ctx.textBaseline = 'top'
      const lines = (stroke.content || '').split('\n')
      lines.forEach((line, i) => ctx.fillText(line, stroke.x || 0, (stroke.y || 0) + i * (stroke.size || 16) * 1.3))
      return
    }
    if (!stroke || stroke.length === 0) return
    ctx.strokeStyle = stroke[0].color
    ctx.lineWidth = stroke[0].size
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y)
    ctx.stroke()
  })
  ctx.restore()
}

export default function DrawingTool({ videoRef, currentFrame, fps, enabled, onToggle, onSeek }) {
  const canvasRef = useRef(null)
  const [color, setColor] = useState('#ff4444')
  const [size, setSize] = useState(4)
  const [drawing, setDrawing] = useState(false)
  const drawingRef = useRef(false)
  const [dirty, setDirty] = useState(0)
  const [onionSkin, setOnionSkin] = useState(false)
  const [selObj, setSelObj] = useState(null)
  const [hoveredHandle, setHoveredHandle] = useState(null)
  const [draggingHandle, setDraggingHandle] = useState(null)
  const [draggingMove, setDraggingMove] = useState(false)
  const [toolMode, setToolMode] = useState('select')
  const dragStart = useRef({ x:0,y:0,angle:0,scale:1,cx:0,cy:0 })
  const drawingsRef = useRef({})
  const strokeRef = useRef([])
  const shapeRef = useRef(null)
  const shapeEndRef = useRef(null)
  const [textInput, setTextInput] = useState(null)
  const [textValue, setTextValue] = useState('')
  const textInputRef = useRef(null)
  const currentFrameRef = useRef(currentFrame)
  const onionSkinRef = useRef(onionSkin)
  const selObjRef = useRef(selObj)
  const redrawRef = useRef(null)
  const mousePosRef = useRef({ x: 0, y: 0 })
  const toolModeRef = useRef(toolMode)
  const sizeRef = useRef(size)
  const colorRef = useRef(color)
  useEffect(() => { toolModeRef.current = toolMode }, [toolMode])
  useEffect(() => { sizeRef.current = size }, [size])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { drawingRef.current = drawing }, [drawing])

  // Get video content area within canvas (accounts for letterboxing)
  const getContentArea = () => {
    const c = canvasRef.current
    const v = videoRef?.current
    if (!c || !v || !v.videoWidth) return { w: c.width || 640, h: c.height || 360, ox: 0, oy: 0, scale: 1 }
    const cw = c.width, ch = c.height
    const vw = v.videoWidth, vh = v.videoHeight
    const videoAspect = vw / vh
    const canvasAspect = cw / (ch || 1)
    let contentW, contentH, ox, oy
    if (canvasAspect > videoAspect) {
      contentH = ch; contentW = ch * videoAspect; ox = (cw - contentW) / 2; oy = 0
    } else {
      contentW = cw; contentH = cw / videoAspect; ox = 0; oy = (ch - contentH) / 2
    }
    return { w: contentW, h: contentH, ox, oy }
  }

  // Convert canvas coordinates to normalized (0-1 of video content area)
  const toNorm = (x, y) => {
    const ca = getContentArea()
    return { nx: (x - ca.ox) / ca.w, ny: (y - ca.oy) / ca.h }
  }

  // Convert normalized to canvas coordinates
  const fromNorm = (nx, ny) => {
    const ca = getContentArea()
    return { x: nx * ca.w + ca.ox, y: ny * ca.h + ca.oy }
  }

  // Sync ref - only update when prop changes (don't overwrite marker-set value during same frame)
  const prevFrameRef = useRef(currentFrame)
  if (currentFrame !== prevFrameRef.current) {
    currentFrameRef.current = currentFrame
    prevFrameRef.current = currentFrame
  }
  onionSkinRef.current = onionSkin
  selObjRef.current = selObj

  // Derive frame directly from video for save/render consistency
  const getVideoFrame = () => {
    const v = videoRef?.current
    return v && v.duration ? Math.round(v.currentTime * fps) : currentFrameRef.current
  }

  const frameKeys = Object.keys(drawingsRef.current).filter(k => k !== '_objects' && !isNaN(Number(k))).map(Number).sort((a,b)=>a-b)

  // Sync canvas + render
  useEffect(() => {
    const video = videoRef?.current
    const canvas = canvasRef.current
    if (!video || !canvas || !enabled) return
    const redraw = () => {
      const rect = video.getBoundingClientRect()
      const parent = canvas.parentElement
      if (!parent) return
      const w = rect.width, h = rect.height
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      const pRect = parent.getBoundingClientRect()
      canvas.style.left = (rect.left - pRect.left) + 'px'
      canvas.style.top = (rect.top - pRect.top) + 'px'
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      // Derive frame directly from video
      const cfn = getVideoFrame()
      const curW = canvas.width, curH = canvas.height
      // Helper: render frame strokes with content-area-aware mapping
      const renderFrame = (fn, alpha) => {
        const strokes = drawingsRef.current[fn]
        if (!strokes) return
        const savedCA = drawingsRef.current._contentAreas?.[fn]
        const curCA = getContentArea()
        if (savedCA && savedCA.w > 0 && savedCA.h > 0 && curCA.w > 0 && curCA.h > 0 &&
            (savedCA.w !== curCA.w || savedCA.h !== curCA.h || savedCA.ox !== curCA.ox || savedCA.oy !== curCA.oy)) {
          // Map strokes from saved content area to current content area
          const sx = curCA.w / savedCA.w
          const sy = curCA.h / savedCA.h
          const tx = curCA.ox - savedCA.ox * sx
          const ty = curCA.oy - savedCA.oy * sy
          ctx.save()
          ctx.translate(tx, ty)
          ctx.scale(sx, sy)
          renderStrokes(ctx, strokes, alpha)
          ctx.restore()
        } else {
          renderStrokes(ctx, strokes, alpha)
        }
      }
      if (onionSkinRef.current) {
        for (const key of Object.keys(drawingsRef.current)) {
          const fn = Number(key); if (isNaN(fn) || fn === cfn) continue
          renderFrame(fn, 0.6)
        }
      }
      renderFrame(cfn, 1)
      if (strokeRef.current.length > 0) renderStrokes(ctx, [strokeRef.current], 1)
      // Draw handles with same content-area mapping
      const sobj = selObjRef.current
      if (sobj) {
        const sf = sobj.frame ?? cfn
        const savedCA = drawingsRef.current._contentAreas?.[sf]
        const curCA = getContentArea()
        if (savedCA && savedCA.w > 0 && savedCA.h > 0 && curCA.w > 0 && curCA.h > 0) {
          const sx = curCA.w / savedCA.w
          const sy = curCA.h / savedCA.h
          const tx = curCA.ox - savedCA.ox * sx
          const ty = curCA.oy - savedCA.oy * sy
          ctx.save()
          ctx.translate(tx, ty)
          ctx.scale(sx, sy)
          drawHandles(ctx, sobj)
          ctx.restore()
        } else {
          drawHandles(ctx, sobj)
        }
      }
      // Eraser cursor
      if (toolModeRef.current === 'eraser') {
        const er = Math.max(8, sizeRef.current * 3)
        const mp = mousePosRef.current
        ctx.save()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.arc(mp.x, mp.y, er, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fill()
        ctx.restore()
      }
      // Shape preview (rectangle, circle, line, arrow)
      if (shapeRef.current && shapeEndRef.current && ['rect','ellipse','line','arrow'].includes(toolModeRef.current)) {
        const sx = shapeRef.current.x, sy = shapeRef.current.y
        const ex = shapeEndRef.current.x, ey = shapeEndRef.current.y
        ctx.strokeStyle = colorRef.current; ctx.lineWidth = sizeRef.current; ctx.lineCap = 'round'
        if(toolModeRef.current==='rect') ctx.strokeRect(sx, sy, ex-sx, ey-sy)
        else if(toolModeRef.current==='ellipse') { ctx.beginPath(); ctx.ellipse((sx+ex)/2, (sy+ey)/2, Math.abs(ex-sx)/2, Math.abs(ey-sy)/2, 0, 0, Math.PI*2); ctx.stroke() }
        else if(toolModeRef.current==='line') { ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke() }
        else if(toolModeRef.current==='arrow') { ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke(); const dx=ex-sx,dy=ey-sy,len=Math.hypot(dx,dy); if(len>5) { const nx=dx/len,ny=dy/len,as=10; ctx.beginPath(); ctx.moveTo(ex,ey); ctx.lineTo(ex-nx*as+ny*as*0.4,ey-ny*as-nx*as*0.4); ctx.lineTo(ex-nx*as-ny*as*0.4,ey-ny*as+nx*as*0.4); ctx.closePath(); ctx.fillStyle=colorRef.current; ctx.fill() } }
      }
    }
    redraw()
    redrawRef.current = redraw
    let running = true
    const loop = () => { if (!running) return; redraw(); requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
    const obs = new ResizeObserver(redraw)
    obs.observe(video)
    window.addEventListener('resize', redraw)
    document.addEventListener('fullscreenchange', redraw)
    return () => { running = false; obs.disconnect(); window.removeEventListener('resize', redraw); document.removeEventListener('fullscreenchange', redraw) }
  }, [enabled, videoRef, dirty])

  function drawHandles(ctx, obj) {
    if (obj.type === 'text') {
      const tw = Math.max(60, (obj.content || '').length * (obj.size || 16) * 0.6)
      const th = (obj.size || 16) * (1 + (obj.content || '').split('\n').length * 0.7)
      ctx.strokeStyle = '#5b9bd5'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.strokeRect(obj.x - 2, obj.y - 2, tw + 4, th + 4)
      ctx.setLineDash([])
      const corners = [{x:obj.x,y:obj.y},{x:obj.x+tw,y:obj.y},{x:obj.x+tw,y:obj.y+th},{x:obj.x,y:obj.y+th}]
      corners.forEach(c => { ctx.strokeStyle='#3d7abf';ctx.lineWidth=1.5;ctx.strokeRect(c.x-5,c.y-5,10,10) })
      const topC = { x:obj.x + tw/2, y:obj.y - 2 }
      const rh = { x:topC.x, y:topC.y - 20 }
      ctx.beginPath(); ctx.moveTo(topC.x, topC.y); ctx.lineTo(rh.x, rh.y)
      ctx.strokeStyle='#5b9bd5';ctx.lineWidth=1.5;ctx.stroke()
      ctx.beginPath(); ctx.arc(rh.x, rh.y, 7, 0, Math.PI*2);ctx.fillStyle='#fff';ctx.fill()
      ctx.strokeStyle='#3d7abf';ctx.lineWidth=1.5;ctx.stroke()
      return
    }
    const hw = 40 * obj.scale, hh = 24 * obj.scale
    const cos = Math.cos(obj.angle), sin = Math.sin(obj.angle)
    const corners = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }]
      .map(p => ({ x: (obj.cx||obj.x) + p.x*cos - p.y*sin, y: (obj.cy||obj.y) + p.x*sin + p.y*cos }))
    ctx.strokeStyle = '#5b9bd5'; ctx.lineWidth = 1; ctx.setLineDash([4,4])
    ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y)
    for(let i=1;i<4;i++) ctx.lineTo(corners[i].x, corners[i].y); ctx.closePath(); ctx.stroke()
    ctx.setLineDash([])
    corners.forEach(c => { ctx.strokeStyle='#3d7abf';ctx.lineWidth=1.5;ctx.strokeRect(c.x-5,c.y-5,10,10) })
    const topC = { x:(corners[0].x+corners[1].x)/2, y:(corners[0].y+corners[1].y)/2 }
    const rh = { x:topC.x, y:topC.y-24 }
    ctx.beginPath(); ctx.moveTo(topC.x,topC.y); ctx.lineTo(rh.x,rh.y)
    ctx.strokeStyle='#5b9bd5';ctx.lineWidth=1.5;ctx.stroke()
    ctx.beginPath(); ctx.arc(rh.x,rh.y,7,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill()
    ctx.strokeStyle='#3d7abf';ctx.lineWidth=1.5;ctx.stroke()
  }

  function hovering(mx, my) {
    if (!selObj) return null
    if (selObj.type === 'text') {
      const tw = Math.max(60, (selObj.content || '').length * (selObj.size || 16) * 0.6)
      const th = (selObj.size || 16) * (1 + (selObj.content || '').split('\n').length * 0.7)
      const corners = [{x:selObj.x,y:selObj.y},{x:selObj.x+tw,y:selObj.y},{x:selObj.x+tw,y:selObj.y+th},{x:selObj.x,y:selObj.y+th}]
      for (const c of corners) if (Math.abs(mx-c.x)<7 && Math.abs(my-c.y)<7) return 'scale'
      return null
    }
    const hw=40*selObj.scale,hh=24*selObj.scale,cos=Math.cos(selObj.angle),sin=Math.sin(selObj.angle)
    const corners=[{x:-hw,y:-hh},{x:hw,y:-hh},{x:hw,y:hh},{x:-hw,y:hh}].map(p=>({x:selObj.cx+p.x*cos-p.y*sin,y:selObj.cy+p.x*sin+p.y*cos}))
    const topC={x:(corners[0].x+corners[1].x)/2,y:(corners[0].y+corners[1].y)/2},rh={x:topC.x,y:topC.y-24}
    if(Math.hypot(mx-rh.x,my-rh.y)<10)return'rotate'
    for(const c of corners) if(Math.abs(mx-c.x)<7&&Math.abs(my-c.y)<7)return'scale'
    return null
  }

  function insideBox(mx,my){if(!selObj)return false;const hw=40*selObj.scale,hh=24*selObj.scale,cos=Math.cos(selObj.angle),sin=Math.sin(selObj.angle),dx=mx-selObj.cx,dy=my-selObj.cy;return Math.abs(dx*cos+dy*sin)<hw&&Math.abs(-dx*sin+dy*cos)<hh}
  function hitTestObject(mx,my){const objs=drawingsRef.current._objects?.[currentFrameRef.current];if(!objs)return null;for(let i=objs.length-1;i>=0;i--){const o=objs[i];if(o.type==='text'){const tw=Math.max(40,(o.content||'').length*(o.size||16)*0.6),th=(o.size||16)*2;if(mx>=o.x&&mx<=o.x+tw&&my>=o.y&&my<=o.y+th)return{idx:i,frame:currentFrameRef.current,type:'text',templateKey:'text',x:o.x,y:o.y,content:o.content,color:o.color,size:o.size,strokeIdx:o.strokeIdx,angle:0,scale:1}}else{const hw=40*(o.scale||1),hh=24*(o.scale||1),cos=Math.cos(o.angle||0),sin=Math.sin(o.angle||0),dx=mx-(o.x||o.cx),dy=my-(o.y||o.cy);if(Math.abs(dx*cos+dy*sin)<hw&&Math.abs(-dx*sin+dy*cos)<hh)return{idx:i,frame:currentFrameRef.current,templateKey:o.templateKey,x:o.x||o.cx,y:o.y||o.cy,angle:o.angle||0,scale:o.scale||1}}}return null}
  function getOppositeCorner(obj){const hw=40*obj.scale,hh=24*obj.scale,cos=Math.cos(obj.angle),sin=Math.sin(obj.angle);return{x:obj.cx-hw*cos+hh*sin,y:obj.cy-hw*sin-hh*cos}}

  function eraseAt(mx, my) {
    const cur = drawingsRef.current[currentFrameRef.current]; if (!cur || cur.length === 0) return
    const radius = Math.max(6, size * 3); let changed = false; const newStrokes = []
    for (const stroke of cur) {
      if (!stroke || stroke.length === 0) continue
      const keep = stroke.map(p => Math.hypot(p.x - mx, p.y - my) >= radius)
      const segments = []; let seg = []
      for (let i = 0; i < keep.length; i++) { if (keep[i]) { seg.push(stroke[i]) } else { changed = true; if (seg.length >= 2) segments.push([...seg]); seg = [] } }
      if (seg.length >= 2) segments.push([...seg])
      if (segments.length === 0 && !keep.every(Boolean)) { changed = true; continue }
      newStrokes.push(...segments)
    }
    if (changed) {
      const objs = drawingsRef.current._objects?.[currentFrameRef.current]
      if (objs && objs.length > 0) { if (!drawingsRef.current._objects) drawingsRef.current._objects = {}; drawingsRef.current._objects[currentFrameRef.current] = [] }
      drawingsRef.current = { ...drawingsRef.current, [currentFrameRef.current]: newStrokes }
      setSelObj(null); setDirty(d => d + 1)
    }
  }

  const commitText = () => {
    if (!textInput || !textValue.trim()) { setTextInput(null); return }
    if (!drawingsRef.current._objects) drawingsRef.current._objects = {}
    if (!drawingsRef.current._objects[currentFrameRef.current]) drawingsRef.current._objects[currentFrameRef.current] = []
    const cur = drawingsRef.current[currentFrameRef.current] || []
    const strokeIdx = cur.length
    const idx = drawingsRef.current._objects[currentFrameRef.current].length
    drawingsRef.current._objects[currentFrameRef.current].push({ type:'text', x:textInput.x, y:textInput.y, content:textValue, color, size:size*4, strokeIdx, templateKey:'text', angle:0, scale:1 })
    drawingsRef.current = { ...drawingsRef.current, [currentFrameRef.current]: [...cur, { type:'text', x:textInput.x, y:textInput.y, content:textValue, color, size:size*4 }] }
    setSelObj({ idx, frame:currentFrameRef.current, type:'text', templateKey:'text', x:textInput.x, y:textInput.y, content:textValue, color, size:size*4, strokeIdx, angle:0, scale:1 })
    setTextInput(null); setTextValue(''); setToolMode('select'); setDirty(d => d + 1)
  }

  useEffect(() => { if (textInput && textInputRef.current) textInputRef.current.focus() }, [textInput])

  function updateSelObjParam(key, value) {
    if (!selObj || selObj.frame !== currentFrameRef.current) return
    const objs = drawingsRef.current._objects?.[currentFrameRef.current]; if (!objs || !objs[selObj.idx]) return
    objs[selObj.idx][key] = value
    if (selObj.type === 'text' && selObj.strokeIdx != null) {
      const strokes = drawingsRef.current[currentFrameRef.current] || []
      if (strokes[selObj.strokeIdx] && strokes[selObj.strokeIdx].type === 'text') {
        strokes[selObj.strokeIdx][key] = value
        drawingsRef.current = { ...drawingsRef.current, [currentFrameRef.current]: [...strokes] }
      }
    }
    setSelObj(prev => prev ? { ...prev, [key]: value } : null)
    setDirty(d => d + 1)
  }

  const getPos = (e) => {
    const c = canvasRef.current; if (!c) return { x: 0, y: 0 }
    const w = c.width || 640, h = c.height || 360
    const r = c.getBoundingClientRect()
    return { x: Math.max(0,Math.min(w,(e.clientX-r.left)*(w/r.width))), y: Math.max(0,Math.min(h,(e.clientY-r.top)*(h/r.height))) }
  }

  const startDraw = (e) => {
    if (!enabled) return; e.preventDefault()
    const pos = getPos(e)
    // Save content area at start of any drawing
    if (!drawingsRef.current._contentAreas) drawingsRef.current._contentAreas = {}
    drawingsRef.current._contentAreas[currentFrameRef.current] = getContentArea()
    if (toolMode === 'eraser') { eraseAt(pos.x, pos.y); setSelObj(null); setDrawing(true); return }
    if (toolMode === 'text') { const hit = hitTestObject(pos.x,pos.y); if (hit && hit.type==='text') { setSelObj(hit); return }; if (textInput) { setTextInput(null); return }; setTextInput({ x:pos.x, y:pos.y }); setTextValue(''); setSelObj(null); return }
    if (selObj) { const h = hovering(pos.x,pos.y); if (h) { setDraggingHandle(h); if (selObj.type==='text') { dragStart.current = { x:pos.x,y:pos.y,size:selObj.size,cx:selObj.x,cy:selObj.y } } else { const {cx,cy,angle,scale}=selObj; dragStart.current={x:pos.x,y:pos.y,angle,scale,cx,cy} }; return }; if (insideBox(pos.x,pos.y)) { setDraggingMove(true); const cx=selObj.x||selObj.cx,cy=selObj.y||selObj.cy; dragStart.current={x:pos.x,y:pos.y,cx,cy}; return } }
    const hit = hitTestObject(pos.x,pos.y); if (hit) { setSelObj(hit); setDraggingMove(true); dragStart.current={x:pos.x,y:pos.y,cx:hit.x||hit.cx,cy:hit.y||hit.cy}; return }
    if (['rect','ellipse','line','arrow'].includes(toolMode)) { setSelObj(null); shapeRef.current={x:pos.x,y:pos.y}; setDrawing(true); return }
    if (toolMode !== 'pen') return
    setSelObj(null); strokeRef.current=[{...pos,color,size}]; setDrawing(true)
  }

  const moveDraw = (e) => {
    if (!enabled) return; e.preventDefault()
    const pos = getPos(e)
        mousePosRef.current = pos

if (draggingHandle && selObj) {
      if (draggingHandle==='scale' && selObj.type==='text') { const cx=selObj.x,cy=selObj.y; const prevD=Math.hypot(dragStart.current.x-cx,dragStart.current.y-cy); const curD=Math.hypot(pos.x-cx,pos.y-cy); updateSelObjParam('size',Math.round(Math.max(4,Math.min(120,dragStart.current.size*(curD/prevD))))) }
      else if(draggingHandle==='rotate'||(draggingHandle==='scale'&&e.shiftKey)) { const p=draggingHandle==='scale'&&e.shiftKey?getOppositeCorner(selObj):{x:selObj.cx,y:selObj.cy}; const pa=Math.atan2(dragStart.current.y-p.y,dragStart.current.x-p.x),ca=Math.atan2(pos.y-p.y,pos.x-p.x); updateSelObjParam('angle',dragStart.current.angle+(ca-pa)) }
      else if(draggingHandle==='scale') { const pd=Math.hypot(dragStart.current.x-selObj.cx,dragStart.current.y-selObj.cy),cd=Math.hypot(pos.x-selObj.cx,pos.y-selObj.cy); updateSelObjParam('scale',Math.max(0.2,Math.min(3,dragStart.current.scale*(cd/pd)))) }; return
    }
    if (draggingMove && selObj) { const kx=selObj.type==='text'?'x':'cx',ky=selObj.type==='text'?'y':'cy'; updateSelObjParam(kx,dragStart.current.cx+pos.x-dragStart.current.x); updateSelObjParam(ky,dragStart.current.cy+pos.y-dragStart.current.y); return }
    if (selObj&&!drawing&&!draggingHandle&&!draggingMove) { const h=hovering(pos.x,pos.y); if(h)setHoveredHandle(h); else if(insideBox(pos.x,pos.y))setHoveredHandle('move'); else setHoveredHandle(null) }
    if (!drawingRef.current) {
      if (toolMode==='eraser') { const c3=canvasRef.current; if(c3){const ctx3=c3.getContext('2d');ctx3.save();ctx3.strokeStyle='#fff';ctx3.lineWidth=1.5;ctx3.setLineDash([4,3]);ctx3.beginPath();ctx3.arc(pos.x,pos.y,Math.max(6,size*3),0,Math.PI*2);ctx3.stroke();ctx3.setLineDash([]);ctx3.restore()} }; return
    }
    if (toolMode==='eraser') { eraseAt(pos.x,pos.y); return }
    if (shapeRef.current && ['rect','ellipse','line','arrow'].includes(toolMode)) {
      shapeEndRef.current={x:pos.x,y:pos.y}; const c=canvasRef.current; if(!c)return; const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height)
      renderStrokes(ctx,drawingsRef.current[currentFrameRef.current],1);if(selObj)drawHandles(ctx,selObj)
      const sx=shapeRef.current.x,sy=shapeRef.current.y;ctx.strokeStyle=color;ctx.lineWidth=size;ctx.lineCap='round'
      if(toolMode==='rect')ctx.strokeRect(sx,sy,pos.x-sx,pos.y-sy)
      else if(toolMode==='ellipse'){ctx.beginPath();ctx.ellipse((sx+pos.x)/2,(sy+pos.y)/2,Math.abs(pos.x-sx)/2,Math.abs(pos.y-sy)/2,0,0,Math.PI*2);ctx.stroke()}
      else if(toolMode==='line'){ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(pos.x,pos.y);ctx.stroke()}
      else if(toolMode==='arrow'){ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(pos.x,pos.y);ctx.stroke();const dx=pos.x-sx,dy=pos.y-sy,len=Math.hypot(dx,dy);if(len>5){const nx=dx/len,ny=dy/len,as=10;ctx.beginPath();ctx.moveTo(pos.x,pos.y);ctx.lineTo(pos.x-nx*as+ny*as*0.4,pos.y-ny*as-nx*as*0.4);ctx.lineTo(pos.x-nx*as-ny*as*0.4,pos.y-ny*as+nx*as*0.4);ctx.closePath();ctx.fillStyle=color;ctx.fill()}};return
    }
    strokeRef.current.push({...pos,color,size}); const c2=canvasRef.current; if(!c2)return; const ctx2=c2.getContext('2d');ctx2.clearRect(0,0,c2.width,c2.height)
    renderStrokes(ctx2,drawingsRef.current[currentFrameRef.current],1);renderStrokes(ctx2,[strokeRef.current],1);if(selObj)drawHandles(ctx2,selObj)
  }

  const endDraw = () => {
    setDraggingHandle(null); setDraggingMove(false)
    if (!drawing) return; setDrawing(false)
    if (toolMode==='eraser') return
    const frame = getVideoFrame()
    if (shapeRef.current && shapeEndRef.current) {
      const sx=shapeRef.current.x,sy=shapeRef.current.y,ex=shapeEndRef.current.x,ey=shapeEndRef.current.y; let strokes=[]
      if(toolMode==='rect')strokes=[[{x:sx,y:sy,color,size},{x:ex,y:sy,color,size},{x:ex,y:ey,color,size},{x:sx,y:ey,color,size},{x:sx,y:sy,color,size}]]
      else if(toolMode==='ellipse'){const pts=[],cx=(sx+ex)/2,cy=(sy+ey)/2,rx=Math.abs(ex-sx)/2,ry=Math.abs(ey-sy)/2;for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;pts.push({x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry,color,size})}strokes=[pts]}
      else if(toolMode==='line')strokes=[[{x:sx,y:sy,color,size},{x:ex,y:ey,color,size}]]
      else if(toolMode==='arrow'){const dx=ex-sx,dy=ey-sy,len=Math.hypot(dx,dy),nx=len>0?dx/len:0,ny=len>0?dy/len:0,as=10;strokes=[[{x:sx,y:sy,color,size},{x:ex,y:ey,color,size}],[{x:ex,y:ey,color,size},{x:ex-nx*as+ny*as*0.4,y:ey-ny*as-nx*as*0.4,color,size}],[{x:ex-nx*as+ny*as*0.4,y:ey-ny*as-nx*as*0.4,color,size},{x:ex-nx*as-ny*as*0.4,y:ey-ny*as+nx*as*0.4,color,size}],[{x:ex-nx*as-ny*as*0.4,y:ey-ny*as+nx*as*0.4,color,size},{x:ex,y:ey,color,size}]]}
      const cur=drawingsRef.current[frame]||[]; drawingsRef.current={...drawingsRef.current,[frame]:[...cur,...strokes]}; shapeRef.current=null; shapeEndRef.current=null; setDirty(d=>d+1); return
    }
    if (strokeRef.current.length===0) return
    const cur2=drawingsRef.current[frame]||[]; drawingsRef.current={...drawingsRef.current,[frame]:[...cur2,[...strokeRef.current]]}; strokeRef.current=[]; setDirty(d=>d+1)
  }

  useEffect(()=>{if(!drawing)return;const h=()=>{endDraw()};document.addEventListener('mouseup',h);return()=>document.removeEventListener('mouseup',h)},[drawing])

  const undoStroke = () => {
    const cur=drawingsRef.current[currentFrameRef.current]||[]; if(cur.length===0)return
    const objs=drawingsRef.current._objects?.[currentFrameRef.current]; if(objs&&objs.length>0){const last=objs[objs.length-1];if(last.startIdx+last.count===cur.length){objs.pop();cur.splice(last.startIdx,last.count)}else cur.pop()}
    else cur.pop()
    drawingsRef.current={...drawingsRef.current,[currentFrameRef.current]:[...cur]}; setSelObj(null); setDirty(d=>d+1)
  }

  const clearFrame = () => {
    const next={...drawingsRef.current}; delete next[currentFrameRef.current]; if(next._objects)delete next._objects[currentFrameRef.current]
    drawingsRef.current=next; setSelObj(null); setDirty(d=>d+1)
  }

  useEffect(()=>{if(!selObj)return;const h=(e)=>{if(e.key==='ArrowLeft'){e.preventDefault();updateSelObjParam('angle',(selObj.angle||0)-5*Math.PI/180)};if(e.key==='ArrowRight'){e.preventDefault();updateSelObjParam('angle',(selObj.angle||0)+5*Math.PI/180)};if(e.key==='+'||e.key==='='){e.preventDefault();if(selObj.type==='text')updateSelObjParam('size',(selObj.size||16)+1);else updateSelObjParam('scale',(selObj.scale||1)+0.05)};if(e.key==='-'){e.preventDefault();if(selObj.type==='text')updateSelObjParam('size',Math.max(4,(selObj.size||16)-1));else updateSelObjParam('scale',Math.max(0.2,(selObj.scale||1)-0.05))}};document.addEventListener('keydown',h);return()=>document.removeEventListener('keydown',h)},[selObj,currentFrame])
  useEffect(()=>{if(!enabled)return;const h=(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==='z'){e.preventDefault();undoStroke()}};document.addEventListener('keydown',h);return()=>document.removeEventListener('keydown',h)},[enabled,currentFrame])
  useEffect(()=>{if(!enabled||toolMode!=='eraser')return;const h=(e)=>{e.preventDefault();setSize(s=>Math.max(1,Math.min(20,s+(e.deltaY>0?-1:1))))};document.addEventListener('wheel',h,{passive:false});return()=>document.removeEventListener('wheel',h)},[enabled,toolMode])

  if (!enabled) return null

  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} style={{cursor:toolMode==='eraser'?'none':toolMode==='select'?'auto':'crosshair'}}
        onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw} />

      {textInput && (
        <div className={styles.textOverlay} style={{left:textInput.x+'px',top:textInput.y+'px'}} onClick={e=>e.stopPropagation()}>
          <textarea ref={textInputRef} className={styles.textInput} value={textValue} onChange={e=>setTextValue(e.target.value)}
            onKeyDown={e=>{if(e.key==='Escape')setTextInput(null);if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();commitText()}}}
            placeholder="输入标注文字..." style={{fontSize:(size*4)+'px',color}} rows={2} />
          <div className={styles.textActions}>
            <button className={styles.actionBtn} onClick={commitText}>OK 确定</button>
            <button className={styles.actionBtn} onClick={()=>setTextInput(null)}>X 取消</button>
          </div>
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>形状</span>
          {[{key:'select',icon:'\u{1F446}',label:'选择'},{key:'pen',icon:'\u{270F}\u{FE0F}',label:'画笔'},{key:'rect',icon:'\u{2B1C}',label:'矩形'},{key:'ellipse',icon:'\u{2B55}',label:'圆形'},{key:'line',icon:'\u{1F4CF}',label:'直线'},{key:'arrow',icon:'\u{27A1}\u{FE0F}',label:'箭头'},{key:'eraser',icon:'\u{1F9F9}',label:'橡皮'},{key:'text',icon:'\u{1F4AC}',label:'文字'}].map(t=>(
            <button key={t.key} className={`${styles.actionBtn} ${toolMode===t.key?styles.templateActive:''}`}
              onClick={()=>{setToolMode(toolMode===t.key?'select':t.key);setSelObj(null);setDrawing(false);if(t.key!=='text')setTextInput(null)}} title={t.label}>{t.icon} {t.label}</button>
          ))}
        </div>
        <div className={styles.toolGroup}>
          <span className={styles.toolLabel}>画笔</span>
          <button className={`${styles.toolBtn} ${styles.active}`} onClick={onToggle}>X</button>
          <div className={styles.colors}>
            {COLORS.map(c=><button key={c} className={styles.colorBtn} style={{background:c,border:color===c?'2px solid #fff':'1px solid #666'}} onClick={e=>{e.stopPropagation();setColor(c)}}/>)}
          </div>
          <div className={styles.sizes}>
            {SIZES.map(s=><button key={s} className={`${styles.sizeBtn} ${size===s?styles.activeSize:''}`} onClick={e=>{e.stopPropagation();setSize(s)}}><span style={{width:s,height:s,borderRadius:'50%',background:'#fff',display:'inline-block'}}/></button>)}
          </div>
        </div>
        <div className={styles.toolGroup}>
          <button className={`${styles.actionBtn} ${onionSkin?styles.onionActive:''}`} onClick={()=>setOnionSkin(!onionSkin)}>G 叠影</button>
          <button className={styles.actionBtn} onClick={undoStroke}>U 撤销</button>
          <button className={styles.actionBtn} onClick={clearFrame}>D 清除</button>
          <span className={styles.toolLabel} style={{marginLeft:8}}>已绘{frameKeys.length}帧/{((drawingsRef.current[currentFrameRef.current]||[]).length)}笔{selObj&&' | 选中:'+(selObj.type==='text'?'文字':'对象')}</span>
        </div>
      </div>

      {frameKeys.length>0&&(
        <div className={styles.markerBar}>
          <span className={styles.markerLabel}>已标记帧:</span>
          <div className={styles.markerStrip}>
            {frameKeys.map(fn=><button key={fn} className={`${styles.marker} ${fn===currentFrame?styles.markerActive:''}`} onClick={()=>{currentFrameRef.current=fn;onSeek(fn)}} title={'第'+fn+'帧'}>{fn}</button>)}
          </div>
        </div>
      )}
    </>
  )
}
