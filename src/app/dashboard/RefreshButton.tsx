'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PINK = '#ff69b4'

export default function RefreshButton() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState('')
  const router                = useRouter()

  async function handleRefresh() {
    setLoading(true)
    setMsg('')
    try {
      const res = await fetch('/api/streams/refresh', { method: 'POST' })
      if (res.ok) {
        setMsg('Streams updated!')
        router.refresh()
      } else {
        setMsg('Failed to refresh. Try again.')
      }
    } catch {
      setMsg('Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={handleRefresh}
        disabled={loading}
        style={{
          background: loading ? '#333' : PINK,
          border: 'none',
          color: '#fff',
          padding: '8px 18px',
          borderRadius: 7,
          fontWeight: 600,
          fontSize: 13,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Refreshing…' : '↻ Refresh Streams'}
      </button>
      {msg && <span style={{ fontSize: 13, color: msg.includes('!') ? '#4caf50' : '#f44' }}>{msg}</span>}
    </div>
  )
}
