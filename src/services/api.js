import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('vms_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('vms_token')
      localStorage.removeItem('vms_user')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────────────────────
// Step 1: password check. Returns { pre_auth_token, registration_required }
// — NOT a session token. A real session only exists after step 2 below.
export const login = (email, password) => {
  const form = new URLSearchParams()
  form.append('username', email)
  form.append('password', password)
  return api.post('/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
}
export const logout = () => api.post('/auth/logout')

// ── WebAuthn (Face ID / fingerprint) ─────────────────────────────
// Step 2a: first-time device enrollment (uses the same pre_auth_token).
export const webauthnRegisterOptions = (preAuthToken) =>
  api.post('/auth/webauthn/register/options', { pre_auth_token: preAuthToken })
export const webauthnRegisterVerify = (preAuthToken, credential, nickname) =>
  api.post('/auth/webauthn/register/verify', { pre_auth_token: preAuthToken, credential, nickname })

// Step 2b: biometric confirmation on an already-enrolled device. Verify
// returns the same { access_token, user } shape the old /auth/login used to.
export const webauthnLoginOptions = (preAuthToken) =>
  api.post('/auth/webauthn/login/options', { pre_auth_token: preAuthToken })
export const webauthnLoginVerify = (preAuthToken, credential) =>
  api.post('/auth/webauthn/login/verify', { pre_auth_token: preAuthToken, credential })


// ── Visitors ──────────────────────────────────────────────────────
export const getVisitors     = (params) => api.get('/visitors', { params })
export const createVisitor   = (data)   => api.post('/visitors', data)
export const toggleBlockVisitor = (id)  => api.patch(`/visitors/${id}/block`)

// ── Visit Requests ────────────────────────────────────────────────
export const getVisitRequests  = (params)       => api.get('/visit-requests', { params })
export const createVisitRequest = (data)        => api.post('/visit-requests', data)
export const approveRequest    = (id, data)     => api.patch(`/visit-requests/${id}/approve`, data)
export const checkInVisitor    = (id, data)     => api.patch(`/visit-requests/${id}/check-in`, data)
export const checkOutVisitor   = (id)           => api.patch(`/visit-requests/${id}/check-out`)
export const lookupByQR        = (qrRef)        => api.get(`/visit-requests/by-qr/${qrRef}`)

// ── Audit & Analytics ─────────────────────────────────────────────
export const getAuditLog        = (params) => api.get('/audit-log', { params })
export const getAnalyticsSummary = ()      => api.get('/analytics/summary')

// ── Visit Request restricted access check ─────────────────────────
export const getRequestRestrictedAccess = (requestId) => api.get(`/visit-requests/${requestId}/restricted-access`)

// ── Restricted Areas ──────────────────────────────────────────────
export const getRestrictedAreas    = ()              => api.get('/restricted-areas')
export const createRestrictedArea  = (data)          => api.post('/restricted-areas', data)
export const deleteRestrictedArea  = (id)            => api.delete(`/restricted-areas/${id}`)
export const grantRestrictedAccess = (areaId, data)  => api.post(`/restricted-areas/${areaId}/grant`, data)
export const issueRestrictedBadge  = (data)          => api.post('/restricted-areas/badge/issue', data)
export const confirmRestrictedEntry= (data)          => api.post('/restricted-areas/badge/confirm-entry', data)
export const confirmRestrictedExit = (data)          => api.post('/restricted-areas/badge/confirm-exit', data)
export const getAreaOccupants      = (areaId)        => api.get(`/restricted-areas/${areaId}/occupants`)

// ── Staff Management (Admin only) ────────────────────────────────
export const getStaff    = ()       => api.get('/staff')
export const createStaff = (data)   => api.post('/staff', data)
export const updateStaff = (id, data) => api.patch(`/staff/${id}`, data)

// ── Posts / Floor Plan (legacy) ─────────────────────────────────
export const getPosts       = ()        => api.get('/posts')
export const createPost     = (data)    => api.post('/posts', data)
export const getPostDetail  = (postId)  => api.get(`/posts/${postId}/detail`)
export const updatePost     = (id, data) => api.patch(`/posts/${id}`, data)
export const scanArrival    = (postId, data) => api.post(`/posts/${postId}/arrivals`, data)
export const lookupBadge    = (postId, data) => api.post(`/posts/${postId}/lookup-badge`, data)
export const getRecentArrivals = (postId) => api.get(`/posts/${postId}/recent-arrivals`)

// ── Floor Plan Editor ───────────────────────────────────────────
export const getFloors             = ()        => api.get('/floor-plan')
export const createFloor           = (data)    => api.post('/floor-plan', data)
export const updateFloor           = (id,data) => api.patch(`/floor-plan/${id}`, data)
export const deleteFloor           = (id)      => api.delete(`/floor-plan/${id}`)
export const getFloorObjects       = (floorId) => api.get(`/floor-plan/${floorId}/objects`)
export const createFloorObject     = (floorId,data) => api.post(`/floor-plan/${floorId}/objects`, data)
export const updateFloorObject     = (id,data) => api.patch(`/floor-plan/objects/${id}`, data)
export const deleteFloorObject     = (id)      => api.delete(`/floor-plan/objects/${id}`)
export const duplicateFloorObject  = (id)      => api.post(`/floor-plan/objects/${id}/duplicate`)
export const bulkSaveFloorObjects  = (floorId,data) => api.post(`/floor-plan/${floorId}/objects/bulk`, data)

export default api
