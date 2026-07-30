import React, { useState } from 'react'
import { useStore } from '../store/StoreContext'
import styles from '../styles/FeedbackRoom.module.css'

export default function FeedbackRoom({ onBack }) {
  const { state, dispatch } = useStore()
  const { materials } = state
  const [active, setActive] = useState('collab')
  const [selectedMat, setSelectedMat] = useState(null)
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)

  const [feedbacks, setFeedbacks] = useState(() => {
    const saved = localStorage.getItem('artshadow-feedbacks')
    return saved ? JSON.parse(saved) : []
  })
  const saveFeedbacks = (fb) => { setFeedbacks(fb); localStorage.setItem('artshadow-feedbacks', JSON.stringify(fb)) }

  const addFeedback = () => {
    if (!selectedMat) return
    const fb = { id: Date.now().toString(36), materialId: selectedMat,
      frame: prompt('帧号', '整体')||'整体', content: prompt('反馈')||'',
      author: JSON.parse(localStorage.getItem('artshadow-user')||'{}').name||'匿名',
      status: '待处理', createdAt: new Date().toLocaleString('zh-CN') }
    if (fb.content) saveFeedbacks([fb, ...feedbacks])
  }
  const updateStatus = (id, s) => saveFeedbacks(feedbacks.map(f => f.id===id?{...f,status:s}:f))
  const deleteFeedback = (id) => saveFeedbacks(feedbacks.filter(f => f.id!==id))
  const matFeedbacks = feedbacks.filter(f => f.materialId === selectedMat)

  const handleImport = () => {
    const inp = document.createElement('input'); inp.type='file'; inp.multiple=true; inp.accept='video/*,image/*'
    inp.onchange = e => dispatch({type:'ADD_MATERIALS',payload:Array.from(e.target.files).map(f => ({
      id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),
      originalName:f.name,type:f.type.startsWith('video/')?'video':'image',
      size:f.size,categoryId:null,importedAt:new Date().toISOString(),_file:f
    }))})
    inp.click()
  }

  const handleDragStart = (e, m) => { e.dataTransfer.setData('materialId', m.id) }
  const handleDrop = (e) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('materialId')
    if (id) { const m = materials.find(m => m.id === id); if (m) dispatch({type:'SET_PREVIEW',payload:m}) }
  }
  const handleDragOver = e => e.preventDefault()

  const [verA, setVerA] = useState(''); const [verB, setVerB] = useState('')
  const matA = materials.find(m => m.id === verA); const matB = materials.find(m => m.id === verB)

  return (
    <div className={styles.room}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={onBack}>← 返回首页</button>
        <div className={styles.topTitle}>💬 反馈室</div>
        <div className={styles.topTabs}>
          <button className={`${styles.topTab} ${active==='collab'?styles.topTabOn:''}`} onClick={()=>setActive('collab')}>👥 多人协作</button>
          <button className={`${styles.topTab} ${active==='summary'?styles.topTabOn:''}`} onClick={()=>setActive('summary')}>📋 意见汇总</button>
          <button className={`${styles.topTab} ${active==='version'?styles.topTabOn:''}`} onClick={()=>setActive('version')}>🔄 版本对比</button>
        </div>
        <button className={styles.importBtn} onClick={handleImport}>+ 导入素材</button>
        <button className={styles.toggleBtn} onClick={()=>setShowLeft(!showLeft)}>{showLeft?'◀':'▶'}</button>
        <button className={styles.toggleBtn} onClick={()=>setShowRight(!showRight)}>{showRight?'▶':'◀'}</button>
      </div>

      <div className={styles.body}>
        {showLeft && (
          <div className={styles.leftPanel}>
            <div className={styles.panelTitle}>素材列表 ({materials.length})</div>
            <div className={styles.matList}>
              {materials.slice(0,30).map(m => (
                <div key={m.id} className={`${styles.matItem} ${selectedMat===m.id?styles.matActive:''}`}
                  onClick={()=>setSelectedMat(m.id)} draggable onDragStart={e=>handleDragStart(e,m)}>
                  <span>{m.type==='video'?'🎬':'🖼️'}</span>
                  <span className={styles.matName}>{m.displayName||m.originalName}</span>
                  <span className={styles.matCount}>{feedbacks.filter(f=>f.materialId===m.id).length}条</span>
                  <button className={styles.matDel} onClick={e=>{e.stopPropagation();if(confirm('删除？'))dispatch({type:'DELETE_MATERIAL',payload:m.id})}}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={styles.centerPanel} onDrop={handleDrop} onDragOver={handleDragOver}>
          <div className={styles.centerEmpty}>
            <span style={{fontSize:64,opacity:.15}}>🎬</span>
            <p style={{fontSize:16,color:'#94a3b8'}}>从左侧拖入素材</p>
            <p style={{fontSize:12,color:'#475569'}}>自动弹出完整预览 · 画笔 · 逐帧 · 标注</p>
          </div>
        </div>

        {showRight && (
          <div className={styles.rightPanel}>
            <div className={styles.panelTitle}>
              {active==='collab'?'反馈区':active==='summary'?'意见汇总':'版本对比'}
              {selectedMat&&active==='collab'&&<button className={styles.addBtn} onClick={addFeedback}>+ 添加</button>}
            </div>
            <div className={styles.rightContent}>
              {active==='collab' && (selectedMat ? matFeedbacks.length===0
                ? <div className={styles.emptyTxt}>暂无反馈</div>
                : matFeedbacks.map(fb => (
                  <div key={fb.id} className={styles.fbItem}>
                    <div className={styles.fbFrame}>{fb.frame}</div>
                    <div className={styles.fbContent}>{fb.content}</div>
                    <div className={styles.fbMeta}>{fb.author}·{fb.createdAt}</div>
                    <select className={`${styles.fbStatus} ${styles['st'+fb.status]}`} value={fb.status} onChange={e=>updateStatus(fb.id,e.target.value)}>
                      <option value="待处理">待处理</option><option value="讨论中">讨论中</option><option value="已处理">已处理</option>
                    </select>
                    <button className={styles.fbDel} onClick={()=>deleteFeedback(fb.id)}>×</button>
                  </div>
                ))
                : <div className={styles.emptyTxt}>← 选择素材</div>
              )}
              {active==='summary' && feedbacks.map(fb => {
                const mat = materials.find(m=>m.id===fb.materialId)
                return (
                  <div key={fb.id} className={styles.fbItem}>
                    <div className={styles.fbFrame}>{fb.frame}</div>
                    <div className={styles.fbContent}>
                      <div style={{fontSize:10,color:'#94a3b8'}}>{mat?.displayName||mat?.originalName||'?'}</div>
                      {fb.content}
                    </div>
                    <div className={styles.fbMeta}>{fb.author}</div>
                    <select className={`${styles.fbStatus} ${styles['st'+fb.status]}`} value={fb.status} onChange={e=>updateStatus(fb.id,e.target.value)}>
                      <option value="待处理">待处理</option><option value="讨论中">讨论中</option><option value="已处理">已处理</option>
                    </select>
                  </div>
                )
              })}
              {active==='version' && (
                <div>
                  <select value={verA} onChange={e=>setVerA(e.target.value)} className={styles.verSelect}><option value="">旧版本</option>{materials.map(m=><option key={m.id} value={m.id}>{m.displayName||m.originalName}</option>)}</select>
                  <div style={{textAlign:'center',padding:'8px 0',fontWeight:700,color:'var(--text-muted)'}}>VS</div>
                  <select value={verB} onChange={e=>setVerB(e.target.value)} className={styles.verSelect}><option value="">新版本</option>{materials.map(m=><option key={m.id} value={m.id}>{m.displayName||m.originalName}</option>)}</select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
