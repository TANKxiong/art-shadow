import React from 'react'
import styles from '../styles/ModuleHome.module.css'

const MODULES = [
  {
    id: 'material',
    name: '素材库',
    icon: '📚',
    desc: '收集、分类、检索动画参考素材。支持视频/图片导入、B站链接、拖拽上传、时长裁剪。',
    tags: ['导入素材', '分类管理', '标签检索'],
    tagClass: 'tagBlue'
  },
  {
    id: 'create',
    name: '创作台',
    icon: '🎨',
    desc: '逐帧画笔标注、形状绘制、文字批注、3D人偶摆拍。在视频上直接创作反馈。',
    tags: ['画笔工具', '逐帧标注', '叠影参考'],
    tagClass: 'tagOrange'
  },
  {
    id: 'feedback',
    name: '反馈室',
    icon: '💬',
    desc: '团队协作评审、动画反馈汇总、修改意见追踪。让外包沟通更高效。',
    tags: ['多人协作', '意见汇总', '版本对比'],
    tagClass: 'tagGreen'
  }
]

export default function ModuleHome({ onSelect, user, onLoginClick }) {
  return (
    <div className={styles.moduleHome}>
      {user ? (
        <div className={styles.userBadge} onClick={onLoginClick}>
          <div className={styles.userIcon}>{user.name[0]}</div>
          <span>{user.name}</span>
        </div>
      ) : (
        <div className={styles.userBadge} onClick={onLoginClick}>
          <span>👤 登录</span>
        </div>
      )}
      <div className={styles.moduleTitle}>画影客</div>
      <div className={styles.moduleSub}>游走于绘画与影像之间的创作工具</div>
      <div className={styles.moduleCards}>
        {MODULES.map(m => (
          <div key={m.id} className={styles.moduleCard} onClick={() => onSelect(m.id)}>
            <span className={styles.moduleIcon}>{m.icon}</span>
            <div className={styles.moduleName}>{m.name}</div>
            <div className={styles.moduleDesc}>{m.desc}</div>
            <div>
              {m.tags.map(t => (
                <span key={t} className={`${styles.moduleTag} ${styles[m.tagClass]}`}>{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
