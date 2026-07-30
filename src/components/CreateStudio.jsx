import React, { useState } from 'react'
import styles from '../styles/CreateStudio.module.css'

const TOOLS = [
  { id: 'brush', icon: '✏️', label: '画笔' },
  { id: 'eraser', icon: '◯', label: '橡皮' },
  { id: 'fill', icon: '🪣', label: '填充' },
  { id: 'text', icon: 'T', label: '文字' },
]
const TOOLS2 = [
  { id: 'rect', icon: '□', label: '矩形' },
  { id: 'circle', icon: '○', label: '圆形' },
  { id: 'line', icon: '╱', label: '直线' },
  { id: 'move', icon: '↕', label: '移动' },
]

const COLORS = [
  '#ffffff','#e2e8f0','#cbd5e1','#94a3b8',
  '#f87171','#fb923c','#fbbf24','#a3e635',
  '#34d399','#22d3ee','#60a5fa','#818cf8',
  '#a78bfa','#f472b6','#fb7185','#facc15',
  '#000000','#1e293b','#475569','#64748b',
]

export default function CreateStudio({ onBack }) {
  const [activeTool, setActiveTool] = useState('brush')
  const [activeColor, setActiveColor] = useState('#f87171')
  const [brushSize, setBrushSize] = useState(4)

  const layers = ['草图', '线稿', '底色', '阴影', '高光']

  return (
    <div className={styles.createStudio}>
      {/* Left toolbar */}
      <div className={styles.toolbar}>
        {TOOLS.map(t => (
          <button key={t.id} className={`${styles.tool} ${activeTool===t.id?styles.toolActive:''}`}
            onClick={() => setActiveTool(t.id)} title={t.label}>{t.icon}</button>
        ))}
        <div className={styles.toolDivider} />
        {TOOLS2.map(t => (
          <button key={t.id} className={`${styles.tool} ${activeTool===t.id?styles.toolActive:''}`}
            onClick={() => setActiveTool(t.id)} title={t.label}>{t.icon}</button>
        ))}
        <div style={{flex:1}} />
      </div>

      {/* Palette */}
      <div className={styles.palette}>
        <div>
          <div className={styles.paletteTitle}>画笔颜色</div>
          <div className={styles.colorGrid}>
            {COLORS.map(c => (
              <div key={c} className={`${styles.colorSwatch} ${activeColor===c?styles.active:''}`}
                style={{background:c, borderColor: c==='#ffffff'?'#1e2130':undefined}}
                onClick={() => setActiveColor(c)} />
            ))}
          </div>
        </div>
        <div className={styles.brushSection}>
          <div className={styles.paletteTitle}>画笔粗细 · {brushSize}px</div>
          <input type="range" className={styles.brushSize} min={1} max={20} value={brushSize}
            onChange={e => setBrushSize(Number(e.target.value))} />
        </div>
        <div>
          <div className={styles.paletteTitle}>预设画笔</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
            {['基本','铅笔','马克笔','水彩','喷枪','模糊'].map(p => (
              <span key={p} style={{padding:'4px 12px',borderRadius:16,background:'#1e2130',fontSize:12,color:'#94a3b8',cursor:'pointer'}}>{p}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div style={{flex:1,display:'flex',flexDirection:'column'}}>
        {/* Top bar */}
        <div className={styles.topBar}>
          <button className={styles.topBtn} onClick={onBack}>← 返回首页</button>
          <div className={styles.topTitle}>🎨 创作台</div>
          <button className={styles.topBtn}>↩ 撤销</button>
          <button className={styles.topBtn}>↪ 重做</button>
          <button className={styles.topBtn}>文件</button>
          <button className={`${styles.topBtn} ${styles.topBtnPrimary}`}>导出</button>
        </div>

        {/* Canvas */}
        <div className={styles.canvasArea}>
          <div className={styles.artBoard}>
            <div className={styles.welcomeOverlay}>
              <div className={styles.welcomeIcon}>🎨</div>
              <div className={styles.welcomeText}>在画布上自由创作</div>
              <div className={styles.welcomeSub}>选择左侧工具开始绘制</div>
            </div>
          </div>
        </div>
      </div>

      {/* Layers panel */}
      <div className={styles.layerPanel}>
        <div className={styles.paletteTitle}>图层</div>
        <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:2}}>
          {layers.map((l,i) => (
            <div key={l} className={`${styles.layerItem} ${i===0?styles.active:''}`}>
              <div className={styles.layerThumb} style={{background:i===0?'#6366f1':undefined}} />
              <span className={styles.layerName}>{l}</span>
              <span className={styles.layerEye}>👁</span>
            </div>
          ))}
        </div>
        <div style={{marginTop:16,display:'flex',gap:8}}>
          <button className={styles.topBtn} style={{flex:1}}>+ 新建</button>
        </div>
      </div>
    </div>
  )
}
