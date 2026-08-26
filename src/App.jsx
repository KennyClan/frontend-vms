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
 */

import { useEffect, useState } from 'react'
import { useAuth } from './hooks/useAuth'
import VistaVMS from './components/VistaVMS'

export default function App() {
  const { user, signInWithPassword, enrollBiometric, verifyBiometric, signOut } = useAuth()
  const [apiHealthy, setApiHealthy] = useState(null)

  // Lightweight health probe on mount
  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/health`)
      .then(r => setApiHealthy(r.ok))
      .catch(() => setApiHealthy(false))
  }, [])

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
