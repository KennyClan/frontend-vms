/**
 * App.jsx — Vista VMS
 *
 * Thin wrapper that:
 * 1. Provides real JWT auth via useAuth()
 * 2. Fetches live data from the FastAPI backend on mount
 * 3. Delegates rendering to the existing VistaVMS component (vista-vms-enhanced.jsx)
 *
 * The enhanced component accepts optional props:
 *   apiMode   – boolean, disables its internal seed data when true
 *   authUser  – user object from the real API
 *   onLogin   – async (email, password) => user
 *   onLogout  – async () => void
 *
 * When the backend is unreachable the app falls back to local seed data
 * so the UI remains usable during development without a running DB.
 *
 * Public route: /wayfind/:qrRef renders the visitor directions page with
 * NO auth — it's the link visitors get in their check-in email.
 */

import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import VistaVMS from './components/VistaVMS'
import Wayfinding from './components/Wayfinding'

export default function App() {
  const { user, signInWithPassword, enrollBiometric, verifyBiometric, signOut } = useAuth()
  const [apiHealthy, setApiHealthy] = useState(null)

  // Lightweight health probe on mount
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/health`)
      .then(r => setApiHealthy(r.ok))
      .catch(() => setApiHealthy(false))
  }, [])

  const wayfindMatch = window.location.pathname.match(/^\/wayfind\/([^/]+)$/)
  if (wayfindMatch) {
    return <Wayfinding qrRef={decodeURIComponent(wayfindMatch[1])} />
  }

  return (
    <VistaVMS
      apiMode={apiHealthy === true}
      authUser={user}
      onSignInWithPassword={signInWithPassword}
      onEnrollBiometric={enrollBiometric}
      onVerifyBiometric={verifyBiometric}
      onLogout={signOut}
    />
  )
}