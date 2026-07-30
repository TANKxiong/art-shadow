import React, { useState, useEffect, useRef } from 'react'
import styles from '../styles/SplashScreen.module.css'

export default function SplashScreen({ onDone }) {
  const [videoError, setVideoError] = useState(false)
  const [videoEnded, setVideoEnded] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (videoEnded || videoError) {
      setFadeOut(true)
      const t = setTimeout(() => doneRef.current(), 600)
      return () => clearTimeout(t)
    }
    // Fallback: max 12s
    const t = setTimeout(() => { setFadeOut(true); setTimeout(() => doneRef.current(), 600) }, 12000)
    return () => clearTimeout(t)
  }, [videoEnded, videoError])

  return (
    <div className={`${styles.splash} ${fadeOut ? styles.splashFade : ''}`}>
      {!videoError ? (
        <video className={styles.splashVideo} src="/logo-animation.mp4"
          autoPlay muted playsInline
          onError={() => setVideoError(true)}
          onEnded={() => setVideoEnded(true)} />
      ) : (
        <div className={styles.splashLogo}>
          <svg width="120" height="120" viewBox="0 0 512 512">
            <defs>
              <linearGradient id="sbg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#3d7abf"/><stop offset="100%" stopColor="#2563eb"/>
              </linearGradient>
            </defs>
            <circle cx="256" cy="256" r="248" fill="url(#sbg)"/>
            <rect x="120" y="280" width="272" height="100" rx="8" fill="rgba(0,0,0,0.3)"/>
            <polygon points="225,300 225,360 270,330" fill="rgba(255,255,255,0.9)"/>
            <path d="M 180 260 Q 200 180 280 150 Q 340 130 360 100 Q 370 85 365 75 Q 360 68 350 72 Q 320 85 300 110 Q 280 140 240 160 Q 190 190 150 240 Q 140 260 160 260 Q 170 260 180 260 Z" fill="#93c5fd" opacity="0.9"/>
          </svg>
        </div>
      )}
    </div>
  )
}
