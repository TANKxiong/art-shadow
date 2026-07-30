import React, { useState, useRef, useEffect } from 'react'

export default function VideoTrimmer({ file, onTrimChange }) {
  const videoRef = useRef(null)
  const [duration, setDuration] = useState(0)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [videoUrl, setVideoUrl] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [dragging, setDragging] = useState(null) // 'start' | 'end' | 'scrub'
  const [playing, setPlaying] = useState(false)
  const barRef = useRef(null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const onLoaded = () => {
    const v = videoRef.current
    if (!v) return
    setDuration(v.duration)
    setEndTime(v.duration)
    onTrimChange(0, v.duration)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.currentTime = startTime
      v.play(); setPlaying(true)
    } else {
      v.pause(); setPlaying(false)
    }
  }

  const onTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime
    setCurrentTime(t)
    // Auto-loop within trim range
    if (t >= endTime) {
      v.currentTime = startTime
    }
    if (v.paused) setPlaying(false)
  }

  const getPct = (t) => duration > 0 ? (t / duration * 100) : 0

  const handleBarDown = (e) => {
    const rect = barRef.current.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const t = pct * duration
    const dStart = Math.abs(t - startTime)
    const dEnd = Math.abs(t - endTime)

    if (dStart < dEnd && dStart < duration * 0.05) {
      setDragging('start')
    } else if (dEnd < duration * 0.05) {
      setDragging('end')
    } else {
      // Seek
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(startTime, Math.min(endTime, t))
      }
    }
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => {
      const rect = barRef.current.getBoundingClientRect()
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const t = pct * duration
      if (dragging === 'start') {
        const st = Math.max(0, Math.min(endTime - 0.1, t))
        setStartTime(st)
        if (videoRef.current) videoRef.current.currentTime = st
      } else if (dragging === 'end') {
        const et = Math.max(startTime + 0.1, Math.min(duration, t))
        setEndTime(et)
      }
    }
    const onUp = () => {
      setDragging(null)
      onTrimChange(startTime, endTime)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [dragging, startTime, endTime, duration])

  const fmt = (s) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  if (!file || !file.type.startsWith('video/')) return null

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative' }}>
      <video
        ref={videoRef}
        src={videoUrl || undefined}
        style={{ width: '100%', borderRadius: 8, background: '#000' }}
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTimeUpdate}
        muted
        playsInline
      />
      <button
        onClick={togglePlay}
        style={{
          position: 'absolute', bottom: 4, left: 4,
          background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
          borderRadius: '50%', width: 36, height: 36,
          fontSize: 16, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center'
        }}
      >{playing ? '⏸' : '▶'}</button>
      </div>
      {/* Trim bar */}
      <div style={{ position: 'relative', height: 24, padding: '0 4px' }}>
        <div
          ref={barRef}
          onMouseDown={handleBarDown}
          style={{
            position: 'relative', width: '100%', height: 8, borderRadius: 4,
            background: '#334155', cursor: 'pointer', marginTop: 8
          }}
        >
          {/* Selected range */}
          <div style={{
            position: 'absolute', top: 0, height: '100%',
            left: getPct(startTime) + '%', width: getPct(endTime - startTime) + '%',
            background: 'var(--primary)', borderRadius: 4
          }} />
          {/* Start handle */}
          <div style={{
            position: 'absolute', top: -6, left: getPct(startTime) + '%',
            width: 14, height: 20, borderRadius: 4,
            background: '#fff', border: '2px solid var(--primary)',
            cursor: 'ew-resize', transform: 'translateX(-50%)', zIndex: 2
          }} />
          {/* End handle */}
          <div style={{
            position: 'absolute', top: -6, left: getPct(endTime) + '%',
            width: 14, height: 20, borderRadius: 4,
            background: '#fff', border: '2px solid var(--primary)',
            cursor: 'ew-resize', transform: 'translateX(-50%)', zIndex: 2
          }} />
          {/* Current time indicator */}
          <div style={{
            position: 'absolute', top: -4, left: getPct(currentTime) + '%',
            width: 2, height: 16, background: '#ff4444',
            transform: 'translateX(-50%)', zIndex: 1, pointerEvents: 'none'
          }} />
        </div>
      </div>
      {/* Time display */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
        <span>{fmt(startTime)}</span>
        <span>选取时长: {fmt(endTime - startTime)}</span>
        <span>{fmt(endTime)}</span>
      </div>
    </div>
  )
}
