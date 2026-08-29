import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f1f5f9',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#0f172a',
  },
  header: {
    background: '#0F172A',
    padding: '18px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '28px 32px',
    marginBottom: 20,
  },
  chip: {
    background: '#2563eb',
    color: '#fff',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 14px',
  },
  btnPrimary: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    padding: '14px 28px',
    cursor: 'pointer',
    width: '100%',
  },
  btnGhost: {
    background: '#fff',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
    borderRadius: 12,
    fontSize: 15,
    fontWeight: 700,
    padding: '14px 28px',
    cursor: 'pointer',
    width: '100%',
  },
}

function ExpiredScreen({ reason }) {
  return (
    <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 480, width: '100%' }}>
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Directions expired</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
            {reason || 'This directions link is no longer valid.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function MapView({ objects, highlightId }) {
  const { minX, minY, maxX, maxY } = useMemo(() => {
    if (!objects.length) return { minX: 0, minY: 0, maxX: 800, maxY: 600 }
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
    for (const o of objects) {
      a = Math.min(a, o.x); b = Math.min(b, o.y)
      c = Math.max(c, o.x + o.width); d = Math.max(d, o.y + o.height)
    }
    return { minX: a, minY: b, maxX: c, maxY: d }
  }, [objects])

  const pad = 40
  const w = maxX - minX + pad * 2
  const h = maxY - minY + pad * 2
  const viewBox = `${minX - pad} ${minY - pad} ${w} ${h}`

  return (
    <svg
      viewBox={viewBox}
      style={{ width: '100%', height: 'auto', display: 'block', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}
    >
      <style>{`.wf-target{animation:wfPulse 1.6s ease-in-out infinite;}@keyframes wfPulse{0%,100%{stroke-width:4}50%{stroke-width:9;stroke:#1d4ed8}}`}</style>
      {objects.map((o) => {
        const isTarget = o.id === highlightId
        const cx = o.x + o.width / 2
        const cy = o.y + o.height / 2
        return (
          <g key={o.id} transform={`rotate(${o.rotation || 0} ${cx} ${cy})`}>
            <rect
              x={o.x} y={o.y} width={o.width} height={o.height} rx={8}
              fill={isTarget ? '#dbeafe' : '#e2e8f0'}
              stroke={isTarget ? '#2563eb' : '#cbd5e1'}
              strokeWidth={isTarget ? 4 : 1.5}
              className={isTarget ? 'wf-target' : undefined}
            />
            {isTarget && (
              <text
                x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                fill="#1d4ed8" fontSize={Math.max(14, Math.min(22, o.width / 10))} fontWeight={700}
              >
                {o.name}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export default function Wayfinding({ qrRef }) {
  const [state, setState] = useState('loading') // loading | ready | expired | missing | error
  const [data, setData] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [repeatCount, setRepeatCount] = useState(0)
  const speechRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/wayfinding/${encodeURIComponent(qrRef)}`)
      .then((r) => {
        if (r.status === 404) { if (!cancelled) setState('missing'); return null }
        if (!r.ok) throw new Error('bad response')
        return r.json()
      })
      .then((d) => {
        if (cancelled || !d) return
        setData(d)
        setState(d.expired ? 'expired' : 'ready')
      })
      .catch(() => { if (!cancelled) setState('error') })
    return () => { cancelled = true; window.speechSynthesis?.cancel(); clearTimeout(speechRef.current) }
  }, [qrRef])

  const sayDirections = useCallback(() => {
    if (!data || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const text = [`You are checked in. Your destination is ${data.destination_name || 'your visit location'}.`]
      .concat(data.directions || [])
      .join(' ')
    const u = new SpeechSynthesisUtterance(text)
    setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(u)
  }, [data])

  const repeat = () => { setRepeatCount((n) => n + 1); sayDirections() }

  if (state === 'loading') {
    return <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>Loading directions…</div>
  }
  if (state === 'expired') return <ExpiredScreen reason={data?.expired_reason} />
  if (state === 'missing') return <ExpiredScreen reason="This directions link doesn't exist — check you opened the link from your email." />
  if (state === 'error') return <ExpiredScreen reason="Couldn't reach the server. Check your connection and try again." />
  if (!data) return null

  if (dismissed) {
    return (
      <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ maxWidth: 480, width: '100%' }}>
          <div style={{ ...styles.card, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🧭</div>
            <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>You're on your way, {data.visitor_name}.</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
              Head to <strong>{data.destination_name || 'your destination'}</strong>
              {data.destination_floor ? ` on Floor ${data.destination_floor}` : ''}. A guard will confirm your arrival.
              You can close this page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <span style={{ color: '#fff', fontSize: 16, fontWeight: 700, marginLeft: 8 }}>Vista VMS</span>
          <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 8 }}>Wayfinding</span>
        </div>
        <span style={styles.chip}>✓ Checked in</span>
      </div>

      <div style={{ maxWidth: 720, margin: '24px auto', padding: '0 16px' }}>
        <div style={styles.card}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>You're headed to</p>
          <h1 style={{ margin: '0 0 4px', fontSize: 28, color: '#0f172a' }}>
            {data.destination_name || 'Your destination'}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
            {data.destination_floor ? `Floor ${data.destination_floor} · ` : ''}Host: {data.host_name || '—'}
          </p>
        </div>

        {data.objects.length > 0 ? (
          <div style={styles.card}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#64748b' }}>
              {data.floor?.name || `Floor ${data.destination_floor}`} — your room is highlighted
            </p>
            <MapView objects={data.objects} highlightId={data.highlight_object_id} key={repeatCount} />
          </div>
        ) : (
          <div style={styles.card}>
<p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.7 }}>
              {data.directions.map((d, i) => (
                <Fragment key={i}>{i + 1}. {d}<br /></Fragment>
              ))}
              {!data.directions.length && 'Follow the entrance signage — your destination is served by the building reception.'}
            </p>
          </div>
        )}

        {data.directions.length > 0 && (
          <div style={styles.card}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#64748b' }}>Directions</p>
            <ol style={{ margin: 0, paddingLeft: 20, color: '#475569', fontSize: 14, lineHeight: 1.8 }}>
              {data.directions.map((d, i) => <li key={i}>{d}</li>)}
            </ol>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12, paddingBottom: 24 }}>
          <button onClick={repeat} style={{ ...styles.btnPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {speaking ? '🔊 Playing…' : '🔁 Repeat directions'}
          </button>
          <button onClick={() => setDismissed(true)} style={styles.btnGhost}>OK, I'm heading there</button>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingBottom: 24 }}>
          Directions lock automatically once a guard confirms your arrival.
        </p>
      </div>
    </div>
  )
}