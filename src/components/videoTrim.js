// Trims a video file client-side using Canvas + MediaRecorder
export async function trimVideo(file, startTime, endTime) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = URL.createObjectURL(file)
    video.muted = true
    video.currentTime = startTime

    video.onloadedmetadata = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 360
      const ctx = canvas.getContext('2d')

      const stream = canvas.captureStream(30)
      const chunks = []
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 5000000 })

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' })
        resolve(blob)
        URL.revokeObjectURL(video.src)
      }
      recorder.onerror = () => {
        URL.revokeObjectURL(video.src)
        reject(new Error('录制失败'))
      }

      video.oncanplay = () => {
        video.play()
        recorder.start()
        drawFrame() // Start canvas rendering loop
      }

      function drawFrame() {
        if (video.currentTime >= endTime || video.ended) {
          video.pause()
          recorder.stop()
          return
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        requestAnimationFrame(drawFrame)
      }
    }
  })
}
