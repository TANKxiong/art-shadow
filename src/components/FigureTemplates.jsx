import React, { useRef } from 'react'

// ========== Figure Templates ==========

function makeStroke(points, color, size) {
  return points.map(p => ({ x: p[0], y: p[1], color, size }))
}

// Simple circle helper (polygon approximation)
function circlePoints(cx, cy, r, segments = 24) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

// Stick figure - head circle + spine + limbs
function stickFigure(cx, cy, scale = 1) {
  const s = scale
  const headR = 12 * s
  const neckY = cy - headR * 2
  const spineLen = 30 * s
  const shoulderW = 18 * s
  const hipW = 14 * s
  const armLen = 28 * s
  const legLen = 32 * s

  const strokes = []
  const color = '#44cc44'
  const size = 2.5

  // Head
  strokes.push(makeStroke(circlePoints(cx, cy - headR, headR, 20), color, size))

  // Spine: neck → hip
  strokes.push(makeStroke([[cx, neckY + headR], [cx, neckY + headR + spineLen]], color, size))

  // Shoulders
  strokes.push(makeStroke([[cx - shoulderW, neckY + headR + 4], [cx + shoulderW, neckY + headR + 4]], color, size))

  // Hips
  const hipY = neckY + headR + spineLen
  strokes.push(makeStroke([[cx - hipW, hipY], [cx + hipW, hipY]], color, size))

  // Arms
  const elbowY = neckY + headR + spineLen * 0.45
  strokes.push(makeStroke([
    [cx - shoulderW, neckY + headR + 4],
    [cx - shoulderW - 8 * s, elbowY],
    [cx - shoulderW - 4 * s, hipY]
  ], color, size))
  strokes.push(makeStroke([
    [cx + shoulderW, neckY + headR + 4],
    [cx + shoulderW + 8 * s, elbowY],
    [cx + shoulderW + 4 * s, hipY]
  ], color, size))

  // Legs
  const kneeY = hipY + legLen * 0.5
  strokes.push(makeStroke([[cx - 5 * s, hipY], [cx - 6 * s, kneeY], [cx - 7 * s, hipY + legLen]], color, size))
  strokes.push(makeStroke([[cx + 5 * s, hipY], [cx + 6 * s, kneeY], [cx + 7 * s, hipY + legLen]], color, size))

  // Feet
  strokes.push(makeStroke([
    [cx - 7 * s - 4 * s, hipY + legLen],
    [cx - 7 * s + 4 * s, hipY + legLen]
  ], color, size))
  strokes.push(makeStroke([
    [cx + 7 * s - 4 * s, hipY + legLen],
    [cx + 7 * s + 4 * s, hipY + legLen]
  ], color, size))

  return strokes
}

// Block mannequin - head + torso box + limbs
function blockMannequin(cx, cy, scale = 1) {
  const s = scale
  const headR = 11 * s
  const neckBase = cy - headR * 2.2
  const torsoH = 32 * s
  const torsoW = 16 * s
  const shoulderW = 20 * s
  const hipW = 15 * s
  const armLen = 26 * s
  const legLen = 30 * s

  const strokes = []
  const color = '#4488ff'
  const size = 2.5

  // Head circle
  strokes.push(makeStroke(circlePoints(cx, cy - headR, headR, 20), color, size))

  // Torso box
  const tx = cx - torsoW / 2, ty = neckBase, tw = torsoW, th = torsoH
  strokes.push(makeStroke([[tx, ty], [tx + tw, ty], [tx + tw, ty + th], [tx, ty + th], [tx, ty]], color, size))

  // Shoulders
  strokes.push(makeStroke([[cx - shoulderW, neckBase + 4], [cx + shoulderW, neckBase + 4]], color, size * 1.3))

  // Hips
  strokes.push(makeStroke([[cx - hipW, ty + th], [cx + hipW, ty + th]], color, size * 1.3))

  // Arms (with elbow joints)
  const elbowY = ty + torsoH * 0.35
  strokes.push(makeStroke([
    [cx - shoulderW, neckBase + 4],
    [cx - shoulderW - 7 * s, elbowY],
    [cx - shoulderW - 3 * s, ty + th]
  ], color, size))
  strokes.push(makeStroke([
    [cx + shoulderW, neckBase + 4],
    [cx + shoulderW + 7 * s, elbowY],
    [cx + shoulderW + 3 * s, ty + th]
  ], color, size))

  // Joint dots
  const dotR = 2
  strokes.push(makeStroke(circlePoints(cx - shoulderW, neckBase + 4, dotR, 8), color, size * 0.8))
  strokes.push(makeStroke(circlePoints(cx + shoulderW, neckBase + 4, dotR, 8), color, size * 0.8))

  // Legs (with knee joints)
  const hipY = ty + th
  const kneeY = hipY + legLen * 0.45
  strokes.push(makeStroke([
    [cx - 4 * s, hipY],
    [cx - 6 * s, kneeY],
    [cx - 8 * s, hipY + legLen]
  ], color, size))
  strokes.push(makeStroke([
    [cx + 4 * s, hipY],
    [cx + 6 * s, kneeY],
    [cx + 8 * s, hipY + legLen]
  ], color, size))

  // Feet
  strokes.push(makeStroke([
    [cx - 8 * s - 5 * s, hipY + legLen],
    [cx - 8 * s + 5 * s, hipY + legLen]
  ], color, size))
  strokes.push(makeStroke([
    [cx + 8 * s - 5 * s, hipY + legLen],
    [cx + 8 * s + 5 * s, hipY + legLen]
  ], color, size))

  return strokes
}

// Action line - dynamic curve
function actionLine(cx, cy, scale = 1) {
  const s = scale
  const strokes = []
  const color = '#ff8800'
  const size = 3

  // Main arc
  const pts = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const x = cx - 40 * s + t * 80 * s
    const y = cy + Math.sin(t * Math.PI * 2) * 20 * s
    pts.push([x, y])
  }
  strokes.push(makeStroke(pts, color, size))

  // Arrow head
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2]
  const dx = last[0] - prev[0], dy = last[1] - prev[1]
  const len = Math.sqrt(dx * dx + dy * dy)
  const ndx = dx / len, ndy = dy / len
  const arrowSize = 8 * s
  strokes.push(makeStroke([
    [last[0], last[1]],
    [last[0] - ndx * arrowSize + ndy * arrowSize * 0.5, last[1] - ndy * arrowSize - ndx * arrowSize * 0.5],
    [last[0] - ndx * arrowSize - ndy * arrowSize * 0.5, last[1] - ndy * arrowSize + ndx * arrowSize * 0.5]
  ], '#ff4400', size * 1.2))

  return strokes
}

// Head template
function headTemplate(cx, cy, scale = 1) {
  const s = scale
  const strokes = []
  const color = '#aa44ff'
  const size = 2

  // Head oval
  const headH = 22 * s, headW = 16 * s
  const hx = cx
  strokes.push(makeStroke(circlePoints(hx, cy, headW * 0.7, 24), color, size))

  // Jaw
  strokes.push(makeStroke([[hx - headW * 0.5, cy + headW * 0.3], [hx, cy + headH * 0.8], [hx + headW * 0.5, cy + headW * 0.3]], color, size))

  // Eye line
  strokes.push(makeStroke([[hx - headW * 0.45, cy - headW * 0.05], [hx + headW * 0.45, cy - headW * 0.05]], color, size * 0.6))

  // Nose line
  strokes.push(makeStroke([[hx, cy - headW * 0.05], [hx, cy + headW * 0.25]], color, size * 0.6))

  // Center line
  strokes.push(makeStroke([[hx, cy - headH * 0.3], [hx, cy + headH * 0.8]], color, size * 0.4))

  return strokes
}

const TEMPLATES = {
  stick: { name: '火柴人', fn: stickFigure, icon: '🧍' },
  block: { name: '体块人偶', fn: blockMannequin, icon: '🧑' },
  action: { name: '运动趋势线', fn: actionLine, icon: '〰️' },
  head: { name: '头部参考', fn: headTemplate, icon: '🗣️' },
}

export { TEMPLATES }
