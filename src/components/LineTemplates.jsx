import React from 'react'

function makeStroke(pts, color, size) {
  return pts.map(p => ({ x: p[0], y: p[1], color, size }))
}

// Apply rotation + scale to points
function transformPts(pts, cx, cy, angle, scale) {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return pts.map(([x, y]) => {
    const dx = (x - cx) * scale, dy = (y - cy) * scale
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
  })
}

const LINE_COLOR = '#ff6b35'
const LINE_SIZE = 3

// ====== Line Templates ======

// 1. 运动弧线 - curved motion arc with arrow
function motionArc(cx, cy, angle, scale) {
  const s = scale
  const raw = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    raw.push([-50*s + t*100*s, Math.sin(t*Math.PI*2)*22*s])
  }
  const pts = transformPts(raw, 0, 0, angle, 1)
  const strokes = [makeStroke(pts.map(([x,y]) => [cx+x, cy+y]), LINE_COLOR, LINE_SIZE)]

  // Arrow head
  const last = pts[pts.length-1], prev = pts[pts.length-2]
  const dx = last[0]-prev[0], dy = last[1]-prev[1]
  const len = Math.sqrt(dx*dx+dy*dy)
  const nx = dx/len, ny = dy/len
  const as = 10*s
  const arrow = [
    [cx+last[0], cy+last[1]],
    [cx+last[0]-nx*as+ny*as*0.5, cy+last[1]-ny*as-nx*as*0.5],
    [cx+last[0]-nx*as-ny*as*0.5, cy+last[1]-ny*as+nx*as*0.5]
  ]
  strokes.push(makeStroke(arrow, '#ff2200', LINE_SIZE*1.3))
  return strokes
}

// 2. 直线箭头 - straight directional arrow
function straightArrow(cx, cy, angle, scale) {
  const s = scale
  const raw = [[-45*s, 0], [45*s, 0]]
  const pts = transformPts(raw, 0, 0, angle, 1)
  const strokes = [makeStroke(pts.map(([x,y]) => [cx+x, cy+y]), LINE_COLOR, LINE_SIZE)]

  const tip = pts[1], base = pts[0]
  const dx = tip[0]-base[0], dy = tip[1]-base[1]
  const len = Math.sqrt(dx*dx+dy*dy)
  const nx = dx/len, ny = dy/len
  const as = 12*s
  strokes.push(makeStroke([
    [cx+tip[0], cy+tip[1]],
    [cx+tip[0]-nx*as+ny*as*0.5, cy+tip[1]-ny*as-nx*as*0.5],
    [cx+tip[0]-nx*as-ny*as*0.5, cy+tip[1]-ny*as+nx*as*0.5]
  ], '#ff2200', LINE_SIZE*1.3))
  return strokes
}

// 3. 双弧线 - S-curve / double arc for complex motion
function doubleArc(cx, cy, angle, scale) {
  const s = scale * 0.7
  const raw1 = [], raw2 = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, x = -35*s + t*70*s
    raw1.push([x, Math.sin(t*Math.PI)*18*s])
    raw2.push([x, -Math.sin(t*Math.PI)*18*s])
  }
  const strokes = [
    makeStroke(transformPts(raw1, 0, 0, angle, 1).map(([x,y]) => [cx+x, cy+y]), LINE_COLOR, LINE_SIZE*0.8),
    makeStroke(transformPts(raw2, 0, 0, angle, 1).map(([x,y]) => [cx+x, cy+y]), '#ff4400', LINE_SIZE*0.8),
  ]
  return strokes
}

// 4. 速度线 - speed/motion lines (parallel streaks)
function speedLines(cx, cy, angle, scale) {
  const s = scale
  const strokes = []
  const count = 5, spacing = 8*s, lineLen = 40*s
  for (let i = 0; i < count; i++) {
    const ox = (i - (count-1)/2) * spacing
    const raw = [[ox, -lineLen/2], [ox, lineLen/2]]
    const pts = transformPts(raw, 0, 0, angle, 1)
    strokes.push(makeStroke(pts.map(([x,y]) => [cx+x, cy+y]), LINE_COLOR, LINE_SIZE*(0.6 + i/count*0.8)))
  }
  return strokes
}

// 5. 圆圈标注 - circle highlight
function circleMark(cx, cy, angle, scale) {
  const s = scale
  const r = 30 * s
  const raw = []
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2
    raw.push([Math.cos(a)*r, Math.sin(a)*r])
  }
  return [makeStroke(raw.map(([x,y]) => [cx+x, cy+y]), '#ffdd00', LINE_SIZE)]
}

// 6. 冲击波 - impact burst radial lines
function impactBurst(cx, cy, angle, scale) {
  const s = scale
  const strokes = []
  const count = 8, maxR = 35*s, minR = 12*s
  for (let i = 0; i < count; i++) {
    const a = (i/count)*Math.PI*2 + angle
    const raw = [[Math.cos(a)*minR, Math.sin(a)*minR], [Math.cos(a)*maxR, Math.sin(a)*maxR]]
    strokes.push(makeStroke(raw.map(([x,y]) => [cx+x, cy+y]), LINE_COLOR, LINE_SIZE))
  }
  return strokes
}

// 7. 十字准星 - crosshair for precise pointing
function crosshair(cx, cy, angle, scale) {
  const s = scale * 0.8
  const strokes = []
  const gap = 6*s, len = 25*s
  strokes.push(makeStroke([[cx-gap, cy], [cx-len, cy]], '#44cc44', LINE_SIZE*0.8))
  strokes.push(makeStroke([[cx+gap, cy], [cx+len, cy]], '#44cc44', LINE_SIZE*0.8))
  strokes.push(makeStroke([[cx, cy-gap], [cx, cy-len]], '#44cc44', LINE_SIZE*0.8))
  strokes.push(makeStroke([[cx, cy+gap], [cx, cy+len]], '#44cc44', LINE_SIZE*0.8))
  // Center dot
  const dot = []
  for (let i=0;i<=12;i++) dot.push([cx+Math.cos(i/12*Math.PI*2)*2*s, cy+Math.sin(i/12*Math.PI*2)*2*s])
  strokes.push(makeStroke(dot, '#ff2200', LINE_SIZE*1.5))
  return strokes
}

// 8. 矩形框选 - rectangle selection
function rectSelect(cx, cy, angle, scale) {
  const s = scale
  const hw = 35*s, hh = 22*s
  const raw = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh],[-hw,-hh]]
  const pts = transformPts(raw, 0, 0, angle, 1)
  return [makeStroke(pts.map(([x,y]) => [cx+x, cy+y]), '#4488ff', LINE_SIZE*1.2)]
}

export const LINE_TEMPLATES = {
  arc:       { name: '运动弧线', icon: '〰️', fn: motionArc },
  straight:  { name: '直线箭头', icon: '➡️', fn: straightArrow },
  double:    { name: '双弧线',   icon: '🌀', fn: doubleArc },
  speed:     { name: '速度线',   icon: '💨', fn: speedLines },
  circle:    { name: '圆圈标注', icon: '⭕', fn: circleMark },
  impact:    { name: '冲击波',   icon: '💥', fn: impactBurst },
  crosshair: { name: '十字准星', icon: '➕', fn: crosshair },
  rect:      { name: '矩形框选', icon: '⬜', fn: rectSelect },
}
