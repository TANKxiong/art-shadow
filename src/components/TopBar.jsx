import React from 'react'
import { useStore } from '../store/StoreContext'
import styles from '../styles/TopBar.module.css'

export default function TopBar({ onHome }) {
  const { state, dispatch } = useStore()
  const { categories, selectedCategory, selectedTags, searchQuery, viewMode } = state

  const categoryName = selectedCategory
    ? categories.find(c => c.id === selectedCategory)?.name || '分类'
    : selectedTags.length > 0
      ? `标签: ${selectedTags.join(' + ')}`
      : '全部素材'

  return (
    <header className={styles.topbar}>
      {onHome && (
        <button onClick={onHome} className={styles.homeBtn} title="返回首页">← 首页</button>
      )}
      <div className={styles.breadcrumb}>
        首页 / <span>{categoryName}</span>
      </div>

      <div className={styles.searchBox}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => { if (!e.nativeEvent.isComposing) dispatch({ type: 'SET_SEARCH', payload: e.target.value }) }}
          placeholder="搜索素材名称、来源、标签..."
        />
        {searchQuery && (
          <button className={styles.clearBtn} onClick={() => dispatch({ type: 'SET_SEARCH', payload: '' })}>✕</button>
        )}
      </div>

      <div className={styles.actions}>
        <button className={`${styles.btn} ${viewMode === 'grid' ? styles.active : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'grid' })}>⊞ 网格</button>
        <button className={`${styles.btn} ${viewMode === 'list' ? styles.active : ''}`}
          onClick={() => dispatch({ type: 'SET_VIEW_MODE', payload: 'list' })}>☰ 列表</button>
      </div>
    </header>
  )
}
