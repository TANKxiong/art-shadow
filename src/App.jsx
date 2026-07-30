import React, { useState, useEffect } from 'react'
import { StoreProvider, useStore } from './store/StoreContext'
import SplashScreen from './components/SplashScreen'
import ModuleHome from './components/ModuleHome'
import LoginModal from './components/LoginModal'
import CreateStudio from './components/CreateStudio'
import FeedbackRoom from './components/FeedbackRoom'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MaterialGrid from './components/MaterialGrid'
import PreviewModal from './components/PreviewModal'
import styles from './styles/App.module.css'

export default function App() {
  return (
    <StoreProvider>
      <AppLayout />
    </StoreProvider>
  )
}

function AppLayout() {
  const [module, setModule] = useState(null)
  const [showSplash, setShowSplash] = useState(true)
  const [user, setUser] = useState(null)
  const [showLogin, setShowLogin] = useState(false)

  const handleLogin = (name) => {
    setUser({ name, loggedAt: new Date() })
  }

  if (!module) {
    return (
      <>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
        {!showSplash && (
        <>
        <ModuleHome onSelect={setModule} user={user} onLoginClick={() => setShowLogin(true)} />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
        </>
        )}
      </>
    )
  }

  if (module === 'create') {
    return <CreateStudio onBack={() => setModule(null)} />
  }

  if (module === 'feedback') {
    return <FeedbackRoom onBack={() => setModule(null)} />
  }

  return (
    <MaterialModule onBack={() => setModule(null)} />
  )
}

function MaterialModule({ onBack }) {
  const { state, dispatch } = useStore()
  const ctxMenu = state.ctxMenu

  useEffect(() => {
    if (!ctxMenu) return
    const t = setTimeout(() => {
      const handler = (e) => {
        const el = document.querySelector('[data-ctxmenu]')
        if (el && !el.contains(e.target)) dispatch({ type: 'SET_CTX_MENU', payload: null })
      }
      document.addEventListener('mousedown', handler)
      return () => document.removeEventListener('mousedown', handler)
    }, 100)
    return () => clearTimeout(t)
  }, [ctxMenu])

  return (
    <>
      <Sidebar />
      <main className={styles.main}>
        <TopBar onHome={onBack} />
        <MaterialGrid />
      </main>
      <PreviewModal />
      {ctxMenu && (
        <div data-ctxmenu style={{
          position:'fixed', left:ctxMenu.x, top:ctxMenu.y, zIndex:9999,
          background:'var(--surface)', borderRadius:8, boxShadow:'0 8px 32px rgba(0,0,0,0.2)',
          padding:4, minWidth:140, border:'1px solid var(--border)'
        }} onClick={e => e.stopPropagation()}>
          <div style={{padding:'8px 12px',cursor:'pointer',borderRadius:6,fontSize:13,color:'var(--danger)',display:'flex',alignItems:'center',gap:8}}
            onClick={() => { if(confirm('确定要删除「'+(ctxMenu.name||'')+'」吗？')) dispatch({type:'DELETE_MATERIAL',payload:ctxMenu.id}); dispatch({type:'SET_CTX_MENU',payload:null}) }}>
            🗑 删除素材
          </div>
        </div>
      )}
    </>
  )
}
