import React, { useState, useEffect } from 'react'
import styles from '../styles/LoginModal.module.css'

export default function LoginModal({ onClose, onLogin }) {
  const [name, setName] = useState('')
  const [isNew, setIsNew] = useState(true)

  const handleSubmit = () => {
    if (!name.trim()) return
    onLogin(name.trim())
    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>👤 登录画影客</h3>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label>用户名</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="输入你的名字"
              autoFocus
            />
          </div>
          <p className={styles.hint}>设定你的创作者名称，方便区分不同用户的素材和标注</p>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>取消</button>
          <button className={styles.loginBtn} onClick={handleSubmit} disabled={!name.trim()}>
            进入画影客
          </button>
        </div>
      </div>
    </div>
  )
}
