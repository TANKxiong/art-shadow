import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react'

const StoreContext = createContext()

const initialState = {
  materials: [],
  categories: [],
  tags: [],
  selectedCategory: null,
  selectedTags: [],
  searchQuery: '',
  viewMode: 'grid',
  previewMaterial: null,
  ctxMenu: null,
  loading: true
}

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_DATA':
      return {
        ...state,
        materials: action.payload.materials || [],
        categories: action.payload.categories || [],
        tags: action.payload.tags || [],
        loading: false
      }
    case 'ADD_MATERIALS':
      return { ...state, materials: [...state.materials, ...action.payload] }
    case 'UPDATE_MATERIAL':
      return {
        ...state,
        materials: state.materials.map(m =>
          m.id === action.payload.id ? { ...m, ...action.payload } : m
        )
      }
    case 'DELETE_MATERIAL':
      return {
        ...state,
        materials: state.materials.filter(m => m.id !== action.payload)
      }
    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] }
    case 'DELETE_CATEGORY':
      return {
        ...state,
        categories: state.categories.filter(c => c.id !== action.payload),
        materials: state.materials.map(m =>
          m.categoryId === action.payload ? { ...m, categoryId: null } : m
        )
      }
    case 'ADD_TAG':
      return { ...state, tags: [...state.tags, action.payload] }
    case 'SELECT_CATEGORY':
      return { ...state, selectedCategory: action.payload, selectedTags: [] }
    case 'SELECT_TAGS':
      return { ...state, selectedTags: action.payload, selectedCategory: null }
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload }
    case 'SET_CTX_MENU':
      return { ...state, ctxMenu: action.payload }
    case 'SET_PREVIEW':
      return { ...state, previewMaterial: action.payload }
    default:
      return state
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Load data from Electron main process
  useEffect(() => {
    async function load() {
      try {
        if (window.electronAPI) {
          const data = await window.electronAPI.getAllData()
          dispatch({ type: 'LOAD_DATA', payload: data })
        } else {
          // Fallback: load from localStorage for browser dev
          const raw = localStorage.getItem('refvault-data')
          if (raw) {
            const parsed = JSON.parse(raw)
            // Auto-upgrade: old flat categories or old prefixes
            const needsUpgrade = parsed.categories && parsed.categories.length > 0 && (
              parsed.categories[0].parentId === undefined ||
              /^\d{2}_/.test(parsed.categories[0]?.name || '')
            )
            if (needsUpgrade) {
              const demoData = getDemoData()
              localStorage.setItem('refvault-data', JSON.stringify(demoData))
              dispatch({ type: 'LOAD_DATA', payload: demoData })
            } else {
              dispatch({ type: 'LOAD_DATA', payload: parsed })
            }
          } else {
            // First run - load demo data
            const demoData = getDemoData()
            localStorage.setItem('refvault-data', JSON.stringify(demoData))
            dispatch({ type: 'LOAD_DATA', payload: demoData })
          }
        }
      } catch (e) {
        console.error('Failed to load data:', e)
        dispatch({ type: 'LOAD_DATA', payload: initialState })
      }
    }
    load()
  }, [])

  // Save data whenever it changes
  useEffect(() => {
    if (state.loading) return
    // Strip non-serializable _file references before saving
    const dataToSave = {
      materials: state.materials.map(({ _file, ...rest }) => rest),
      categories: state.categories,
      tags: state.tags
    }
    if (window.electronAPI) {
      window.electronAPI.saveData(dataToSave)
    } else {
      localStorage.setItem('refvault-data', JSON.stringify(dataToSave))
    }
  }, [state.materials, state.categories, state.tags, state.loading])

  const addCategory = useCallback((category) => {
    const cat = { id: Date.now().toString(36), name: category, createdAt: new Date().toISOString() }
    dispatch({ type: 'ADD_CATEGORY', payload: cat })
    return cat
  }, [])

  const addTag = useCallback((tagName) => {
    const existing = state.tags.find(t => t.name === tagName)
    if (existing) return existing
    const tag = { id: Date.now().toString(36), name: tagName }
    dispatch({ type: 'ADD_TAG', payload: tag })
    return tag
  }, [state.tags])

  return (
    <StoreContext.Provider value={{ state, dispatch, addCategory, addTag }}>
      {children}
    </StoreContext.Provider>
  )
}

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error('useStore must be used within StoreProvider')
  return context
}

function getDemoData() {
  const now = new Date().toISOString()
  // Tree-structured categories with parentId
  const categories = [
    { id:'cat1', name:'武侠/国风仙侠动作', parentId:null, createdAt:now },
    { id:'cat1a', name:'基础移动动作', parentId:'cat1', createdAt:now },
    { id:'cat1a1', name:'行走', parentId:'cat1a', createdAt:now },
    { id:'cat1a2', name:'奔跑', parentId:'cat1a', createdAt:now },
    { id:'cat1a3', name:'跳跃', parentId:'cat1a', createdAt:now },
    { id:'cat1a4', name:'闪避', parentId:'cat1a', createdAt:now },
    { id:'cat1b', name:'冷兵器动作', parentId:'cat1', createdAt:now },
    { id:'cat1b1', name:'刀剑', parentId:'cat1b', createdAt:now },
    { id:'cat1b2', name:'长柄武器', parentId:'cat1b', createdAt:now },
    { id:'cat1b3', name:'短兵器', parentId:'cat1b', createdAt:now },
    { id:'cat1b4', name:'软兵器', parentId:'cat1b', createdAt:now },
    { id:'cat1c', name:'徒手武术动作', parentId:'cat1', createdAt:now },
    { id:'cat1d', name:'武侠特色特技动作', parentId:'cat1', createdAt:now },
    { id:'cat2', name:'写实人类动作', parentId:null, createdAt:now },
    { id:'cat2a', name:'基础移动', parentId:'cat2', createdAt:now },
    { id:'cat2b', name:'肢体交互', parentId:'cat2', createdAt:now },
    { id:'cat2c', name:'现代格斗', parentId:'cat2', createdAt:now },
    { id:'cat3', name:'卡通风格动作', parentId:null, createdAt:now },
    { id:'cat3a', name:'基础移动', parentId:'cat3', createdAt:now },
    { id:'cat3b', name:'卡通战斗动作', parentId:'cat3', createdAt:now },
    { id:'cat3c', name:'卡通表演动作', parentId:'cat3', createdAt:now },
    { id:'cat4', name:'奇幻魔幻动作', parentId:null, createdAt:now },
    { id:'cat5', name:'竞技战斗动作', parentId:null, createdAt:now },
    { id:'cat6', name:'日常表演&情绪肢体', parentId:null, createdAt:now },
    { id:'cat7', name:'非人&生物动作', parentId:null, createdAt:now },
    { id:'cat8', name:'载具与联动动作', parentId:null, createdAt:now },
  ]
    return { categories, tags: [], materials: [] };

}