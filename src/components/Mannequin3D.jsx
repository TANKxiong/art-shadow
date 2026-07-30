import React from 'react'

// ========== 3D Projection ==========
function project(x, y, z, cx, cy, angle, scale = 1) {
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const rx = x * cos - z * sin
  const rz = x * sin + z * cos
  return {
    x: cx + rx * scale,
    y: cy - y * scale + rz * 0.15 * scale,
    depth: rz
  }
}

// Draw a 3D box (cuboid) with visible faces shaded
function drawBox(ctx, cx, cy, cz, w, h, d, angle, scale, color) {
  const s = scale
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const hw = w / 2, hh = h / 2, hd = d / 2

  // 8 corners
  const corners = [
    project(-hw, -hh, -hd, cx, cy, angle, s),
    project(+hw, -hh, -hd, cx, cy, angle, s),
    project(+hw, +hh, -hd, cx, cy, angle, s),
    project(-hw, +hh, -hd, cx, cy, angle, s),
    project(-hw, -hh, +hd, cx, cy, angle, s),
    project(+hw, -hh, +hd, cx, cy, angle, s),
    project(+hw, +hh, +hd, cx, cy, angle, s),
    project(-hw, +hh, +hd, cx, cy, angle, s),
  ]

  // Face definitions: [indices, color variant]
  const faces = [
    { idx: [0,1,2,3], c: color, label: 'front' },
    { idx: [1,5,6,2], c: shadeColor(color, 0.7), label: 'right' },
    { idx: [4,0,3,7], c: shadeColor(color, 0.6), label: 'left' },
    { idx: [4,5,1,0], c: shadeColor(color, 0.85), label: 'top' },
  ]

  // Sort faces by average depth (painter's algorithm)
  faces.sort((a, b) => {
    const aDepth = a.idx.reduce((s, i) => s + corners[i].depth, 0) / 4
    const bDepth = b.idx.reduce((s, i) => s + corners[i].depth, 0) / 4
    return aDepth - bDepth
  })

  // Draw faces
  const strokes = []
  faces.forEach(face => {
    const pts = face.idx.map(i => corners[i])
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
    ctx.fillStyle = face.c
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 0.8
    ctx.stroke()
  })

  return corners
}

// Draw a trapezoidal box (wider at top, narrower at bottom)
function drawTrapezoid(ctx, cx, cy, cz, topW, botW, h, d, angle, scale, color) {
  const s = scale, cos = Math.cos(angle), sin = Math.sin(angle)
  const thw = topW / 2, bhw = botW / 2, hh = h / 2, hd = d / 2

  const corners = [
    project(-thw, -hh, -hd, cx, cy, angle, s),
    project(+thw, -hh, -hd, cx, cy, angle, s),
    project(+bhw, +hh, -hd, cx, cy, angle, s),
    project(-bhw, +hh, -hd, cx, cy, angle, s),
    project(-thw, -hh, +hd, cx, cy, angle, s),
    project(+thw, -hh, +hd, cx, cy, angle, s),
    project(+bhw, +hh, +hd, cx, cy, angle, s),
    project(-bhw, +hh, +hd, cx, cy, angle, s),
  ]

  const faces = [
    { idx: [0,1,2,3], c: color },
    { idx: [1,5,6,2], c: shadeColor(color, 0.7) },
    { idx: [4,0,3,7], c: shadeColor(color, 0.6) },
    { idx: [4,5,1,0], c: shadeColor(color, 0.85) },
  ]

  faces.sort((a, b) => {
    const aD = a.idx.reduce((s, i) => s + corners[i].depth, 0) / 4
    const bD = b.idx.reduce((s, i) => s + corners[i].depth, 0) / 4
    return aD - bD
  })

  faces.forEach(face => {
    const pts = face.idx.map(i => corners[i])
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    ctx.closePath()
    ctx.fillStyle = face.c
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'
    ctx.lineWidth = 0.8
    ctx.stroke()
  })

  return corners
}

// Draw a cylinder/limb
function drawLimb(ctx, cx, cy, cz, w, h, d, angle, scale, color) {
  return drawBox(ctx, cx, cy, cz, w, h, d, angle, scale, color)
}

// Draw sphere-like head
function drawHead(ctx, cx, cy, cz, r, angle, scale, color) {
  const s = scale
  // Draw as circle (2D approximation) with 3D shading
  const p = project(0, 0, 0, cx, cy, angle, s)
  const grad = ctx.createRadialGradient(p.x - r*s*0.3, p.y - r*s*0.4, r*s*0.1, p.x, p.y, r*s)
  grad.addColorStop(0, shadeColor(color, 1.2))
  grad.addColorStop(0.7, color)
  grad.addColorStop(1, shadeColor(color, 0.5))
  ctx.beginPath()
  ctx.arc(p.x, p.y, r * s, 0, Math.PI * 2)
  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Eye line indicator
  const eyeY = p.y - r * s * 0.1
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(p.x - r*s*0.5, eyeY)
  ctx.lineTo(p.x + r*s*0.5, eyeY)
  ctx.stroke()

  return [p]
}

function shadeColor(color, factor) {
  const hex = color.replace('#', '')
  const r = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(0,2), 16) * factor)))
  const g = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(2,4), 16) * factor)))
  const b = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(4,6), 16) * factor)))
  return `rgb(${r},${g},${b})`
}

// ========== 3D Mannequin ==========
export function drawMannequin3D(ctx, cx, cy, angle = 0, scale = 1) {
  const s = scale
  const torsoColor = '#5b9bd5'
  const headColor = '#fbbf24'
  const limbColor = '#94a3b8'

  // Body proportions
  const headR = 14 * s
  const neckLen = 4 * s
  const torsoTopW = 28 * s
  const torsoBotW = 22 * s
  const torsoH = 34 * s
  const torsoD = 14 * s
  const pelvisW = 24 * s
  const pelvisH = 10 * s
  const pelvisD = 12 * s
  const armW = 8 * s, armD = 7 * s
  const forearmW = 7 * s, forearmD = 6 * s
  const armLen = 24 * s, forearmLen = 22 * s
  const legW = 10 * s, legD = 9 * s
  const shinW = 8 * s, shinD = 7 * s
  const thighLen = 28 * s, shinLen = 26 * s
  const footW = 8 * s, footH = 4 * s, footD = 14 * s

  // Positions in 3D space (y-up, z-depth, x-left/right)
  const headTop = 0
  const neckJ = headTop + headR + neckLen * 0.3
  const shoulderJ = neckJ + 4 * s
  const hipJ = shoulderJ + torsoH
  const pelvisJ = hipJ + pelvisH * 0.4
  const kneeJ = pelvisJ + thighLen
  const ankleJ = kneeJ + shinLen

  // Head
  drawHead(ctx, cx, headTop + headR, 0, headR, angle, 1, headColor)

  // Neck
  drawBox(ctx, cx, headTop + headR + neckLen * 0.5, 0, headR*0.8, neckLen, headR*0.6, angle, 1, torsoColor)

  // Torso (trapezoid)
  drawTrapezoid(ctx, cx, shoulderJ + torsoH * 0.5, 0, torsoTopW, torsoBotW, torsoH, torsoD, angle, 1, torsoColor)

  // Pelvis
  drawBox(ctx, cx, hipJ + pelvisH * 0.5, 0, pelvisW, pelvisH, pelvisD, angle, 1, shadeColor(torsoColor, 0.8))

  // Chest cross line
  const chestY = shoulderJ + torsoH * 0.25
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 0.5
  const cl = project(-torsoTopW * 0.4, chestY, 0, cx, cy, angle)
  const cr = project(+torsoTopW * 0.4, chestY, 0, cx, cy, angle)
  ctx.beginPath(); ctx.moveTo(cl.x, cl.y); ctx.lineTo(cr.x, cr.y); ctx.stroke()

  // Waist cross line
  const waistY = hipJ - 4 * s
  const wl = project(-torsoBotW * 0.4, waistY, 0, cx, cy, angle)
  const wr = project(+torsoBotW * 0.4, waistY, 0, cx, cy, angle)
  ctx.beginPath(); ctx.moveTo(wl.x, wl.y); ctx.lineTo(wr.x, wr.y); ctx.stroke()

  // Arms
  const shoulderArmX = torsoTopW * 0.38
  const elbowX = shoulderArmX + 4 * s
  const wristX = shoulderArmX + 2 * s

  // Right arm (from our perspective, their left)
  drawLimb(ctx, cx + shoulderArmX, shoulderJ + armLen * 0.45, 0, armW, armLen, armD, angle, 1, limbColor)
  drawLimb(ctx, cx + elbowX, shoulderJ + armLen + forearmLen * 0.45, 0, forearmW, forearmLen, forearmD, angle, 1, limbColor)
  // Shoulder joint
  const sj = project(cx + shoulderArmX, shoulderJ, 0, cx, cy, angle)
  ctx.beginPath(); ctx.arc(sj.x, sj.y, 3, 0, Math.PI*2); ctx.fillStyle = shadeColor(limbColor, 0.7); ctx.fill()

  // Left arm
  drawLimb(ctx, cx - shoulderArmX, shoulderJ + armLen * 0.45, 0, armW, armLen, armD, angle, 1, limbColor)
  drawLimb(ctx, cx - elbowX, shoulderJ + armLen + forearmLen * 0.45, 0, forearmW, forearmLen, forearmD, angle, 1, limbColor)
  const sj2 = project(cx - shoulderArmX, shoulderJ, 0, cx, cy, angle)
  ctx.beginPath(); ctx.arc(sj2.x, sj2.y, 3, 0, Math.PI*2); ctx.fillStyle = shadeColor(limbColor, 0.7); ctx.fill()

  // Hands
  drawBox(ctx, cx + wristX, shoulderJ + armLen + forearmLen + 2 * s, 0, 5*s, 7*s, 3*s, angle, 1, headColor)
  drawBox(ctx, cx - wristX, shoulderJ + armLen + forearmLen + 2 * s, 0, 5*s, 7*s, 3*s, angle, 1, headColor)

  // Legs
  const hipLegX = pelvisW * 0.25
  drawLimb(ctx, cx + hipLegX, pelvisJ + thighLen * 0.45, 0, legW, thighLen, legD, angle, 1, limbColor)
  drawLimb(ctx, cx + hipLegX, kneeJ + shinLen * 0.45, 0, shinW, shinLen, shinD, angle, 1, limbColor)
  drawLimb(ctx, cx - hipLegX, pelvisJ + thighLen * 0.45, 0, legW, thighLen, legD, angle, 1, limbColor)
  drawLimb(ctx, cx - hipLegX, kneeJ + shinLen * 0.45, 0, shinW, shinLen, shinD, angle, 1, limbColor)

  // Knee joints
  const kj1 = project(cx + hipLegX, kneeJ, 0, cx, cy, angle)
  const kj2 = project(cx - hipLegX, kneeJ, 0, cx, cy, angle)
  ctx.beginPath(); ctx.arc(kj1.x, kj1.y, 2.5, 0, Math.PI*2); ctx.fillStyle = shadeColor(limbColor, 0.7); ctx.fill()
  ctx.beginPath(); ctx.arc(kj2.x, kj2.y, 2.5, 0, Math.PI*2); ctx.fillStyle = shadeColor(limbColor, 0.7); ctx.fill()

  // Feet
  const footY = ankleJ + footH * 0.3
  drawBox(ctx, cx + hipLegX + 3*s, footY, footD * 0.5, footW, footH, footD, angle, 1, shadeColor(limbColor, 0.6))
  drawBox(ctx, cx - hipLegX - 3*s, footY, footD * 0.5, footW, footH, footD, angle, 1, shadeColor(limbColor, 0.6))
}

// Export for template system
export const TEMPLATES_3D = {
  mannequin3d: {
    name: '3D体块人偶',
    icon: '🧍‍♂️',
    draw: (ctx, x, y, params = {}) => {
      drawMannequin3D(ctx, x, y, params.angle || 0, params.scale || (params.scale ?? 1))
    }
  }
}
