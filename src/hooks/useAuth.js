import { useState, useCallback, useEffect } from 'react'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import {
  login as apiLogin,
  logout as apiLogout,
  webauthnLoginOptions,
  webauthnLoginVerify,
  webauthnRegisterOptions,
  webauthnRegisterVerify,
} from '../services/api'
import api from '../services/api'

export function useAuth() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vms_user')) } catch { return null }
  })

  // URL BYPASS FIX: Verify the stored token is still valid with the backend
  // on every page load. Without this, anyone can open DevTools, paste a user
  // object into localStorage, and land directly on the dashboard — the app
  // never checked if a real session token existed or was still valid.
  useEffect(() => {
    const token = localStorage.getItem('vms_token')
    if (!token) {
      // No token at all — clear any stale user object and stay logged out
      localStorage.removeItem('vms_user')
      setUser(null)
      return
    }
    // Probe a protected endpoint. If the token is expired, tampered, or
    // the account was disabled, the backend returns 401 and our axios
    // interceptor in api.js clears localStorage and reloads — so the user
    // lands back on the login screen automatically. On success the returned
    // profile (which now includes effective module permissions) is stored so
    // nav/module access reflects the latest configuration.
    api.get('/auth/me')
      .then((res) => {
        if (res.data && res.data.id) {
          localStorage.setItem('vms_user', JSON.stringify(res.data))
          setUser(res.data)
        }
      })
      .catch(() => {
        localStorage.removeItem('vms_token')
        localStorage.removeItem('vms_user')
        setUser(null)
      })
  }, [])

  // Step 1: email + password. Returns a status object the UI branches on —
  // it does NOT log the user in by itself.
  //   { status: 'registration_required', preAuthToken }
  //     -> account has no enrolled device yet; show the "enable biometrics" screen
  //   { status: 'biometric_required', preAuthToken }
  //     -> device already enrolled; caller should immediately call
  //        verifyBiometric() to trigger the Face ID/fingerprint prompt
  const signInWithPassword = useCallback(async (email, password) => {
    const res = await apiLogin(email, password)
    const { pre_auth_token, registration_required } = res.data
    return {
      status: registration_required ? 'registration_required' : 'biometric_required',
      preAuthToken: pre_auth_token,
    }
  }, [])

  // @simplewebauthn/browser changed its call signature:
  //   v7 and below: startRegistration(optionsJSON) — plain parameter
  //   v8 and above: startRegistration({ optionsJSON }) — destructured parameter
  // This helper detects the installed version at runtime and calls the right
  // form, so the code keeps working if the package is upgraded.
  function callSimpleWebAuthn(fn, options) {
    const needsWrapper = /^\s*async function \w+\s*\(\s*\{/.test(fn.toString())
    return needsWrapper ? fn({ optionsJSON: options }) : fn(options)
  }

  // Step 2a: first-time enrollment, or re-registration when the old
  // credential went stale ("Invalid credential"/"Unrecognized device").
  // replace=true tells the backend to skip the authenticator exclusion list
  // and wipe the user's old credential rows once the new one is created.
  const enrollBiometric = useCallback(async (preAuthToken, nickname, replace = false) => {
    const { data } = await webauthnRegisterOptions(preAuthToken, replace)
    const parsedOptions = JSON.parse(data.options)
    const attResp = await callSimpleWebAuthn(startRegistration, parsedOptions)
    await webauthnRegisterVerify(preAuthToken, attResp, nickname, replace)
  }, [])

  // Step 2b: biometric confirmation on an already-enrolled device. This is
  // what finally issues a real session token. When the backend can't match
  // the device (stale/orphaned credential), we tag the error with
  // reEnrollable so the login UI can offer a "re-register" prompt instead of
  // a dead end.
  const verifyBiometric = useCallback(async (preAuthToken) => {
    try {
      const { data: optionsRes } = await webauthnLoginOptions(preAuthToken)
      const parsedOptions = JSON.parse(optionsRes.options)
      const authResp = await callSimpleWebAuthn(startAuthentication, parsedOptions)
      const { data } = await webauthnLoginVerify(preAuthToken, authResp)
      localStorage.setItem('vms_token', data.access_token)
      localStorage.setItem('vms_user', JSON.stringify(data.user))
      setUser(data.user)
      return data.user
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 428) {
        err.reEnrollable = true
      }
      throw err
    }
  }, [])

  const signOut = useCallback(async () => {
    try { await apiLogout() } catch {}
    localStorage.removeItem('vms_token')
    localStorage.removeItem('vms_user')
    setUser(null)
  }, [])

  return { user, signInWithPassword, enrollBiometric, verifyBiometric, signOut }
}
