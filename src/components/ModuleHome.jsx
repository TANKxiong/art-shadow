import React, { useState, useEffect } from 'react'
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
    desc: '新旧版本并排/上下/重叠对比，同步播放、逐帧检查、画笔标注。让对比反馈更直观。',
    tags: ['版本对比', '同步播放', '逐帧标注'],
    tagClass: 'tagGreen'
  }
]

const APP_VERSION = '1.4.2'

const CHANGELOG = [
  {
    version: '1.4.2',
    date: '2026-08-05',
    title: 'Maya 参考素材导入',
    items: [
      '视频预览新增「🎬 导入 Maya」：一键导出 PNG 序列帧，供 Maya 参考素材导入',
      '导出后自动打开序列帧文件夹，方便在 Maya 中选择',
      '配套 Maya 插件 artshadow_ref.py：自动创建参考相机 + imagePlane'
    ]
  },
  {
    version: '1.4.1',
    date: '2026-08-04',
    title: '系统文件拖拽导入',
    items: [
      '支持从文件夹直接拖拽视频/图片导入（素材库、反馈室、剪辑轨道全部支持）',
      '版本对比：拖素材到旧/新预览框直接替换，支持本地文件拖入自动导入',
      '打包版拖入文件自动转码，保证可播放'
    ]
  },
  {
    version: '1.4.0',
    date: '2026-08-04',
    title: '反馈室 · 剪映式剪辑轨道',
    items: [
      '剪映风格四分区布局：左素材/中预览/右调节/底轨道，面板尺寸可自由拖拽调整',
      '多视频轨编辑：主轨固定、拖素材自动建轨、片段跨轨拖动、首尾裁剪',
      '片段操作：分割/复制/倒放/删除，Ctrl+Z 撤销',
      '时间轴：秒数标尺、可拖拽播放头、缩放滑块、🧲 吸附开关',
      '无缝播放：双缓冲预加载，素材切换不黑屏；预览显示最上层轨道',
      '素材拖入自动识别真实时长',
      '快捷键：空格播放/暂停、左右键逐帧、Delete 删除、Ctrl+Z 撤销'
    ]
  },
  {
    version: '1.3.0',
    date: '2026-08-03',
    title: '反馈室 · 视频下载',
    items: [
      '一键下载合成视频：涂鸦标注与视频画面合并导出',
      '横向/上下/重叠对比均可整段导出为新视频',
      '打包版使用 FFmpeg 编码：标准 MP4 格式、高清不压缩、流畅不卡顿'
    ]
  },
  {
    version: '1.2.0',
    date: '2026-08-03',
    title: '全格式视频支持',
    items: [
      '支持几乎所有视频格式导入：MP4/AVI/MKV/WMV/FLV/MOV/TS/M2TS/3GP/RMVB/MPG/ASF/MXF 等',
      '导入时自动用 FFmpeg 转码为通用 MP4，保证打包版也能播放',
      '转码失败自动降级（无音轨视频也能转），并提示具体失败文件'
    ]
  },
  {
    version: '1.1.0',
    date: '2026-08-03',
    title: '反馈室 · 版本对比',
    items: [
      '素材双来源导入：本地文件 / 素材库（按分类筛选），反馈素材独立存储',
      '新旧版本三种对比模式：横向、上下、重叠（重叠支持双视频独立透明度控制）',
      '双视频同步播放/暂停、时间轴同步拖动、循环播放、音量/静音控制',
      '逐帧播放：方向键单击跳帧、按住连续播放、帧号直接跳转、时间轴帧刻度',
      '画笔全套工具：画笔/矩形/圆形/直线/箭头/文字/橡皮，按帧存储+叠影参考',
      '文字可选中拖动、角点缩放；已绘制帧列表一键跳转',
      '素材批量删除、鼠标位置自定义确认弹窗'
    ]
  },
  {
    version: '1.0.0',
    date: '2026-07-31',
    title: '画影客 v1.0 发布',
    items: [
      '素材库：树形分类、视频/图片导入、链接导入、拖拽上传、视频裁剪',
      '创作台：逐帧画笔、形状、文字、橡皮、叠影、3D人偶',
      '数据本地存储 + 导出/导入备份',
      'Electron 便携版打包，Windows 可直接运行'
    ]
  }
]

export default function ModuleHome({ onSelect, user, onLoginClick }) {
  const [showLog, setShowLog] = useState(false)
  // Auto-show changelog when app version is newer than last seen version
  useEffect(() => {
    try {
      const seen = localStorage.getItem('artshadow-seen-version')
      if (seen !== APP_VERSION) {
        setShowLog(true)
      }
    } catch(e) {}
  }, [])
  const closeLog = () => {
    setShowLog(false)
    try { localStorage.setItem('artshadow-seen-version', APP_VERSION) } catch(e) {}
  }
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
      <button className={styles.announceBtn} onClick={()=>setShowLog(!showLog)} title="更新公告">
        📢 <span className={styles.announceBadge}>NEW</span>
      </button>
      <div className={styles.versionTag}>v{APP_VERSION}</div>
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
      {showLog && (
        <div className={styles.logMask} onClick={closeLog}>
          <div className={styles.logPanel} onClick={e=>e.stopPropagation()}>
            <div className={styles.logHeader}>
              <span>📢 更新公告</span>
              <button className={styles.logClose} onClick={closeLog}>×</button>
            </div>
            <div className={styles.logBody}>
              {CHANGELOG.map(log => (
                <div key={log.version} className={styles.logItem}>
                  <div className={styles.logTitle}>
                    <span className={styles.logVersion}>v{log.version}</span>
                    <span className={styles.logDate}>{log.date}</span>
                    <span className={styles.logName}>{log.title}</span>
                  </div>
                  <ul className={styles.logList}>
                    {log.items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
