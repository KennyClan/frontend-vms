import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { getVisitRequests, createVisitRequest, approveRequest, assignRequest, checkInVisitor, checkOutVisitor, getVisitors, createVisitor, toggleBlockVisitor, getAuditLog, getAnalyticsSummary, getRestrictedAreas, createRestrictedArea, deleteRestrictedArea, grantRestrictedAccess, issueRestrictedBadge, confirmRestrictedEntry, confirmRestrictedExit, getAreaOccupants, getRequestRestrictedAccess, getStaff, getMyStaff, createStaff, updateStaff, getPosts, createPost, getPostDetail, updatePost, getFloors, createFloor, updateFloor, deleteFloor, getFloorObjects, createFloorObject, updateFloorObject, deleteFloorObject, duplicateFloorObject, bulkSaveFloorObjects, scanArrival, lookupBadge, getRecentArrivals, scanDeparture, getDepartments, createDepartment, updateDepartment, deleteDepartment, createSelfVisit, confirmDestinationArrival, notifyHost, getRoomCapacity, getEmployees, getBadges } from "../services/api";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ─── DESIGN TOKENS ────────────────────────────────────────────────
const C = { primary: "#2563EB", slate900: "#0F172A", slate800: "#1E293B" };

// ─── DEMO ACCOUNT HINTS (email only — no passwords in client code) ─
// These just pre-fill the email field on the login form as a convenience
// for panelists during the thesis defense. The password is never stored
// here; it's only checked by the real backend against a bcrypt hash.
const DEMO_ACCOUNTS = [
  { role: "Administrator", name: "Administrator", initials: "ADM", email: "admin@vistahq.com" },
  { role: "Security Guard", name: "Staff", initials: "STF", email: "security@vistahq.com" },
  { role: "Receptionist", name: "Receptionist", initials: "RCPT", email: "reception@vistahq.com" },
];

const SEED_VISITORS = [];

const SEED_REQUESTS = [];


// ─── UTILS ────────────────────────────────────────────────────────
function genId(p) { return `${p}${Date.now().toString(36).toUpperCase()}`; }
function cls(...a) { return a.filter(Boolean).join(" "); }
function statusColor(s) {
  const m = {
    Active: "bg-green-100 text-green-700", Blocked: "bg-red-100 text-red-700",
    Approved: "bg-blue-100 text-blue-700", Pending: "bg-yellow-100 text-yellow-700",
    Rejected: "bg-red-100 text-red-700", "Checked In": "bg-emerald-100 text-emerald-700",
    "Checked Out": "bg-gray-100 text-gray-600", "Pending Arrival": "bg-violet-100 text-violet-700",
  };
  return m[s] || "bg-gray-100 text-gray-500";
}

import QRCode from "qrcode";

import { ROLE_MODULE_GUARD, roleNav, hasModule, MODULES, DEFAULT_MODULES_BY_ROLE, effectivePermissions } from "../config/modules";

// ─── QR CODE GENERATOR (real, scannable) ──────────────────────────
function QRCanvas({ data, size = 160 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data) return;
    QRCode.toCanvas(canvas, data, {
      width: size,
      margin: 1,
      color: { dark: "#0F172A", light: "#FFFFFF" },
    }).catch(console.error);
  }, [data, size]);
  return <canvas ref={ref} style={{ display: "block" }} />;
}
// ─── QR VISITOR CARD ──────────────────────────────────────────────
function VisitorQRCard({ info, onClose }) {
  const qrData = `${info.ref}|${info.name}|${info.date}|${info.host}`;
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#0F172A] p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm">🪪</div>
          <div>
            <p className="text-white text-sm font-semibold">Vista VMS — Visitor Pass</p>
            <p className="text-slate-400 text-xs">Scan at the security desk to check in</p>
          </div>
        </div>

        {/* Status banner */}
        <div className="bg-green-50 border-b border-green-100 px-4 py-2 flex items-center gap-2">
          <span className="text-green-600 text-lg">✅</span>
          <span className="text-green-700 text-xs font-medium">Request submitted — awaiting host approval</span>
        </div>

        {/* Info rows */}
        <div className="px-4 py-3 flex flex-col gap-2">
          {[
            ["Full name", info.name],
            ["Company", info.company || "—"],
            ["Visiting", info.host],
            ["Date & time", `${info.date}${info.time ? " · " + info.time : ""}`],
            ["Purpose", info.purpose],
          ].map(([l, v]) => (
            <div key={l} className="flex items-start justify-between gap-3">
              <span className="text-xs text-gray-400 whitespace-nowrap">{l}</span>
              <span className="text-xs font-medium text-gray-900 text-right max-w-[200px]">{v}</span>
            </div>
          ))}
          <div className="h-px bg-gray-100 my-1" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Reference no.</span>
            <span className="font-mono text-xs font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg">{info.ref}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Approval status</span>
            <span className="text-xs font-semibold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pending</span>
          </div>
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center py-3 bg-gray-50 border-t border-b border-gray-100">
          <QRCanvas data={qrData} size={160} />
          <p className="text-xs text-gray-400 mt-2">Scan this QR code at the security desk</p>
        </div>

        {/* Time in / out */}
        <div className="grid grid-cols-2 gap-3 p-4 pb-2">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium">⬆ Time in</p>
            <p className="text-xs font-semibold text-gray-700 mt-1">Pending check-in</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 font-medium">⬇ Time out</p>
            <p className="text-xs font-semibold text-gray-700 mt-1">Pending check-out</p>
          </div>
        </div>

        <div className="px-4 pb-4 pt-2 flex gap-2">
          <button onClick={onClose} className="flex-1 h-10 bg-[#0F172A] text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────
function LandingPage({ onVisitor, onStaff, onRetrieve }) {
  return (
    <div className="min-h-screen bg-[#0A0F1C] flex flex-col" style={{fontFamily:"system-ui,sans-serif"}}>
      {/* Ambient glow blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div style={{position:"absolute",top:"-10%",left:"-5%",width:"420px",height:"420px",borderRadius:"50%",background:"radial-gradient(circle,rgba(37,99,235,0.18) 0%,transparent 70%)"}}/>
        <div style={{position:"absolute",bottom:"-8%",right:"-8%",width:"380px",height:"380px",borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,0.14) 0%,transparent 70%)"}}/>
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/[.05]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm shadow-lg shadow-blue-600/40">🪪</div>
          <span className="text-white font-bold text-sm tracking-tight">Vista VMS</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
          <span className="text-slate-500 text-xs">System online</span>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-12">
        {/* Hero label */}
        <div className="inline-flex items-center gap-2 bg-white/[.06] border border-white/10 rounded-full px-3.5 py-1.5 mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400"/>
          <span className="text-xs text-slate-300 font-medium">Argo HQ · Parañaque City</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-white text-center tracking-tight mb-2">
          Who are you here as?
        </h1>
        <p className="text-slate-400 text-sm text-center mb-10 max-w-xs">
          Choose your role to get started. Visitors register a pass; staff sign in to their dashboard.
        </p>

        {/* Role cards — side by side on sm+, stacked on mobile */}
        <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Visitor card */}
          <button onClick={onVisitor}
            className="group relative bg-blue-600 hover:bg-blue-500 text-white rounded-2xl p-6 flex flex-col items-start gap-4 transition-all duration-200 shadow-xl shadow-blue-600/30 overflow-hidden text-left">
            {/* Subtle shine */}
            <div style={{position:"absolute",top:0,left:0,right:0,height:"50%",background:"linear-gradient(180deg,rgba(255,255,255,0.08) 0%,transparent 100%)",borderRadius:"16px 16px 0 0",pointerEvents:"none"}}/>
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">👤</div>
            <div>
              <div className="text-lg font-bold leading-tight mb-1">I'm a visitor</div>
              <div className="text-sm text-blue-100 leading-snug">Register your visit, get a QR pass, and present it at the security desk.</div>
            </div>
            <div className="mt-auto flex items-center gap-1 text-blue-200 text-xs font-medium">
              Register now <span className="text-base group-hover:translate-x-0.5 transition-transform inline-block">→</span>
            </div>
          </button>

          {/* Staff card */}
          <button onClick={onStaff}
            className="group relative bg-white/[.07] hover:bg-white/[.12] border border-white/10 text-white rounded-2xl p-6 flex flex-col items-start gap-4 transition-all duration-200 overflow-hidden text-left">
            <div style={{position:"absolute",top:0,left:0,right:0,height:"50%",background:"linear-gradient(180deg,rgba(255,255,255,0.04) 0%,transparent 100%)",borderRadius:"16px 16px 0 0",pointerEvents:"none"}}/>
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-105 transition-transform">🛡️</div>
            <div>
              <div className="text-lg font-bold leading-tight mb-1">I'm staff</div>
              <div className="text-sm text-slate-400 leading-snug">Sign in to manage requests, check visitors in and out, and view analytics.</div>
            </div>
            <div className="mt-auto flex items-center gap-1 text-slate-400 group-hover:text-slate-300 text-xs font-medium transition-colors">
              Sign in <span className="text-base group-hover:translate-x-0.5 transition-transform inline-block">→</span>
            </div>
          </button>
        </div>

        {/* Staff roles hint */}
        <div className="flex items-center gap-4 mt-8">
          {[{label:"Admin",color:"bg-purple-500/20 text-purple-300"},{label:"Security",color:"bg-emerald-500/20 text-emerald-300"},{label:"Reception",color:"bg-blue-500/20 text-blue-300"}].map(r=>(
            <span key={r.label} className={cls("text-[11px] font-semibold px-2.5 py-1 rounded-full",r.color)}>{r.label}</span>
          ))}
        </div>

        {/* Retrieve pass link */}
        <div className="mt-6">
          <button onClick={onRetrieve}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors border border-white/10 hover:border-white/20 rounded-full px-4 py-2">
            🎫 Already registered? Retrieve your QR pass
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 border-t border-white/[.05]">
        <span className="text-slate-600 text-xs">Vista VMS · v1.2 · Powered by FastAPI + PostgreSQL</span>
      </footer>
    </div>
  );
}

// ─── STAFF LOGIN ──────────────────────────────────────────────────
function StaffLogin({ onSignInWithPassword, onEnrollBiometric, onVerifyBiometric, onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // step: 'password' -> typing email/password
  //       'biometric' -> waiting on the phone's Face ID/fingerprint prompt
  //       'enroll'    -> first-time device, offer to set up biometrics
  const [step, setStep] = useState("password");
  const [preAuthToken, setPreAuthToken] = useState(null);

  function friendlyError(err) {
    // Log the real error so it's visible in the browser/Eruda console —
    // otherwise a caught WebAuthn error never surfaces anywhere.
    console.error("[StaffLogin]", err?.name, err?.message, err);
    const backendMsg = err?.response?.data?.detail;
    if (typeof backendMsg === "string") return backendMsg;
    if (err?.name === "NotAllowedError") return "Biometric confirmation was cancelled or timed out.";
    if (err?.name) return `${err.name}: ${err.message || "Something went wrong during verification."}`;
    return "Invalid credentials, or the server is unreachable.";
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      if (!onSignInWithPassword) throw new Error("Auth is not wired up");
      const result = await onSignInWithPassword(email, password);
      setPreAuthToken(result.preAuthToken);
      if (result.status === "registration_required") {
        setStep("enroll");
        setLoading(false);
      } else {
        // Password confirmed — immediately trigger the biometric prompt,
        // no extra click needed.
        setStep("biometric");
        await runBiometricVerify(result.preAuthToken);
      }
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
    }
  }

  async function runBiometricVerify(token) {
    setLoading(true); setError("");
    try {
      const realUser = await onVerifyBiometric(token);
      onSuccess(realUser);
    } catch (err) {
      setError(friendlyError(err));
      setStep("password");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnroll() {
    setLoading(true); setError("");
    try {
      await onEnrollBiometric(preAuthToken, `${email} — device`);
      // Enrolled — immediately proceed to verify with the credential just created.
      setStep("biometric");
      await runBiometricVerify(preAuthToken);
    } catch (err) {
      setError(friendlyError(err));
      setLoading(false);
    }
  }

  const roleColors = { Administrator: "bg-purple-100 text-purple-700", "Security Guard": "bg-green-100 text-green-700", Receptionist: "bg-blue-100 text-blue-700" };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F2A4A] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm mb-6 transition-colors">
          ← Back
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-blue-600 items-center justify-center text-xl mb-2 shadow-lg shadow-blue-600/30">
            {step === "password" ? "🔒" : "👆"}
          </div>
          <h2 className="text-xl font-bold text-white">
            {step === "password" && "Staff Sign In"}
            {step === "biometric" && "Confirm on Your Phone"}
            {step === "enroll" && "Set Up Biometric Login"}
          </h2>
          <p className="text-slate-400 text-sm">
            {step === "password" && "Access your role-based dashboard"}
            {step === "biometric" && "Approve with Face ID or fingerprint to continue"}
            {step === "enroll" && "This account needs a device registered before it can sign in"}
          </p>
        </div>

        <div className="bg-white/[.07] backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-2xl">
          {error && <div className="bg-red-500/20 border border-red-500/30 text-red-300 text-xs rounded-lg px-3 py-2 mb-4">{error}</div>}

          {step === "password" && (
            <>
              <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3 mb-4">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400 block mb-1">Email</span>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="staff@vistahq.com"
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/10 text-white placeholder:text-slate-500 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-400 block mb-1">Password</span>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/10 text-white placeholder:text-slate-500 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
                <button type="submit" disabled={loading}
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-all mt-1">
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <div className="border-t border-white/10 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Demo Accounts</p>
                <div className="flex flex-col gap-1">
                  {DEMO_ACCOUNTS.map(u => (
                    <button key={u.email} onClick={() => { setEmail(u.email); setPassword(""); }}
                      className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group">
                      <div className="w-7 h-7 rounded-full bg-blue-600/30 text-blue-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{u.initials}</div>
                      <div className="flex-1">
                        <p className="text-slate-300 text-xs font-medium group-hover:text-white">{u.name}</p>
                        <p className="text-slate-500 text-[10px]">{u.role}</p>
                      </div>
                      <span className={cls("text-[10px] px-1.5 py-0.5 rounded font-semibold", roleColors[u.role] || "bg-gray-100 text-gray-600")}>{u.role.split(" ")[0]}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Click a name to fill the email, then type the password separately.</p>
              </div>
            </>
          )}

          {step === "biometric" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <p className="text-slate-400 text-sm text-center">
                Waiting for confirmation on your phone…<br />
                If nothing appears, check for a notification or open Vista VMS on your phone.
              </p>
              <button onClick={() => { setStep("password"); setLoading(false); }} className="text-slate-500 hover:text-white text-xs underline">
                Cancel
              </button>
            </div>
          )}

          {step === "enroll" && (
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-slate-300 text-sm text-center">
                No device is registered for <span className="font-semibold">{email}</span> yet.
                Register this device now — for cross-device sign-in later, do this on your own phone.
              </p>
              <button onClick={handleEnroll} disabled={loading}
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition-all">
                {loading ? "Setting up…" : "Enable Face ID / Fingerprint"}
              </button>
              <button onClick={() => { setStep("password"); setLoading(false); }} className="text-slate-500 hover:text-white text-xs underline">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── VISITOR PORTAL ───────────────────────────────────────────────
// ─── RETRIEVE PASS PAGE ───────────────────────────────────────────
function RetrievePass({ onBack }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function lookup() {
    if (!email.trim()) return;
    setLoading(true); setError(""); setResults(null);
    try {
      const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${BASE}/visit-requests/retrieve-pass?email=${encodeURIComponent(email.trim())}`);
      if (!res.ok) throw new Error("No approved visit requests found for this email.");
      const data = await res.json();
      setResults(data);
      if (data.length === 1) setSelected(data[0]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function resendEmail(req) {
    setResending(true); setResent(false);
    try {
      const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
      const res = await fetch(`${BASE}/visit-requests/resend-pass/${req.id}`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to resend");
      setResent(true);
    } catch {
      setError("Could not resend email. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm mb-6">
          ← Back
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-[#0F172A] p-6">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-xl mb-3">🎫</div>
            <h1 className="text-white text-xl font-bold">Retrieve My Pass</h1>
            <p className="text-slate-400 text-sm mt-1">Enter your email to find your approved visit QR pass</p>
          </div>

          <div className="p-6 flex flex-col gap-4">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && lookup()}
                placeholder="your@email.com"
                className="flex-1 h-10 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                onClick={lookup}
                disabled={loading || !email.trim()}
                className="px-4 h-10 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "…" : "Search"}
              </button>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                ❌ {error}
              </div>
            )}

            {results && results.length > 1 && !selected && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-gray-500 font-medium">Multiple visits found — select one:</p>
                {results.map(r => (
                  <button key={r.id} onClick={() => setSelected(r)}
                    className="text-left p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition">
                    <p className="text-sm font-semibold text-gray-900">{r.visit_date} · {r.host_name}</p>
                    <p className="text-xs text-gray-500">{r.purpose} · {r.status}</p>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="flex flex-col gap-4">
                {/* Details */}
                <div className="bg-gray-50 rounded-xl p-4 flex flex-col gap-2">
                  {[
                    ["Visitor", selected.visitor_name],
                    ["Visiting", selected.host_name],
                    ["Date", selected.visit_date],
                    ["Time", selected.expected_time || "Flexible"],
                    ["Purpose", selected.purpose],
                    ["Status", selected.status],
                  ].map(([l, v]) => (
                    <div key={l} className="flex justify-between text-xs">
                      <span className="text-gray-400">{l}</span>
                      <span className="font-semibold text-gray-800">{v}</span>
                    </div>
                  ))}
                  <div className="h-px bg-gray-200 my-1"/>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Reference No.</span>
                    <span className="font-mono font-bold text-blue-600">{selected.qr_ref}</span>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-2 bg-gray-50 rounded-xl p-4">
                  <QRCanvas
                    data={`${selected.qr_ref}|${selected.visitor_name}|${selected.visit_date}|${selected.host_name}`}
                    size={160}
                  />
                  <p className="text-xs text-gray-400">Show this at the security desk</p>
                  <span className="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-lg">
                    {selected.qr_ref}
                  </span>
                </div>

                {/* Resend button */}
                {resent ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 text-center">
                    ✅ QR pass resent to {selected.visitor_email || email}
                  </div>
                ) : (
                  <button
                    onClick={() => resendEmail(selected)}
                    disabled={resending}
                    className="h-10 w-full rounded-xl border border-blue-200 text-blue-600 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50"
                  >
                    {resending ? "Sending…" : "📧 Resend QR pass to my email"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const Field = ({ k, label, type, placeholder, colSpan, form, errors, onChange }) => (
  <label className={cls("block", colSpan === 2 && "col-span-2")}>
    <span className="text-xs font-semibold text-gray-600">{label} <span className="text-red-500">*</span></span>
    <input type={type || "text"} value={form[k]} onChange={onChange(k)} placeholder={placeholder}
      className={cls("mt-1 w-full h-9 px-3 rounded-lg border text-sm outline-none",
        errors[k] ? "border-red-400 bg-red-50 focus:ring-1 focus:ring-red-300" : "border-gray-200 focus:ring-2 focus:ring-blue-200")} />
    {errors[k] && <p className="text-[11px] text-red-500 mt-0.5">{errors[k]}</p>}
  </label>
);

function VisitorPortal({ onBack, apiMode = false }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    full_name: "", company: "", phone: "", email: "",
    id_type: "Driver's License", id_number: "",
    host_name: "", visit_date: "", expected_time: "", purpose: "",
  });
  const [errors, setErrors] = useState({});
  const [qrInfo, setQrInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  function validate() {
    const e = {};
    if (!form.full_name.trim()) e.full_name = "Required";
    if (!form.email.trim()) e.email = "Required";
    if (!form.id_number.trim()) e.id_number = "Required";
    if (!form.host_name.trim()) e.host_name = "Required";
    if (!form.visit_date) e.visit_date = "Required";
    if (!form.purpose.trim()) e.purpose = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await createVisitRequest({
        visitor_name:  form.full_name,
        visitor_email: form.email,
        company:       form.company || null,
        phone:         form.phone || null,
        id_type:       form.id_type,
        id_number:     form.id_number,
        host_name:     form.host_name,
        visit_date:    form.visit_date,
        expected_time: form.expected_time || null,
        purpose:       form.purpose,
      });
      const created = res.data; // VisitRequestOut, includes real qr_ref from the backend
      setQrInfo({
        ref: created.qr_ref, name: form.full_name, company: form.company,
        host: form.host_name, date: form.visit_date, time: form.expected_time, purpose: form.purpose,
      });
      setStep(2);
    } catch (e) {
      console.error("Failed to submit visit request", e);
      const backendMsg = e?.response?.data?.detail;
      setSubmitError(typeof backendMsg === "string" ? backendMsg : "Something went wrong submitting your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }


  if (step === 2 && qrInfo) return (
    <VisitorQRCard info={qrInfo} onClose={onBack} />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-5">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-blue-600 items-center justify-center text-xl mb-2 shadow-lg shadow-blue-600/30">🪪</div>
          <h1 className="text-xl font-bold text-gray-900">Visitor Registration</h1>
          <p className="text-gray-500 text-sm">No account needed. Fill out the form to request your visit.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Step indicator */}
          <div className="flex items-center px-5 py-3 bg-gray-50 border-b border-gray-100 gap-2">
            {[["1", "Your info"], ["2", "Visit details"], ["3", "Confirmation"]].map(([n, l], i) => (
              <div key={n} className="flex items-center gap-1.5">
                <div className={cls("w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                  step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500")}>{n}</div>
                <span className={cls("text-[11px] font-medium hidden sm:block", step === i + 1 ? "text-blue-600" : "text-gray-400")}>{l}</span>
                {i < 2 && <div className="w-6 h-px bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>

          <div className="p-5 flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Personal information</p>
              <div className="grid grid-cols-2 gap-3">
                <Field k="full_name" label="Full name" placeholder="Juan dela Cruz" colSpan={2}  form={form} errors={errors} onChange={f} />
                <Field k="company" label="Company / org" placeholder="Optional" form={form} errors={errors} onChange={f} />
                <Field k="phone" label="Phone" placeholder="09171234567"  form={form} errors={errors} onChange={f} />
                <Field k="email" label="Email address" type="email" placeholder="you@example.com" colSpan={2}  form={form} errors={errors} onChange={f} />
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">ID type <span className="text-red-500">*</span></span>
                  <select value={form.id_type} onChange={f("id_type")}
                    className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none">
                    {["Driver's License","Passport","National ID","PhilSys ID","Voter's ID","PRC ID"].map(o=><option key={o}>{o}</option>)}
                  </select>
                </label>
                <Field k="id_number" label="ID number" placeholder="e.g. DL-2024-001"  form={form} errors={errors} onChange={f} />
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Visit details</p>
              <div className="grid grid-cols-2 gap-3">
                <Field k="host_name" label="Person you're visiting" placeholder="Maria Santos" colSpan={2}  form={form} errors={errors} onChange={f} />
                <Field k="visit_date" label="Visit date" type="date"  form={form} errors={errors} onChange={f} />
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Expected time</span>
                  <input type="time" value={form.expected_time} onChange={f("expected_time")}
                    className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none" />
                </label>
                <label className="block col-span-2">
                  <span className="text-xs font-semibold text-gray-600">Purpose of visit <span className="text-red-500">*</span></span>
                  <textarea value={form.purpose} onChange={f("purpose")} rows={2} placeholder="Briefly describe the purpose..."
                    className={cls("mt-1 w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none",
                      errors.purpose ? "border-red-400 bg-red-50" : "border-gray-200")} />
                  {errors.purpose && <p className="text-[11px] text-red-500 mt-0.5">{errors.purpose}</p>}
                </label>
              </div>
            </div>

            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700 flex gap-2">
              <span>ℹ️</span>
              <span>After submitting, you'll receive a QR code pass. Present it at the security desk along with a valid government ID.</span>
            </div>

            {submitError && <p className="text-xs text-red-500 -mt-1">{submitError}</p>}

            <div className="flex gap-2">
              <button onClick={onBack}
                className="px-4 h-10 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                ← Back
              </button>
              <button onClick={submit} disabled={submitting}
                className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
                {submitting ? "Submitting..." : "Submit & Get QR Pass →"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SHARED UI ────────────────────────────────────────────────────
function Badge({ status }) {
  return <span className={cls("inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold", statusColor(status))}>{status}</span>;
}
function Btn({ children, onClick, variant = "primary", size = "md", disabled, className }) {
  const base = "inline-flex items-center gap-1.5 font-medium rounded-[6px] transition-all focus:outline-none";
  const sizes = { sm: "px-2.5 py-1 text-xs", md: "px-3.5 py-1.5 text-sm", lg: "px-5 py-2 text-sm" };
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50",
    outline: "border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50",
    ghost: "text-gray-600 hover:bg-gray-100 disabled:opacity-50",
    success: "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50",
    danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
    warning: "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50",
  };
  return <button onClick={onClick} disabled={disabled} className={cls(base, sizes[size], variants[variant], className)}>{children}</button>;
}
function Input({ label, value, onChange, type = "text", placeholder, required }) {
  return (
    <label className="block text-xs font-semibold text-gray-600">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
    </label>
  );
}
function Dialog({ open, title, onClose, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div onClick={e => e.stopPropagation()}
        className={cls("relative bg-white rounded-[14px] shadow-2xl w-full flex flex-col max-h-[90vh]", wide ? "max-w-2xl" : "max-w-md")}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
function Kpi({ label, value, icon, color = "bg-blue-50 text-blue-600", trend }) {
  return (
    <div className="bg-white rounded-[12px] border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
      <div className={cls("w-10 h-10 rounded-lg flex items-center justify-center text-lg", color)}>{icon}</div>
      <div className="flex-1">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {trend !== undefined && <div className={cls("text-xs font-medium mt-0.5", trend >= 0 ? "text-green-600" : "text-red-500")}>{trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last week</div>}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase font-bold">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value || "—"}</p>
    </div>
  );
}

// ─── ACCESS DENIED ────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <div className="text-5xl">🚫</div>
      <h2 className="text-lg font-bold text-gray-800">Access Denied</h2>
      <p className="text-sm text-gray-500">You don't have permission to view this page.</p>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────
// Derives last-7-days bar chart data from the live requests array.
// No API call needed — requests are already loaded on the dashboard.
function DashboardWeeklyChart({ requests }) {
  const data = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("en-PH", { weekday: "short" });
      const visits = requests.filter(r => r.visit_date === iso).length;
      days.push({ day: label, visits });
    }
    return days;
  }, [requests]);

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} barSize={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="visits" fill="#2563EB" radius={[3,3,0,0]} name="Visits" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Dashboard({ requests, visitors, user }) {
  const pending = requests.filter(r => r.approval_status === "Pending").length;
  const checkedIn = requests.filter(r => r.status === "Checked In").length;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Welcome back, {user.name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-gray-500">Live overview · {new Date().toLocaleDateString("en-PH", { weekday:"long",year:"numeric",month:"long",day:"numeric" })}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Registered Visitors" value={visitors.length} icon="👥" color="bg-blue-50 text-blue-600" />
        <Kpi label="Currently Inside" value={checkedIn} icon="🏢" color="bg-emerald-50 text-emerald-600" />
        <Kpi label="Pending Requests" value={pending} icon="⏳" color="bg-amber-50 text-amber-600" />
        <Kpi label="Total Requests" value={requests.length} icon="📋" color="bg-violet-50 text-violet-600" />
      </div>
      <div className="bg-white rounded-[12px] border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">This week</h3>
        <DashboardWeeklyChart requests={requests} />
      </div>
      <div className="bg-white rounded-[12px] border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 text-sm mb-3">Recent requests</h3>
        {requests.slice(0,5).map(r => (
          <div key={r.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 font-bold text-[11px] flex items-center justify-center">{r.visitor_name.charAt(0)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{r.visitor_name}</p>
              <p className="text-xs text-gray-400">{r.purpose} · {r.visit_date}</p>
            </div>
            <Badge status={r.approval_status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── VISITORS PAGE ────────────────────────────────────────────────
function VisitorDetailDrawer({ visitor, requests, onClose, onBlock, user }) {
  if (!visitor) return null;

  // All visit history for this visitor
  const history = requests.filter(r =>
    r.visitor_id === visitor.id ||
    r.visitor_name?.toLowerCase() === visitor.full_name?.toLowerCase()
  ).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const lastVisit  = history[0];
  const totalVisits = history.length;
  const canBlock = ["Administrator","Receptionist"].includes(user.role);

  function fmt(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-PH", { month:"short", day:"numeric", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }

  const statusColors = {
    "Checked In":  "text-emerald-600 bg-emerald-50",
    "Checked Out": "text-gray-500 bg-gray-100",
    "Pending Arrival": "text-blue-600 bg-blue-50",
    "Rejected":    "text-red-600 bg-red-50",
    "Pending":     "text-amber-600 bg-amber-50",
  };

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900 text-base">Visitor Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {/* Identity card */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {visitor.full_name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-lg leading-tight">{visitor.full_name}</h3>
              {visitor.company && <p className="text-sm text-gray-500">{visitor.company}</p>}
              <div className="flex items-center gap-2 mt-1">
                <Badge status={visitor.status} />
                {totalVisits > 0 && (
                  <span className="text-xs text-gray-400">{totalVisits} visit{totalVisits !== 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
          </div>

          {/* Contact & ID */}
          <div className="bg-gray-50 rounded-[10px] p-4 flex flex-col gap-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Contact & ID</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Phone",    value: visitor.phone   || "—" },
                { label: "Email",    value: visitor.email   || "—" },
                { label: "ID Type",  value: visitor.id_type || "—" },
                { label: "ID No.",   value: visitor.id_number || "—" },
                { label: "Registered", value: fmt(visitor.created_at) },
              ].map(f => (
                <div key={f.label} className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wider">{f.label}</span>
                  <span className="text-xs font-medium text-gray-800 break-all">{f.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Last visit summary */}
          {lastVisit && (
            <div className="bg-blue-50 border border-blue-100 rounded-[10px] p-4 flex flex-col gap-2">
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Last Visit</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Date",      value: lastVisit.visit_date || "—" },
                  { label: "Purpose",   value: lastVisit.purpose    || "—" },
                  { label: "Host",      value: lastVisit.host_name  || "—" },
                  { label: "Badge",     value: lastVisit.badge_number || "—" },
                  { label: "Time In",   value: fmt(lastVisit.checked_in_at) },
                  { label: "Time Out",  value: fmt(lastVisit.checked_out_at) },
                ].map(f => (
                  <div key={f.label} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-blue-500 uppercase tracking-wider">{f.label}</span>
                    <span className="text-xs font-medium text-blue-900">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full visit history */}
          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Visit History</p>
              {history.map((r, i) => (
                <div key={r.id || i} className="bg-white border border-gray-100 rounded-[10px] p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-gray-800">{r.visit_date}</span>
                    <span className={cls("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      statusColors[r.status] || "bg-gray-100 text-gray-500")}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">Purpose:</span> {r.purpose || "—"}
                  </p>
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">Host:</span> {r.host_name || "—"}
                  </p>
                  {r.badge_number && (
                    <p className="text-xs text-gray-500">
                      <span className="font-medium">Badge:</span> {r.badge_number}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-x-3 mt-0.5">
                    <p className="text-[10px] text-gray-400">In: {fmt(r.checked_in_at)}</p>
                    <p className="text-[10px] text-gray-400">Out: {fmt(r.checked_out_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {history.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No visit history yet.</p>
          )}
        </div>

        {/* Footer actions */}
        {canBlock && (
          <div className="px-5 py-4 border-t border-gray-100">
            <button onClick={() => onBlock(visitor.id)}
              className={cls(
                "w-full py-2.5 rounded-xl text-sm font-semibold transition-colors",
                visitor.status === "Blocked"
                  ? "bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                  : "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
              )}>
              {visitor.status === "Blocked" ? "✅ Unblock Visitor" : "🚫 Block Visitor"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function VisitorsPage({ visitors, setVisitors, user, requests = [], apiMode = false, refreshVisitors = async () => {} }) {
  const [q, setQ]             = useState("");
  const [open, setOpen]       = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm]       = useState({ full_name:"",company:"",phone:"",email:"",id_type:"Driver's License",id_number:"" });
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState("");
  const canAdd = user.role !== "Security Guard";

  // Status filter
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = visitors.filter(v => {
    const matchQ = v.full_name.toLowerCase().includes(q.toLowerCase()) ||
                   v.company?.toLowerCase().includes(q.toLowerCase()) ||
                   v.email?.toLowerCase().includes(q.toLowerCase()) ||
                   v.phone?.includes(q) ||
                   v.id_number?.includes(q);
    const matchStatus = statusFilter === "All" || v.status === statusFilter;
    return matchQ && matchStatus;
  });

  // Auto-mark visitor as Inactive after check-out — derive from requests
  // A visitor is "currently inside" if their latest request status is "Checked In"
  // Otherwise they are Active (registered) or Blocked.
  // We show a computed presence status in the table alongside the account status.
  function getPresence(visitor) {
    const vReqs = requests.filter(r =>
      r.visitor_id === visitor.id ||
      r.visitor_name?.toLowerCase() === visitor.full_name?.toLowerCase()
    );
    if (vReqs.length === 0) return null;
    const latest = vReqs.sort((a,b) => (b.created_at||"").localeCompare(a.created_at||""))[0];
    if (latest.status === "Checked In")  return "Inside";
    if (latest.status === "Checked Out") return "Visited";
    return null;
  }

  async function submit() {
    if (!form.full_name||!form.id_number) return;
    setSaveError(""); setSaving(true);
    try {
      await createVisitor(form);
      await refreshVisitors();
      setOpen(false);
      setForm({full_name:"",company:"",phone:"",email:"",id_type:"Driver's License",id_number:""});
    } catch (e) {
      console.error("Failed to save visitor", e);
      setSaveError("Failed to save visitor. Please try again.");
    } finally { setSaving(false); }
  }

  async function handleBlock(id) {
    try { await toggleBlockVisitor(id); await refreshVisitors(); setSelected(null); }
    catch (e) { console.error("Failed to toggle block", e); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Visitor History</h1>
          <p className="text-sm text-gray-500">All registered visitors — click a row to view details</p>
        </div>
        {canAdd && <Btn onClick={() => setOpen(true)}>+ New Visitor</Btn>}
      </div>

      {/* Search + filter bar */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px] bg-white rounded-[10px] border border-gray-200 px-3 flex items-center gap-2">
          <span className="text-gray-400 text-sm">🔍</span>
          <input className="flex-1 h-9 text-sm outline-none bg-transparent"
            placeholder="Search name, company, email, phone, ID…"
            value={q} onChange={e => setQ(e.target.value)} />
          {q && <button onClick={() => setQ("")} className="text-gray-300 hover:text-gray-500 text-sm">✕</button>}
        </div>
        {["All","Active","Blocked"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cls("px-3 py-1 rounded-full text-xs font-medium transition-colors border",
              statusFilter === s ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50")}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Company</th>
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Account</th>
              <th className="px-5 py-3">Presence</th>
              <th className="px-5 py-3">Registered</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No visitors found</td></tr>
            )}
            {filtered.map(v => {
              const presence = getPresence(v);
              return (
                <tr key={v.id}
                  onClick={() => setSelected(v)}
                  className="border-b border-gray-100 last:border-0 hover:bg-blue-50 cursor-pointer transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                        {v.full_name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{v.full_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{v.company || "—"}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{v.id_type} · {v.id_number}</td>
                  <td className="px-5 py-3"><Badge status={v.status} /></td>
                  <td className="px-5 py-3">
                    {presence === "Inside"  && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-600 bg-emerald-50">🟢 Inside</span>}
                    {presence === "Visited" && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-gray-500 bg-gray-100">Visited</span>}
                    {!presence && <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {v.created_at ? new Date(v.created_at).toLocaleDateString("en-PH", {month:"short",day:"numeric",year:"numeric"}) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Visitor detail drawer */}
      {selected && (
        <VisitorDetailDrawer
          visitor={selected}
          requests={requests}
          user={user}
          onClose={() => setSelected(null)}
          onBlock={handleBlock}
        />
      )}

      {/* Register new visitor dialog */}
      <Dialog open={open} title="Register New Visitor" onClose={() => setOpen(false)}
        footer={<><Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn><Btn onClick={submit} disabled={saving}>{saving ? "Saving..." : "Save Visitor"}</Btn></>}>
        {saveError && <p className="text-xs text-red-500 mb-2">{saveError}</p>}
        <Input label="Full Name" value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))} required />
        <Input label="Company" value={form.company} onChange={e=>setForm(p=>({...p,company:e.target.value}))} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} />
          <Input label="Email" type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-gray-600">ID Type
            <select value={form.id_type} onChange={e=>setForm(p=>({...p,id_type:e.target.value}))} className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
              {["Driver's License","Passport","National ID","PhilSys ID","Voter's ID"].map(o=><option key={o}>{o}</option>)}
            </select>
          </label>
          <Input label="ID Number" value={form.id_number} onChange={e=>setForm(p=>({...p,id_number:e.target.value}))} required />
        </div>
      </Dialog>
    </div>
  );
}

// ─── VISIT REQUESTS ───────────────────────────────────────────────
function VisitRequestsPage({ requests, setRequests, user, apiMode = false, refreshRequests = async () => {}, defaultFilter = "All" }) {
  const [checkinTarget, setCheckinTarget] = useState(null);
  const [badge, setBadge]                 = useState("");
  const [filterStatus, setFilterStatus]   = useState(defaultFilter);

  // Approve dialog state
  const [approveTarget, setApproveTarget]         = useState(null);  // request object
  const [areas, setAreas]                         = useState([]);
  const [grantRestricted, setGrantRestricted]     = useState(false);
  const [selectedArea, setSelectedArea]           = useState("");
  const [approving, setApproving]                 = useState(false);
  const [approveError, setApproveError]           = useState("");

  // Reject-with-reason dialog state
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting]       = useState(false);
  const [rejectError, setRejectError]   = useState("");

  // Assign-to-employee dialog state (receptionist re-routes a typo'd/missing host)
  const [assignTarget, setAssignTarget]   = useState(null);
  const [employees, setEmployees]         = useState([]);
  const [assignEmployee, setAssignEmployee] = useState("");
  const [assigning, setAssigning]         = useState(false);
  const [assignError, setAssignError]     = useState("");

  // Employee self-visit dialog state
  const [showSelfVisit, setShowSelfVisit] = useState(false);
  const [selfVisitForm, setSelfVisitForm] = useState({ visitor_name: "", visitor_email: "", company: "", phone: "", visit_date: "", expected_time: "", purpose: "" });
  const [savingSelfVisit, setSavingSelfVisit] = useState(false);
  const [selfVisitError, setSelfVisitError] = useState("");

  const isEmployee  = user.role === "Employee";
  const isReception = user.role === "Receptionist";
  // Only the matched host Employee may APPROVE (backend enforces this);
  // rejection stays with the host Employee or the Receptionist. Admins have
  // no approve/reject controls per the access spec.
  const canApprove  = isEmployee;
  const canReject   = isEmployee || isReception;
  const canCheckIn  = ["Administrator","Super Admin","Receptionist"].includes(user.role);
  const filtered   = requests.filter(r =>
    filterStatus === "All" || r.approval_status === filterStatus || r.status === filterStatus
  );

  // Load restricted areas when admin opens approve dialog
  useEffect(() => {
    if (!approveTarget || !apiMode) return;
    getRestrictedAreas().then(r => setAreas(r.data)).catch(() => setAreas([]));
  }, [approveTarget, apiMode]);

  // Load the employee dropdown when the assign dialog opens
  useEffect(() => {
    if (!assignTarget) return;
    setAssignEmployee(assignTarget.host_staff_id || "");
    getEmployees().then(r => setEmployees(r.data)).catch(() => setEmployees([]));
  }, [assignTarget]);

  async function openApprove(r) {
    setApproveTarget(r);
    setGrantRestricted(false);
    setSelectedArea("");
    setApproveError("");
  }

  async function openReject(r) {
    setRejectTarget(r);
    setRejectReason("");
    setRejectError("");
  }

  async function openAssign(r) {
    setAssignTarget(r);
    setAssignError("");
  }

  async function doApprove() {
    setApproving(true); setApproveError("");
    try {
      await approveRequest(approveTarget.id, {
        action: "Approved",
        restricted_area_id: grantRestricted && selectedArea ? selectedArea : null,
      });
      await refreshRequests();
      setApproveTarget(null);
    } catch(e) {
      setApproveError(e?.response?.data?.detail || "Failed to approve. Try again.");
    } finally { setApproving(false); }
  }

  async function doReject() {
    if (!rejectReason.trim()) { setRejectError("Please type a reason for the rejection."); return; }
    setRejecting(true); setRejectError("");
    try {
      await approveRequest(rejectTarget.id, { action: "Rejected", rejection_reason: rejectReason.trim() });
      await refreshRequests();
      setRejectTarget(null);
    } catch(e) {
      setRejectError(e?.response?.data?.detail || "Failed to reject. Try again.");
    } finally { setRejecting(false); }
  }

  async function doAssign() {
    if (!assignEmployee) { setAssignError("Choose the correct employee to send this request to."); return; }
    setAssigning(true); setAssignError("");
    try {
      await assignRequest(assignTarget.id, { host_staff_id: assignEmployee });
      await refreshRequests();
      setAssignTarget(null);
    } catch(e) {
      setAssignError(e?.response?.data?.detail || "Failed to send request. Try again.");
    } finally { setAssigning(false); }
  }

  async function checkOut(id) {
    try { await checkOutVisitor(id); await refreshRequests(); }
    catch (e) { console.error("Failed to check out visitor", e); alert("Failed to check out. See console."); }
  }

  async function doCheckIn() {
    try { await checkInVisitor(checkinTarget, { badge_number: badge, visitor_id_verified: true }); await refreshRequests(); }
    catch (e) { console.error("Failed to check in visitor", e); alert("Failed to check in. See console."); }
    setCheckinTarget(null); setBadge("");
  }

  async function handleSelfVisit() {
    if (!selfVisitForm.visitor_name || !selfVisitForm.visit_date || !selfVisitForm.purpose) return;
    setSavingSelfVisit(true); setSelfVisitError("");
    try {
      await createSelfVisit(selfVisitForm);
      await refreshRequests();
      setShowSelfVisit(false);
      setSelfVisitForm({ visitor_name: "", visitor_email: "", company: "", phone: "", visit_date: "", expected_time: "", purpose: "" });
    } catch (e) {
      setSelfVisitError(e?.response?.data?.detail || "Failed to create pass.");
    } finally {
      setSavingSelfVisit(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEmployee ? (defaultFilter === "Checked Out" ? "Visitor History" : "My Visit Requests") : "Visit Requests"}</h1>
          <p className="text-sm text-gray-500">{isEmployee ? (defaultFilter === "Checked Out" ? "Visitors who have already visited you" : "Create visitor passes for people visiting you") : "Approve, reject, check-in and check-out"}</p>
        </div>
        {isEmployee && <Btn onClick={() => { setSelfVisitError(""); setShowSelfVisit(true); }}>+ Create Visitor Pass</Btn>}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {["All","Pending","Approved","Rejected","Checked In","Checked Out"].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={cls("px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filterStatus === s ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50")}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[12px] border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3">Visitor</th>
              <th className="px-4 py-3">Host</th>
              <th className="px-4 py-3">Date/Time</th>
              <th className="px-4 py-3">Purpose</th>
              <th className="px-4 py-3">Approval</th>
              <th className="px-4 py-3">Status</th>
              {(canApprove || canReject || canCheckIn) && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No requests match</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.visitor_name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {r.host_name}
                  {!r.host_staff_id && (
                    <span className="ml-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{r.visit_date} · {r.expected_time}</td>
                <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate text-xs">{r.purpose}</td>
                <td className="px-4 py-3"><Badge status={r.approval_status} /></td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                {(canApprove || canReject || canCheckIn) && (
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {canApprove && r.approval_status === "Pending" && (
                        <>
                          <Btn size="sm" variant="success" onClick={() => openApprove(r)}>Approve</Btn>
                          <Btn size="sm" variant="danger"  onClick={() => openReject(r)}>Reject</Btn>
                        </>
                      )}
                      {isReception && r.approval_status === "Pending" && (
                        <>
                          <Btn size="sm" variant="outline" onClick={() => openAssign(r)}>Send</Btn>
                          <Btn size="sm" variant="danger"  onClick={() => openReject(r)}>Reject</Btn>
                        </>
                      )}
                      {canCheckIn && r.approval_status === "Approved" && r.status === "Pending Arrival" && (
                        <Btn size="sm" variant="outline" onClick={() => setCheckinTarget(r.id)}>Check In</Btn>
                      )}
                      {r.status === "Checked In" && (
                        <Btn size="sm" variant="warning" onClick={() => checkOut(r.id)}>Check Out</Btn>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Approve dialog — with optional restricted area grant */}
      <Dialog open={!!approveTarget} title="Approve Visit Request" onClose={() => setApproveTarget(null)}
        footer={<>
          <Btn variant="ghost" onClick={() => setApproveTarget(null)}>Cancel</Btn>
          <Btn onClick={doApprove} disabled={approving || (grantRestricted && !selectedArea)}>
            {approving ? "Approving…" : "Approve"}
          </Btn>
        </>}>
        {approveTarget && (
          <div className="flex flex-col gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-900">{approveTarget.visitor_name}</p>
              <p className="text-xs text-gray-500">{approveTarget.purpose} · {approveTarget.visit_date}</p>
            </div>

            {/* Restricted area toggle — only visible to Admin, hidden from visitor */}
            {["Administrator","Super Admin"].includes(user.role) && (
              <div className={cls(
                "rounded-lg border p-3 flex flex-col gap-2 transition-colors",
                grantRestricted ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"
              )}>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={grantRestricted}
                    onChange={e => { setGrantRestricted(e.target.checked); setSelectedArea(""); }}
                    className="w-4 h-4 accent-red-600" />
                  <span className="text-xs font-semibold text-gray-700">
                    🔒 Grant Restricted Area Access
                  </span>
                </label>
                <p className="text-[11px] text-gray-400 pl-6">
                  Visitor will NOT see this — only guards see it after scanning their QR.
                </p>
                {grantRestricted && (
                  <label className="block text-xs font-semibold text-gray-600 pl-6">
                    Select Area
                    <select value={selectedArea} onChange={e => setSelectedArea(e.target.value)}
                      className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
                      <option value="">— Choose a restricted area —</option>
                      {areas.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.floor ? ` · ${a.floor}` : ""}
                        </option>
                      ))}
                    </select>
                    {areas.length === 0 && (
                      <p className="text-[11px] text-amber-600 mt-1">No restricted areas defined yet. Create one in the Restricted Areas page first.</p>
                    )}
                  </label>
                )}
              </div>
            )}

            {approveError && <p className="text-xs text-red-500">{approveError}</p>}
          </div>
        )}
      </Dialog>

      {/* Reject dialog — reason is required */}
      <Dialog open={!!rejectTarget} title="Reject Visit Request" onClose={() => setRejectTarget(null)}
        footer={<>
          <Btn variant="ghost" onClick={() => setRejectTarget(null)}>Cancel</Btn>
          <Btn variant="danger" onClick={doReject} disabled={rejecting || !rejectReason.trim()}>
            {rejecting ? "Rejecting…" : "Reject Request"}
          </Btn>
        </>}>
        {rejectTarget && (
          <div className="flex flex-col gap-3">
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-900">{rejectTarget.visitor_name}</p>
              <p className="text-xs text-gray-500">{rejectTarget.purpose} · {rejectTarget.visit_date}</p>
            </div>
            <Input label="Reason for rejection *"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Invalid ID, typo in name, no-show policy…" required />
            <p className="text-[11px] text-gray-400 -mt-2">This reason is sent to the visitor via email.</p>
            {rejectError && <p className="text-xs text-red-500">{rejectError}</p>}
          </div>
        )}
      </Dialog>

      {/* Assign / Send dialog — receptionist routes a mis-typed host to the right employee */}
      <Dialog open={!!assignTarget} title="Send Request to Employee" onClose={() => setAssignTarget(null)}
        footer={<>
          <Btn variant="ghost" onClick={() => setAssignTarget(null)}>Cancel</Btn>
          <Btn onClick={doAssign} disabled={assigning || !assignEmployee}>Send Request</Btn>
        </>}>
        {assignTarget && (
          <div className="flex flex-col gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ This request has no valid host ({assignTarget.host_name || "no name"}). Pick the correct employee to send it to — they will then approve or reject it.
            </div>
            <label className="block text-xs font-semibold text-gray-600">
              Employee
              <select value={assignEmployee} onChange={e => setAssignEmployee(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
                <option value="">— Choose the employee —</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}{emp.department_name ? ` · ${emp.department_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {employees.length === 0 && (
              <p className="text-[11px] text-amber-600 -mt-2">No employees loaded — refresh and try again.</p>
            )}
            {assignError && <p className="text-xs text-red-500">{assignError}</p>}
          </div>
        )}
      </Dialog>

      {/* Check-in dialog */}
      <Dialog open={!!checkinTarget} title="Check In Visitor" onClose={() => setCheckinTarget(null)}
        footer={<><Btn variant="ghost" onClick={() => setCheckinTarget(null)}>Cancel</Btn><Btn onClick={doCheckIn} disabled={!badge}>Confirm</Btn></>}>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          ⚠️ Verify visitor's government ID first.
        </div>
        <Input label="Badge Number" value={badge} onChange={e => setBadge(e.target.value)} placeholder="e.g. V-1024" required />
      </Dialog>

      {/* Employee self-visit dialog */}
      <Dialog open={showSelfVisit} title="Create Visitor Pass" onClose={() => setShowSelfVisit(false)}
        footer={<>
          <Btn variant="ghost" onClick={() => setShowSelfVisit(false)}>Cancel</Btn>
          <Btn onClick={handleSelfVisit} disabled={savingSelfVisit || !selfVisitForm.visitor_name || !selfVisitForm.visit_date || !selfVisitForm.purpose}>
            {savingSelfVisit ? "Creating..." : "Create Pass"}
          </Btn>
        </>}>
        <p className="text-xs text-gray-500 -mt-1 mb-2">Fill in your visitor's details. The pass will be sent to their email.</p>
        {selfVisitError && <p className="text-xs text-red-500 mb-2">{selfVisitError}</p>}
        <Input label="Visitor Name" value={selfVisitForm.visitor_name} onChange={e => setSelfVisitForm(p => ({...p, visitor_name: e.target.value}))} required placeholder="e.g. Juan Dela Cruz" />
        <Input label="Visitor Email" type="email" value={selfVisitForm.visitor_email} onChange={e => setSelfVisitForm(p => ({...p, visitor_email: e.target.value}))} placeholder="visitor@email.com (for QR pass)" />
        <Input label="Company" value={selfVisitForm.company} onChange={e => setSelfVisitForm(p => ({...p, company: e.target.value}))} placeholder="Optional" />
        <Input label="Phone" value={selfVisitForm.phone} onChange={e => setSelfVisitForm(p => ({...p, phone: e.target.value}))} placeholder="Optional" />
        <Input label="Visit Date" type="date" value={selfVisitForm.visit_date} onChange={e => setSelfVisitForm(p => ({...p, visit_date: e.target.value}))} required />
        <Input label="Expected Time" type="time" value={selfVisitForm.expected_time} onChange={e => setSelfVisitForm(p => ({...p, expected_time: e.target.value}))} />
        <Input label="Purpose" value={selfVisitForm.purpose} onChange={e => setSelfVisitForm(p => ({...p, purpose: e.target.value}))} required placeholder="e.g. Team meeting" />
      </Dialog>
    </div>
  );
}

// ─── QR SCANNER (camera-based) ────────────────────────────────────
function QRScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        tick();
      })
      .catch(() => setError("Camera access denied. Please allow camera permissions and try again."));

    function tick() {
      if (!active || !scanning) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          // Use BarcodeDetector if available (Chrome 83+, Edge 83+)
          if ("BarcodeDetector" in window) {
            const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
            detector.detect(canvas).then(codes => {
              if (codes.length > 0) {
                setScanning(false);
                onResult(codes[0].rawValue);
              } else {
                rafRef.current = requestAnimationFrame(tick);
              }
            }).catch(() => { rafRef.current = requestAnimationFrame(tick); });
          } else {
            // Fallback: show manual input
            setError("QR auto-detect not supported on this browser. Use manual entry below.");
          }
        } catch { rafRef.current = requestAnimationFrame(tick); }
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[700] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-[#0F172A] p-4 flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-semibold">📷 Scan Visitor QR Code</p>
            <p className="text-slate-400 text-xs">Point camera at visitor's QR pass</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="relative bg-black" style={{ minHeight: 240 }}>
          <video ref={videoRef} className="w-full" playsInline muted style={{ display: "block" }} />
          <canvas ref={canvasRef} style={{ display: "none" }} />
          {/* Scan frame overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div style={{ width: 180, height: 180, position: "relative" }}>
              {[["0","0","borderTop","borderLeft"],["0","0","borderTop","borderRight",{right:0,left:"auto"}],
                ["0","0","borderBottom","borderLeft",{bottom:0,top:"auto"}],
                ["0","0","borderBottom","borderRight",{bottom:0,top:"auto",right:0,left:"auto"}]
              ].map((_,i) => null)}
              <div style={{position:"absolute",top:0,left:0,width:32,height:32,borderTop:"3px solid #2563EB",borderLeft:"3px solid #2563EB",borderRadius:"4px 0 0 0"}}/>
              <div style={{position:"absolute",top:0,right:0,width:32,height:32,borderTop:"3px solid #2563EB",borderRight:"3px solid #2563EB",borderRadius:"0 4px 0 0"}}/>
              <div style={{position:"absolute",bottom:0,left:0,width:32,height:32,borderBottom:"3px solid #2563EB",borderLeft:"3px solid #2563EB",borderRadius:"0 0 0 4px"}}/>
              <div style={{position:"absolute",bottom:0,right:0,width:32,height:32,borderBottom:"3px solid #2563EB",borderRight:"3px solid #2563EB",borderRadius:"0 0 4px 0"}}/>
              <div style={{position:"absolute",top:"50%",left:4,right:4,height:2,background:"rgba(37,99,235,0.6)",animation:"scan 1.5s linear infinite"}}/>
            </div>
          </div>
          <style>{`@keyframes scan{0%{top:20%}50%{top:80%}100%{top:20%}}`}</style>
        </div>

        {error && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
            <p className="text-xs text-amber-700">{error}</p>
          </div>
        )}

        {/* Manual fallback */}
        <div className="p-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2">Or enter reference number manually:</p>
          <ManualQREntry onResult={onResult} />
        </div>
      </div>
    </div>
  );
}

function ManualQREntry({ onResult }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="e.g. VR-ABC123"
        className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
        onKeyDown={e => e.key === "Enter" && val.trim() && onResult(val.trim())}
      />
      <button
        onClick={() => val.trim() && onResult(val.trim())}
        className="px-3 h-9 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
      >
        Look up
      </button>
    </div>
  );
}

// ─── SECURITY DESK ────────────────────────────────────────────────
function SecurityDesk({ requests, setRequests, user = null, apiMode = false, refreshRequests = async () => {} }) {
  const [q, setQ]                         = useState("");
  const [badge, setBadge]                 = useState("");
  const [target, setTarget]               = useState(null);
  const [showScanner, setShowScanner]     = useState(false);
  const [scanResult, setScanResult]       = useState(null);
  const [idVerified, setIdVerified]       = useState(false);

  // Restricted area state — shown inside check-in dialog if pre-approved
  const [restrictedInfo, setRestrictedInfo]     = useState(null);   // fetched from backend
  const [restrictedBadge, setRestrictedBadge]   = useState("");
  const [issuingRestricted, setIssuingRestricted] = useState(false);
  const [restrictedResult, setRestrictedResult]   = useState(null);
  const [restrictedError, setRestrictedError]     = useState("");

  const approved = requests.filter(r =>
    r.approval_status === "Approved" &&
    (r.status === "Pending Arrival" || r.status === "Checked In") &&
    (r.visitor_name.toLowerCase().includes(q.toLowerCase()) || r.id?.toString().includes(q))
  );

  async function openCheckIn(r) {
    setTarget(r);
    setIdVerified(false);
    setBadge("");
    setRestrictedInfo(null);
    setRestrictedBadge("");
    setRestrictedResult(null);
    setRestrictedError("");

    // Silently check if this visitor has restricted area access pre-approved
    if (apiMode) {
      try {
        const res = await getRequestRestrictedAccess(r.id);
        if (res.data?.has_restricted_access) {
          setRestrictedInfo(res.data);
        }
      } catch (e) {
        // Non-fatal — guard still sees normal check-in
        console.warn("Could not fetch restricted access info", e);
      }
    }
  }

  function closeCheckIn() {
    setTarget(null); setIdVerified(false); setBadge("");
    setRestrictedInfo(null); setRestrictedBadge("");
    setRestrictedResult(null); setRestrictedError("");
  }

  async function checkOut(id) {
    try { await checkOutVisitor(id); await refreshRequests(); }
    catch (e) { console.error("Failed to check out visitor", e); alert("Failed to check out visitor. See console for details."); }
  }

  async function confirmCheckIn() {
    try { await checkInVisitor(target.id, { badge_number: badge, visitor_id_verified: idVerified }); await refreshRequests(); }
    catch (e) { console.error("Failed to check in visitor", e); alert("Failed to check in visitor. See console for details."); }
    closeCheckIn();
  }

  async function doIssueRestrictedBadge() {
    if (!restrictedBadge || !restrictedInfo) return;
    setIssuingRestricted(true); setRestrictedError(""); setRestrictedResult(null);
    try {
      const res = await issueRestrictedBadge({
        qr_ref: target.qr_ref || target.id,
        restricted_area_id: restrictedInfo.restricted_area_id,
        restricted_badge: restrictedBadge,
      });
      setRestrictedResult(res.data);
    } catch(e) {
      setRestrictedError(e?.response?.data?.detail || "Failed to issue restricted badge.");
    } finally { setIssuingRestricted(false); }
  }

  function handleQRResult(raw) {
    setShowScanner(false);
    const parts = raw.split("|");
    const ref = parts[0];
    const found = requests.find(r =>
      r.qr_ref === ref || r.id === ref || r.id?.toString() === ref
    );
    if (found) {
      setScanResult({ found: true, request: found });
      if (found.approval_status === "Approved" && found.status === "Pending Arrival") {
        openCheckIn(found);
      }
    } else {
      setScanResult({ found: false, raw });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Security Desk</h1>
          <p className="text-sm text-gray-500">Verify IDs, issue badges, log entry and exit</p>
        </div>
        <button onClick={() => { setShowScanner(true); setScanResult(null); }}
          className="flex items-center gap-2 px-4 h-10 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow">
          📷 Scan QR
        </button>
      </div>

      {/* QR scan result banner */}
      {scanResult && !target && (
        <div className={`rounded-xl p-4 flex items-start gap-3 ${scanResult.found ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <span className="text-xl">{scanResult.found ? "✅" : "❌"}</span>
          <div>
            {scanResult.found ? (
              <>
                <p className="text-sm font-semibold text-green-800">Visitor found: {scanResult.request.visitor_name}</p>
                <p className="text-xs text-green-600">Status: {scanResult.request.status} · {scanResult.request.approval_status}</p>
                {scanResult.request.status !== "Pending Arrival" && (
                  <p className="text-xs text-amber-700 mt-1">⚠️ This visitor is not in Pending Arrival status.</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-red-800">No matching visitor found</p>
                <p className="text-xs text-red-600">QR ref: {scanResult.raw}</p>
              </>
            )}
          </div>
          <button onClick={() => setScanResult(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
      )}

      <div className="bg-[#0F172A] rounded-[12px] p-4 text-white">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Check-in procedure</p>
        <div className="flex items-center gap-3 flex-wrap text-xs">
          {["🚶 Visitor arrives","📷 Scan QR / Search","🪪 Verify ID","🔖 Issue badge","✅ Log check-in"].map((s,i,a) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{i+1}</div>
              <span className="text-slate-300">{s}</span>
              {i < a.length-1 && <span className="text-slate-600">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[12px] border border-gray-200 p-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search visitor name…"
          className="w-full h-9 pl-4 pr-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
      </div>

      <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3">Visitor</th><th className="px-4 py-3">Host</th>
            <th className="px-4 py-3">Scheduled</th><th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Badge</th><th className="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>
            {approved.length === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No approved visitors</td></tr>}
            {approved.map(r => (
              <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.visitor_name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.host || r.host_name}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{r.visit_date} · {r.expected_time}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">{r.badge_number || "—"}</span>
                    {r.destination_type === "Restricted" && (
                      <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">🔒 Restricted</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 flex gap-1">
                  {r.status === "Pending Arrival" && <Btn size="sm" variant="success" onClick={() => openCheckIn(r)}>🔖 Check In</Btn>}
                  {r.status === "Checked In" && ["Administrator","Super Admin","Receptionist"].includes(user?.role) && <Btn size="sm" variant="warning" onClick={() => checkOut(r.id)}>Exit</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Check-in dialog */}
      <Dialog open={!!target} title="Check In Visitor" onClose={closeCheckIn}
        footer={<>
          <Btn variant="ghost" onClick={closeCheckIn}>Cancel</Btn>
          <Btn onClick={confirmCheckIn} disabled={!badge || !idVerified}>Confirm & Issue Badge</Btn>
        </>}>
        {target && (
          <div className="flex flex-col gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-900">{target.visitor_name}</p>
              <p className="text-xs text-gray-500">{target.purpose} · Visiting {target.host || target.host_name}</p>
            </div>

            <div className="flex flex-col items-center gap-2 py-1">
              <p className="text-xs text-gray-400 font-medium">Visitor QR Pass</p>
              <QRCanvas data={`${target.qr_ref || target.id}|${target.visitor_name}|${target.visit_date}|${target.host || target.host_name}`} size={120} />
              <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{target.qr_ref || target.id}</span>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ Verify the visitor's government ID before proceeding.
            </div>
            <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={idVerified} onChange={e => setIdVerified(e.target.checked)} />
              <span>Government ID verified — name and photo match.</span>
            </label>

            <Input label="Regular Badge Number" value={badge} onChange={e => setBadge(e.target.value)} placeholder="e.g. V-1024" required />

            {/* Restricted area section — shown when the visitor's request is
                recognised as a restricted destination (host in a restricted
                department) and/or a restricted grant already exists */}
            {restrictedInfo && (
              <div className="border border-red-200 bg-red-50 rounded-lg p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔒</span>
                  <div>
                    <p className="text-xs font-bold text-red-800">
                      {restrictedInfo.status === "Pending" ? "Restricted Area Visit Detected" : "Restricted Area Access Approved"}
                    </p>
                    <p className="text-xs text-red-600">
                      Area: <span className="font-semibold">{restrictedInfo.area_name}</span>
                      {restrictedInfo.floor ? ` · ${restrictedInfo.floor}` : ""}
                    </p>
                  </div>
                </div>
                {["Receptionist"].includes(user?.role) && (
                  <button
                    onClick={() => window.__vista_set_page?.("restricted")}
                    className="text-left text-[11px] font-semibold text-red-700 bg-white border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-100 transition-colors">
                    → Go to Restricted Areas
                  </button>
                )}
                {restrictedInfo.status === "Pending" && !restrictedResult && (
                  <>
                    <p className="text-[11px] text-red-700">Issue a restricted badge number for this visitor.</p>
                    <div className="flex gap-2">
                      <input value={restrictedBadge} onChange={e => setRestrictedBadge(e.target.value)}
                        placeholder="e.g. RA-1024"
                        className="flex-1 h-9 px-3 rounded-lg border border-red-200 text-sm outline-none focus:ring-2 focus:ring-red-200 bg-white" />
                      <Btn onClick={doIssueRestrictedBadge} disabled={issuingRestricted || !restrictedBadge}>
                        {issuingRestricted ? "…" : "Issue"}
                      </Btn>
                    </div>
                    {restrictedError && <p className="text-xs text-red-600">{restrictedError}</p>}
                  </>
                )}
                {restrictedResult && (
                  <div className="bg-white rounded-lg px-3 py-2 border border-red-100">
                    <p className="text-xs font-semibold text-emerald-700">✅ Restricted badge issued</p>
                    <p className="text-xs text-gray-600">Badge: <span className="font-mono font-bold">{restrictedResult.restricted_badge}</span></p>
                    <p className="text-[11px] text-gray-400 mt-0.5">A second guard will scan this badge at the area entrance to confirm entry.</p>
                  </div>
                )}
                {restrictedInfo.status === "Badge Issued" && (
                  <p className="text-xs text-gray-500">Badge already issued: <span className="font-mono font-bold">{restrictedInfo.restricted_badge}</span></p>
                )}
              </div>
            )}

            {!idVerified && <p className="text-xs text-red-500">You must verify the government ID before confirming check-in.</p>}
          </div>
        )}
      </Dialog>

      {showScanner && <QRScanner onResult={handleQRResult} onClose={() => setShowScanner(false)} />}
    </div>
  );
}

// ─── ANALYTICS ────────────────────────────────────────────────────
function Analytics({ requests, visitors, user, apiMode = false }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiMode) return;
    setLoading(true);
    getAnalyticsSummary()
      .then(res => setSummary(res.data))
      .catch(e => console.error("Failed to load analytics", e))
      .finally(() => setLoading(false));
  }, [apiMode]);

  // Derive totals from live requests (always available)
  const total    = requests.length;
  const checkedIn= requests.filter(r => r.status === "Checked In").length;
  const pending  = requests.filter(r => r.approval_status === "Pending").length;
  const rejected = requests.filter(r => r.approval_status === "Rejected").length;
  const approved = requests.filter(r => r.approval_status === "Approved").length;

  // Use API data when available, fall back to client-derived data
  const weeklyData  = summary?.weekly_traffic  || [];
  const monthlyData = summary?.monthly_traffic || [];
  const purposeData = summary?.purpose_dist    || [];
  const hourData    = summary?.hour_dist       || [];

  const statusBreakdown = [
    { label: "Approved", count: approved, pct: total ? Math.round(approved/total*100) : 0, color: "bg-green-500" },
    { label: "Pending",  count: pending,  pct: total ? Math.round(pending/total*100)  : 0, color: "bg-yellow-500" },
    { label: "Rejected", count: rejected, pct: total ? Math.round(rejected/total*100) : 0, color: "bg-red-500" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500">{["Administrator","Super Admin"].includes(user.role) ? "Full-system overview" : "Your desk analytics"}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Visitors"   value={visitors.length} icon="👥" color="bg-blue-50 text-blue-600" />
        <Kpi label="Total Requests"   value={total}           icon="📋" color="bg-violet-50 text-violet-600" />
        <Kpi label="Currently Inside" value={checkedIn}       icon="🏢" color="bg-emerald-50 text-emerald-600" />
        <Kpi label="Pending Approval" value={pending}         icon="⏳" color="bg-amber-50 text-amber-600" />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-4">Loading charts…</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Weekly visitor traffic</h3>
          {weeklyData.length === 0
            ? <p className="text-xs text-gray-400 text-center py-8">No data for the last 7 days</p>
            : <ResponsiveContainer width="100%" height={180}>
                <BarChart data={weeklyData} barSize={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip contentStyle={{fontSize:12}} />
                  <Bar dataKey="visits" fill="#2563EB" radius={[3,3,0,0]} name="Visits" />
                </BarChart>
              </ResponsiveContainer>}
        </div>

        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Monthly trend</h3>
          {monthlyData.length === 0
            ? <p className="text-xs text-gray-400 text-center py-8">No data yet</p>
            : <ResponsiveContainer width="100%" height={180}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{fontSize:11}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip contentStyle={{fontSize:12}} />
                  <Line type="monotone" dataKey="visits" stroke="#2563EB" strokeWidth={2} dot={{r:3}} name="Visits" />
                </LineChart>
              </ResponsiveContainer>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Visit purpose breakdown</h3>
          {purposeData.length === 0
            ? <p className="text-xs text-gray-400 text-center py-8">No data yet</p>
            : <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={150}>
                  <PieChart>
                    <Pie data={purposeData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {purposeData.map((e,i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{fontSize:12}} formatter={v => [`${v}%`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 flex-1">
                  {purposeData.map(d => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{background: d.color}} />
                      <span className="text-gray-600 truncate">{d.name}</span>
                      <span className="font-semibold text-gray-800 ml-auto">{d.value}%</span>
                    </div>
                  ))}
                </div>
              </div>}
        </div>

        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Peak arrival hours</h3>
          {hourData.length === 0
            ? <p className="text-xs text-gray-400 text-center py-8">No scheduled times recorded yet</p>
            : <ResponsiveContainer width="100%" height={150}>
                <BarChart data={hourData} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{fontSize:10}} />
                  <YAxis tick={{fontSize:11}} allowDecimals={false} />
                  <Tooltip contentStyle={{fontSize:12}} />
                  <Bar dataKey="count" fill="#0891B2" radius={[3,3,0,0]} name="Arrivals" />
                </BarChart>
              </ResponsiveContainer>}
        </div>
      </div>

      {["Administrator","Super Admin"].includes(user.role) && (
        <div className="bg-white rounded-[12px] border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Request status breakdown</h3>
          <div className="flex gap-4">
            {statusBreakdown.map(s => (
              <div key={s.label} className="flex-1">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-600 font-medium">{s.label}</span>
                  <span className="font-bold text-gray-900">{s.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cls("h-full rounded-full", s.color)} style={{width: `${s.pct}%`}} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.pct}% of total</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AUDIT LOG ────────────────────────────────────────────────────
function AuditLog({ apiMode = false }) {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!apiMode) return;
    setLoading(true);
    getAuditLog({ limit: 200 })
      .then(res => setEvents(res.data))
      .catch(() => setError("Could not load audit log."))
      .finally(() => setLoading(false));
  }, [apiMode]);

  const typeColor = {
    "Staff Login":       "text-blue-600 bg-blue-50",
    "Staff Logout":      "text-gray-600 bg-gray-100",
    "Request Created":   "text-violet-600 bg-violet-50",
    "Request Approved":  "text-green-600 bg-green-50",
    "Request Rejected":  "text-red-600 bg-red-50",
    "Checked In":        "text-emerald-600 bg-emerald-50",
    "Checked Out":       "text-gray-600 bg-gray-100",
    "Visitor Blocked":   "text-orange-600 bg-orange-50",
    "Visitor Unblocked": "text-blue-600 bg-blue-50",
  };

  function fmt(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Audit Log</h1>
        <p className="text-sm text-gray-500">Full server-side event trail — who did what and when</p>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-8">Loading…</p>}
      {error   && <p className="text-sm text-red-500 text-center py-4">{error}</p>}
      {!apiMode && <p className="text-sm text-gray-400 text-center py-8">Connect to the backend to view the audit log.</p>}

      {!loading && apiMode && events.length === 0 && !error && (
        <p className="text-sm text-gray-400 text-center py-8">No events recorded yet.</p>
      )}

      {events.length > 0 && (
        <div className="bg-white rounded-[12px] border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Visitor</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3 whitespace-nowrap">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={cls("px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap",
                      typeColor[e.event_type] || "bg-gray-100 text-gray-600")}>
                      {e.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 font-medium">{e.actor_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{e.visitor_name || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-[180px] truncate">{e.detail || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmt(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


// ─── RESTRICTED AREAS ─────────────────────────────────────────────
function RestrictedAreas({ requests, user, apiMode = false }) {
  const [areas,       setAreas]       = useState([]);
  const [selected,    setSelected]    = useState(null);  // area for occupant view
  const [occupants,   setOccupants]   = useState([]);
  const [loadingAreas,setLoadingAreas]= useState(false);
  const [loadingOcc,  setLoadingOcc]  = useState(false);
  const [areaError,   setAreaError]   = useState("");

  // Create area dialog
  const [showCreate,  setShowCreate]  = useState(false);
  const [areaForm,    setAreaForm]    = useState({ name:"", description:"", floor:"" });
  const [saving,      setSaving]      = useState(false);

  // Grant access dialog
  const [showGrant,   setShowGrant]   = useState(null);  // area object
  const [grantReqId,  setGrantReqId]  = useState("");
  const [granting,    setGranting]    = useState(false);
  const [grantError,  setGrantError]  = useState("");

  // Guard: issue badge dialog
  const [showIssue,   setShowIssue]   = useState(null);  // area object
  const [issueQR,     setIssueQR]     = useState("");
  const [issueBadge,  setIssueBadge]  = useState("");
  const [issuing,     setIssuing]     = useState(false);
  const [issueResult, setIssueResult] = useState(null);
  const [issueError,  setIssueError]  = useState("");

  // Guard: confirm entry/exit
  const [scanMode,    setScanMode]    = useState(null);   // "entry" | "exit"
  const [scanBadge,   setScanBadge]   = useState("");
  const [scanResult,  setScanResult]  = useState(null);
  const [scanError,   setScanError]   = useState("");
  const [scanning,    setScanning]    = useState(false);

  // Search
  const [q, setQ] = useState("");

  const isAdmin = ["Administrator","Super Admin"].includes(user.role);
  const isAdminOrRecep = ["Administrator","Super Admin","Receptionist"].includes(user.role);
  const isRestrictedStaff = ["Receptionist", "Security Guard"].includes(user.role);

  function loadAreas() {
    if (!apiMode) return;
    setLoadingAreas(true);
    getRestrictedAreas()
      .then(r => setAreas(r.data))
      .catch(() => setAreaError("Failed to load restricted areas."))
      .finally(() => setLoadingAreas(false));
  }

  useEffect(() => { loadAreas(); }, [apiMode]);

  function loadOccupants(area) {
    setSelected(area);
    setLoadingOcc(true);
    getAreaOccupants(area.id)
      .then(r => setOccupants(r.data))
      .catch(() => setOccupants([]))
      .finally(() => setLoadingOcc(false));
  }

  async function createArea() {
    if (!areaForm.name) return;
    setSaving(true);
    try {
      await createRestrictedArea(areaForm);
      setShowCreate(false); setAreaForm({ name:"", description:"", floor:"" });
      loadAreas();
    } catch(e) { setAreaError(e?.response?.data?.detail || "Failed to create area."); }
    finally { setSaving(false); }
  }

  async function removeArea(id) {
    if (!confirm("Deactivate this restricted area?")) return;
    await deleteRestrictedArea(id); loadAreas();
  }

  async function doGrant() {
    if (!grantReqId) return;
    setGranting(true); setGrantError("");
    try {
      await grantRestrictedAccess(showGrant.id, { visit_request_id: grantReqId });
      setShowGrant(null); setGrantReqId(""); loadAreas();
    } catch(e) { setGrantError(e?.response?.data?.detail || "Failed to grant access."); }
    finally { setGranting(false); }
  }

  async function doIssueBadge() {
    if (!issueQR || !issueBadge) return;
    setIssuing(true); setIssueError(""); setIssueResult(null);
    try {
      const r = await issueRestrictedBadge({ qr_ref: issueQR, restricted_area_id: showIssue.id, restricted_badge: issueBadge });
      setIssueResult(r.data); setIssueQR(""); setIssueBadge("");
      loadAreas();
    } catch(e) { setIssueError(e?.response?.data?.detail || "Failed to issue badge."); }
    finally { setIssuing(false); }
  }

  async function doScan() {
    if (!scanBadge) return;
    setScanning(true); setScanError(""); setScanResult(null);
    try {
      const fn = scanMode === "entry" ? confirmRestrictedEntry : confirmRestrictedExit;
      const r = await fn({ restricted_badge: scanBadge });
      setScanResult(r.data); setScanBadge(""); loadAreas();
      if (selected) loadOccupants(selected);
    } catch(e) { setScanError(e?.response?.data?.detail || "Badge not found or wrong status."); }
    finally { setScanning(false); }
  }

  function statusColor(s) {
    return s === "Inside"       ? "text-emerald-600 bg-emerald-50"
         : s === "Badge Issued" ? "text-blue-600 bg-blue-50"
         : s === "Exited"       ? "text-gray-500 bg-gray-100"
         :                        "text-amber-600 bg-amber-50";
  }

  const filteredAreas = areas.filter(a =>
    a.name.toLowerCase().includes(q.toLowerCase()) ||
    a.floor?.toLowerCase().includes(q.toLowerCase())
  );

  // Approved requests that can be granted restricted access
  const approvedRequests = requests.filter(r => r.approval_status === "Approved");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Restricted Areas</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? "Manage areas, grant access, and view occupants"
             : isAdminOrRecep ? "Manage areas and grant access"
             : "Issue and scan restricted badges"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Btn variant="outline" onClick={loadAreas} disabled={loadingAreas}>↻ Refresh</Btn>
          {isAdminOrRecep && (
            <Btn onClick={() => setShowCreate(true)}>+ New Area</Btn>
          )}
          {(isRestrictedStaff || isAdmin) && (<>
            <Btn variant="outline" onClick={() => { setScanMode("entry"); setScanResult(null); setScanError(""); }}>🔍 Confirm Entry</Btn>
            <Btn variant="outline" onClick={() => { setScanMode("exit");  setScanResult(null); setScanError(""); }}>🚪 Confirm Exit</Btn>
          </>)}
        </div>
      </div>

      {/* Entry / Exit scan panel */}
      {scanMode && (
        <div className="bg-white rounded-[12px] border border-gray-200 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">
              {scanMode === "entry" ? "🔍 Confirm Restricted Area Entry" : "🚪 Confirm Restricted Area Exit"}
            </h3>
            <button onClick={() => { setScanMode(null); setScanResult(null); setScanError(""); }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
          <div className="flex gap-2">
            <input value={scanBadge} onChange={e => setScanBadge(e.target.value)}
              placeholder="Enter restricted badge number e.g. RA-1024"
              className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
              onKeyDown={e => e.key === "Enter" && doScan()} />
            <Btn onClick={doScan} disabled={scanning || !scanBadge}>{scanning ? "…" : "Confirm"}</Btn>
          </div>
          {scanError && <p className="text-xs text-red-500">{scanError}</p>}
          {scanResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-emerald-800">✅ {scanResult.visitor_name}</p>
              <p className="text-xs text-emerald-600">{scanResult.area_name} — {scanResult.status}</p>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-[12px] border border-gray-200 p-3">
        <input className="w-full h-9 pl-4 pr-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="Search areas by name or floor…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {areaError && <p className="text-sm text-red-500">{areaError}</p>}
      {loadingAreas && <p className="text-sm text-gray-400 text-center py-8">Loading…</p>}

      {/* Areas grid */}
      {!loadingAreas && filteredAreas.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No restricted areas defined yet.</p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredAreas.map(area => (
          <div key={area.id} className="bg-white rounded-[12px] border border-gray-200 p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base">🔒</span>
                  <h3 className="font-bold text-gray-900 text-sm">{area.name}</h3>
                </div>
                {area.floor && <p className="text-xs text-gray-400 mt-0.5">Floor: {area.floor}</p>}
                {area.description && <p className="text-xs text-gray-500 mt-1">{area.description}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  {area.current_occupants} inside
                </span>
                {isAdmin && (
                  <button onClick={() => removeArea(area.id)}
                    className="text-gray-300 hover:text-red-400 text-sm leading-none transition-colors">✕</button>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {isAdmin && (
                <button onClick={() => loadOccupants(area)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                  👥 View Occupants
                </button>
              )}
              {isAdmin && (
                <button onClick={() => { setShowGrant(area); setGrantReqId(""); setGrantError(""); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 font-medium transition-colors">
                  ＋ Grant Access
                </button>
              )}
              {(isRestrictedStaff || isAdmin) && (
                <button onClick={() => { setShowIssue(area); setIssueQR(""); setIssueBadge(""); setIssueResult(null); setIssueError(""); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-50 font-medium transition-colors">
                  🪪 Issue Badge
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Occupants panel — Admin only */}
      {selected && isAdmin && (
        <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Occupants — {selected.name}</h3>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
          {loadingOcc
            ? <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
            : occupants.length === 0
              ? <p className="text-sm text-gray-400 text-center py-6">No access records for this area.</p>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3">Visitor</th>
                      <th className="px-4 py-3">Badge</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Approved By</th>
                      <th className="px-4 py-3">Entered</th>
                      <th className="px-4 py-3">Exited</th>
                    </tr></thead>
                    <tbody>
                      {occupants.map(o => (
                        <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{o.visitor_name}</td>
                          <td className="px-4 py-3 text-xs font-mono text-gray-600">{o.restricted_badge || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={cls("px-2 py-0.5 rounded-full text-[11px] font-semibold", statusColor(o.status))}>
                              {o.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{o.approved_by_name || "—"}</td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {o.entry_confirmed_at ? new Date(o.entry_confirmed_at).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {o.exited_at ? new Date(o.exited_at).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          }
        </div>
      )}

      {/* Create Area Dialog */}
      <Dialog open={showCreate} title="Create Restricted Area" onClose={() => setShowCreate(false)}
        footer={<><Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn><Btn onClick={createArea} disabled={saving}>{saving ? "Saving…" : "Create Area"}</Btn></>}>
        <Input label="Area Name" value={areaForm.name} onChange={e => setAreaForm(p => ({...p, name: e.target.value}))} required placeholder="e.g. Server Room, Lab B" />
        <Input label="Floor / Location" value={areaForm.floor} onChange={e => setAreaForm(p => ({...p, floor: e.target.value}))} placeholder="e.g. 3rd Floor" />
        <Input label="Description" value={areaForm.description} onChange={e => setAreaForm(p => ({...p, description: e.target.value}))} placeholder="Optional notes about this area" />
      </Dialog>

      {/* Grant Access Dialog — Admin only */}
      <Dialog open={!!showGrant} title={`Grant Restricted Access — ${showGrant?.name}`} onClose={() => setShowGrant(null)}
        footer={<><Btn variant="ghost" onClick={() => setShowGrant(null)}>Cancel</Btn><Btn onClick={doGrant} disabled={granting || !grantReqId}>{granting ? "Granting…" : "Grant Access"}</Btn></>}>
        <p className="text-xs text-gray-500 mb-2">Select an approved visit request to grant access to this restricted area. The guard will then issue a special badge.</p>
        {grantError && <p className="text-xs text-red-500 mb-2">{grantError}</p>}
        <label className="block text-xs font-semibold text-gray-600 mb-1">Approved Visit Request
          <select value={grantReqId} onChange={e => setGrantReqId(e.target.value)}
            className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
            <option value="">— Select a request —</option>
            {approvedRequests.map(r => (
              <option key={r.id} value={r.id}>{r.visitor_name} · {r.visit_date} · {r.purpose}</option>
            ))}
          </select>
        </label>
      </Dialog>

      {/* Issue Restricted Badge Dialog — Guard / Admin */}
      <Dialog open={!!showIssue} title={`Issue Restricted Badge — ${showIssue?.name}`} onClose={() => setShowIssue(null)}
        footer={<><Btn variant="ghost" onClick={() => setShowIssue(null)}>Close</Btn><Btn onClick={doIssueBadge} disabled={issuing || !issueQR || !issueBadge}>{issuing ? "Issuing…" : "Issue Badge"}</Btn></>}>
        <p className="text-xs text-gray-500 mb-2">Scan or enter the visitor's approval QR code, then assign a restricted badge number.</p>
        {issueError && <p className="text-xs text-red-500 mb-2">{issueError}</p>}
        {issueResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-2">
            <p className="text-xs font-semibold text-emerald-800">✅ Badge issued to {issueResult.visitor_name}</p>
            <p className="text-xs text-emerald-600">Badge: {issueResult.restricted_badge} → {issueResult.area_name}</p>
          </div>
        )}
        <Input label="Visitor QR Ref" value={issueQR} onChange={e => setIssueQR(e.target.value)} placeholder="Paste or scan approval QR ref" />
        <Input label="Restricted Badge Number" value={issueBadge} onChange={e => setIssueBadge(e.target.value)} placeholder="e.g. RA-1024" />
      </Dialog>
    </div>
  );
}

// ─── MODULE PERMISSIONS PICKER (Admin staff accounts) ─────────────
function ModulePicker({ value = [], onChange }) {
  const ids = Object.keys(MODULES).filter(id => id !== "dashboard");
  function toggle(id) {
    const next = value.includes(id) ? value.filter(m => m !== id) : [...value, id];
    onChange(next);
  }
  return (
    <div className="grid grid-cols-2 gap-1.5 mt-1">
      <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-500 cursor-not-allowed">
        <input type="checkbox" disabled checked className="accent-blue-600" />
        <span className="font-medium">{MODULES.dashboard.icon} {MODULES.dashboard.label}</span>
        <span className="ml-auto text-[10px]">always on</span>
      </label>
      {ids.map(id => {
        const on = value.includes(id);
        return (
          <label key={id} className={cls("flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs cursor-pointer transition-colors",
            on ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50")}>
            <input type="checkbox" checked={on} onChange={() => toggle(id)} className="accent-blue-600" />
            <span className={cls("font-medium", on ? "text-blue-800" : "text-gray-600")}>{MODULES[id].icon} {MODULES[id].label}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─── STAFF MANAGEMENT (Admin only) ──────────────────────────────
function StaffManagement({ apiMode = false }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(() => ({
    name: "", email: "", password: "", role: "Security Guard", post_id: null, department_id: null,
    permissions: DEFAULT_MODULES_BY_ROLE["Security Guard"].filter(m => m !== "dashboard"),
  }));
  const [saving, setSaving] = useState(false);

  // Edit-access dialog state
  const [editAccess, setEditAccess] = useState(null); // staff record being edited
  const [editPerms, setEditPerms] = useState([]);
  const [savingPerms, setSavingPerms] = useState(false);
  const [permError, setPermError] = useState("");

  function loadStaff() {
    if (!apiMode) return;
    setLoading(true);
    getStaff()
      .then(r => setStaff(r.data))
      .catch(() => setError("Failed to load staff."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadStaff(); }, [apiMode]);

  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    if (!apiMode) return;
    getDepartments().then(r => setDepartments(r.data || [])).catch(() => {});
  }, [apiMode]);

  async function handleCreate() {
    if (!form.name || !form.email || !form.password) return;
    if (form.role === "Security Guard") {
      const dept = departments.find(d => d.id === form.department_id);
      if (!dept || !dept.post_id) {
        setError("A Security Guard must belong to a department whose room is linked — select a department with a linked room.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = { ...form };
      payload.permissions = ["dashboard", ...(form.permissions || [])];
      await createStaff(payload);
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "Security Guard", post_id: null, department_id: null,
        permissions: DEFAULT_MODULES_BY_ROLE["Security Guard"].filter(m => m !== "dashboard") });
      loadStaff();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to create staff.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(id, currentActive) {
    try {
      await updateStaff(id, { is_active: !currentActive });
      loadStaff();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to update staff.");
    }
  }

  async function handleRoleChange(id, newRole) {
    try {
      await updateStaff(id, { role: newRole });
      loadStaff();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to update role.");
    }
  }

  async function handleDepartmentChange(id, deptId) {
    try {
      await updateStaff(id, deptId ? { department_id: deptId } : { clear_department: true });
      loadStaff();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to update department.");
    }
  }

  async function handleSaveAccess() {
    if (!editAccess) return;
    setSavingPerms(true); setPermError("");
    try {
      await updateStaff(editAccess.id, { permissions: ["dashboard", ...editPerms] });
      setEditAccess(null);
      loadStaff();
    } catch (e) {
      setPermError(e?.response?.data?.detail || "Failed to update access.");
    } finally {
      setSavingPerms(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-sm text-gray-500">Create and manage staff accounts and roles</p>
        </div>
        <Btn onClick={() => setShowCreate(true)}>+ New Staff</Btn>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-400 text-center py-8">Loading...</p>}

      {!loading && staff.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No staff accounts found.</p>
      )}

      {staff.length > 0 && (
        <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500 border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Post</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map(s => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-[11px] font-bold">{s.initials}</div>
                      <div>
                        <p className="font-medium text-gray-900">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select value={s.role} onChange={e => handleRoleChange(s.id, e.target.value)}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white">
                      <option value="Super Admin">Super Admin</option>
                      <option value="Administrator">Administrator</option>
                      <option value="Receptionist">Receptionist</option>
                      <option value="Employee">Employee</option>
                      <option value="Security Guard">Security Guard</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {s.role === "Super Admin" ? (
                      <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded-full">All modules</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">{effectivePermissions(s).length} modules</span>
                        <Btn size="sm" variant="ghost" onClick={() => {
                          setEditAccess(s);
                          setEditPerms(effectivePermissions(s).filter(m => m !== "dashboard"));
                          setPermError("");
                        }}>✏️ Edit</Btn>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select value={s.department_id || ""} onChange={e => handleDepartmentChange(s.id, e.target.value || null)}
                      className="text-xs px-2 py-1 rounded-lg border border-gray-200 bg-white max-w-[140px]">
                      <option value="">Unassigned</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
<td className="px-4 py-3">
                    {s.post_id ? (
                      <span className="text-xs font-medium text-gray-700">{roomLabel({ name: s.post_name, room_number: s.post_room_number })}</span>
                    ) : s.role === "Security Guard" ? (
                      <span className="text-[11px] text-red-500 font-medium">No room — assign a department with a linked room</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cls("px-2 py-0.5 rounded-full text-[11px] font-semibold",
                      s.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Btn size="sm" variant={s.is_active ? "danger" : "success"}
                      onClick={() => handleToggleActive(s.id, s.is_active)}>
                      {s.is_active ? "Deactivate" : "Activate"}
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showCreate} title="Create Staff Account" onClose={() => setShowCreate(false)}
        footer={<>
          <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
          <Btn onClick={handleCreate} disabled={saving || !form.name || !form.email || !form.password ||
            (form.role === "Security Guard" && (!form.department_id || !departments.find(d => d.id === form.department_id)?.post_id))}>
            {saving ? "Creating..." : "Create Account"}
          </Btn>
        </>}>
        <Input label="Full Name" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required placeholder="e.g. Juan Dela Cruz" />
        <Input label="Email" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} required placeholder="staff@vistahq.com" />
        <Input label="Password" type="password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} required placeholder="Min 8 characters" />
        <label className="block text-xs font-semibold text-gray-600">
          Role
          <select value={form.role} onChange={e => {
            const role = e.target.value;
            setForm(p => ({ ...p, role, permissions: DEFAULT_MODULES_BY_ROLE[role]?.filter(m => m !== "dashboard") || [] }));
          }}
            className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
            <option value="Super Admin">Super Admin</option>
            <option value="Administrator">Administrator</option>
            <option value="Receptionist">Receptionist</option>
            <option value="Employee">Employee</option>
            <option value="Security Guard">Security Guard</option>
          </select>
        </label>
        {form.role !== "Super Admin" && (
          <div>
            <p className="text-xs font-semibold text-gray-600">Module Access <span className="text-gray-400 font-normal">(checked = visible in this account's sidebar)</span></p>
            <ModulePicker value={form.permissions} onChange={perms => setForm(p => ({ ...p, permissions: perms }))} />
          </div>
        )}
        <label className="block text-xs font-semibold text-gray-600">
          Department
          <select value={form.department_id || ""} onChange={e => setForm(p => ({...p, department_id: e.target.value || null}))}
            className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
            <option value="">No department</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Room (Post) — auto-derived from the selected department
          <div className={cls("mt-1 w-full h-9 px-3 rounded-[8px] border text-sm flex items-center",
            (() => {
              const dept = departments.find(d => d.id === form.department_id);
              if (form.role === "Security Guard" && (!dept || !dept.post_id)) return "border-red-300 bg-red-50";
              return "border-gray-200 bg-gray-50";
            })()
          )}>
            {(() => {
              const dept = departments.find(d => d.id === form.department_id);
              if (!form.department_id) return <span className="text-gray-400 text-sm">Select a department first</span>;
              if (!dept?.post_id) return <span className={cls("text-sm", form.role === "Security Guard" ? "text-red-500 font-medium" : "text-gray-400")}>No room linked to this department yet — link one in Departments</span>;
              return <span className="text-sm text-gray-800 font-medium">{roomLabel({ name: dept.post_name, room_number: dept.post_room_number })}</span>;
            })()}
          </div>
          {form.role === "Security Guard" && !form.department_id && (
            <span className="mt-1 block text-[11px] text-red-500">A Security Guard must have a department — its room is the guard's post.</span>
          )}
          {form.role === "Security Guard" && form.department_id && !departments.find(d => d.id === form.department_id)?.post_id && (
            <span className="mt-1 block text-[11px] text-red-500">A Security Guard cannot scan without a room — link the room in Departments first.</span>
          )}
        </label>
      </Dialog>

      {/* Edit module access dialog */}
      <Dialog open={!!editAccess} title={editAccess ? `Module Access — ${editAccess.name}` : ""} onClose={() => setEditAccess(null)}
        footer={<>
          <Btn variant="ghost" onClick={() => setEditAccess(null)}>Cancel</Btn>
          <Btn onClick={handleSaveAccess} disabled={savingPerms}>Save Access</Btn>
        </>}>
        {editAccess && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500">
              Choose which modules appear in this account's sidebar. The backend enforces the same list with 403 responses.
              Changing the <span className="font-semibold">role</span> in the table above resets access to the role's defaults.
            </p>
            <ModulePicker value={editPerms} onChange={setEditPerms} />
            {permError && <p className="text-xs text-red-500">{permError}</p>}
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ─── DEPARTMENTS MANAGEMENT (Admin only) ────────────────────────
function DepartmentsManagement({ apiMode = false }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", is_restricted: false, restricted_area_id: null, post_id: null });
  const [restrictedAreas, setRestrictedAreas] = useState([]);
  const [posts, setPosts] = useState([]);
  const [saving, setSaving] = useState(false);

  function loadDepartments() {
    if (!apiMode) return;
    setLoading(true);
    getDepartments()
      .then(r => setDepartments(r.data))
      .catch(() => setError("Failed to load departments."))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadDepartments(); }, [apiMode]);

  useEffect(() => {
    if (!apiMode) return;
    getRestrictedAreas().then(r => setRestrictedAreas(r.data || [])).catch(() => {});
  }, [apiMode]);

  async function handleCreate() {
    if (!form.name) return;
    setSaving(true);
    try {
      await createDepartment(form);
      setShowCreate(false);
      setForm({ name: "", description: "", is_restricted: false, restricted_area_id: null, post_id: null });
      loadDepartments();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to create department.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!showEdit || !form.name) return;
    setSaving(true);
    try {
      await updateDepartment(showEdit.id, form);
      setShowEdit(null);
      setForm({ name: "", description: "", is_restricted: false, restricted_area_id: null, post_id: null });
      loadDepartments();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to update department.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(dept) {
    if (!confirm(`Delete department "${dept.name}"? This only works if it has no members.`)) return;
    try {
      await deleteDepartment(dept.id);
      loadDepartments();
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to delete department.");
    }
  }

  function openEdit(dept) {
    setForm({ name: dept.name, description: dept.description || "", is_restricted: dept.is_restricted, restricted_area_id: dept.restricted_area_id || null, post_id: dept.post_id || null });
    setShowEdit(dept);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500">Organize staff into departments. Mark restricted departments for badge-controlled access.</p>
        </div>
        <Btn onClick={() => { setForm({ name: "", description: "", is_restricted: false, restricted_area_id: null, post_id: null }); setShowCreate(true); }}>+ New Department</Btn>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-sm text-gray-400 text-center py-8">Loading...</p>}

      {!loading && departments.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No departments yet. Create one to get started.</p>
      )}

      {departments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map(d => (
            <div key={d.id} className="bg-white rounded-[12px] border border-gray-200 p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{d.name}</h3>
                  {d.description && <p className="text-xs text-gray-500 mt-1">{d.description}</p>}
                </div>
                <span className={cls("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                  d.is_restricted ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                  {d.is_restricted ? "Restricted" : "Public"}
                </span>
              </div>
              {d.is_restricted && d.restricted_area_name && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <p className="text-[10px] text-red-500 font-bold uppercase">Linked Area</p>
                  <p className="text-xs text-red-700 font-medium">{d.restricted_area_name}</p>
                </div>
              )}
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <p className="text-[10px] text-gray-400 font-bold uppercase">Room (Post)</p>
                <p className="text-xs text-gray-700 font-medium">
                  {d.post_id
                    ? roomLabel({ name: d.post_name, room_number: d.post_room_number })
                    : <span className="text-gray-400">No room linked yet</span>}
                </p>
              </div>
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-400">{d.member_count} member{d.member_count !== 1 ? "s" : ""}</span>
                <div className="flex gap-2">
                  <Btn size="sm" variant="ghost" onClick={() => openEdit(d)}>Edit</Btn>
                  <Btn size="sm" variant="danger" onClick={() => handleDelete(d)}>Delete</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={!!showCreate} title="Create Department" onClose={() => setShowCreate(false)}
        footer={<>
          <Btn variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Btn>
          <Btn onClick={handleCreate} disabled={saving || !form.name}>{saving ? "Creating..." : "Create"}</Btn>
        </>}>
        <Input label="Department Name" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required placeholder="e.g. Finance" />
        <label className="block text-xs font-semibold text-gray-600">
          Description (optional)
          <input type="text" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
            className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none" placeholder="Brief description" />
        </label>
        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={form.is_restricted} onChange={e => setForm(p => ({...p, is_restricted: e.target.checked, restricted_area_id: e.target.checked ? p.restricted_area_id : null}))}
            className="rounded" />
          <span className="text-xs font-semibold text-gray-600">Restricted department (requires badge access)</span>
        </label>
        {form.is_restricted && (
          <label className="block text-xs font-semibold text-gray-600 mt-2">
            Link to Restricted Area
            <select value={form.restricted_area_id || ""} onChange={e => setForm(p => ({...p, restricted_area_id: e.target.value || null}))}
              className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
              <option value="">Select an area...</option>
              {restrictedAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-xs font-semibold text-gray-600 mt-2">
          Room (Post) — guards of this department are posted in this room
          <select value={form.post_id || ""} onChange={e => setForm(p => ({...p, post_id: e.target.value || null}))}
            className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
            <option value="">No room yet (one department = one room)</option>
            {posts.map(p => (
              <option key={p.id} value={p.id}>{roomLabel({ name: p.name, room_number: p.room_number })}</option>
            ))}
          </select>
        </label>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!showEdit} title={`Edit: ${showEdit?.name || ""}`} onClose={() => setShowEdit(null)}
        footer={<>
          <Btn variant="ghost" onClick={() => setShowEdit(null)}>Cancel</Btn>
          <Btn onClick={handleUpdate} disabled={saving || !form.name}>{saving ? "Saving..." : "Save Changes"}</Btn>
        </>}>
        <Input label="Department Name" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required />
        <label className="block text-xs font-semibold text-gray-600">
          Description
          <input type="text" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))}
            className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none" />
        </label>
        <label className="flex items-center gap-2 mt-2">
          <input type="checkbox" checked={form.is_restricted} onChange={e => setForm(p => ({...p, is_restricted: e.target.checked, restricted_area_id: e.target.checked ? p.restricted_area_id : null}))}
            className="rounded" />
          <span className="text-xs font-semibold text-gray-600">Restricted department</span>
        </label>
        {form.is_restricted && (
          <label className="block text-xs font-semibold text-gray-600 mt-2">
            Link to Restricted Area
            <select value={form.restricted_area_id || ""} onChange={e => setForm(p => ({...p, restricted_area_id: e.target.value || null}))}
              className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
              <option value="">Select an area...</option>
              {restrictedAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-xs font-semibold text-gray-600 mt-2">
          Room (Post) — guards of this department are posted in this room
          <select value={form.post_id || ""} onChange={e => setForm(p => ({...p, post_id: e.target.value || null}))}
            className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
            <option value="">No room linked (one department = one room)</option>
            {posts.map(p => (
              <option key={p.id} value={p.id}>{roomLabel({ name: p.name, room_number: p.room_number })}</option>
            ))}
          </select>
        </label>
      </Dialog>
    </div>
  );
}

// ─── 2D FLOOR PLAN ──────────────────────────────────────────────

// ─── FLOOR PLAN EDITOR ───────────────────────────────────────
const OBJ_TYPES = [
  { type: "room", label: "Room", icon: "⬛", color: "#E2E8F0", stroke: "#94A3B8" },
  { type: "hallway", label: "Hallway", icon: "═", color: "#F8FAFC", stroke: "#CBD5E1" },
  { type: "door", label: "Door", icon: "🚪", color: "#FEF3C7", stroke: "#FCD34D", w: 40, h: 20 },
  { type: "entrance", label: "Entrance", icon: "⬇", color: "#DBEAFE", stroke: "#93C5FD", w: 80, h: 40 },
  { type: "exit", label: "Exit", icon: "⬆", color: "#FEE2E2", stroke: "#FCA5A5", w: 80, h: 40 },
  { type: "stairs", label: "Stairs", icon: "🔼", color: "#EDE9FE", stroke: "#C4B5FD", w: 60, h: 60 },
  { type: "elevator", label: "Elevator", icon: "🔼", color: "#E0F2FE", stroke: "#7DD3FC", w: 50, h: 50 },
  { type: "restroom", label: "Restroom", icon: "🚻", color: "#FDF2F8", stroke: "#FBCFE8", w: 70, h: 60 },
  { type: "security_checkpoint", label: "Security", icon: "🛡", color: "#FFF7ED", stroke: "#FDBA74", w: 80, h: 60 },
  { type: "restricted_area", label: "Restricted", icon: "🔒", color: "#FEF2F2", stroke: "#FCA5A5", w: 120, h: 100 },
  { type: "text_label", label: "Text", icon: "T", color: "transparent", stroke: "transparent", w: 150, h: 30 },
  { type: "emergency_exit", label: "Emergency", icon: "🚨", color: "#FEF2F2", stroke: "#EF4444", w: 60, h: 40 },
];
const ACCESS_LEVELS = ["Public", "Employee Only", "Restricted", "Highly Restricted"];
const VISITOR_ACCESS = ["Allowed", "Not Allowed", "Requires Approval", "Escort Required"];

function _defaultProps(type) {
  const t = OBJ_TYPES.find(o => o.type === type);
  return { room_number: "", department: "", capacity: "", description: "", access_level: "Public", visitor_access: "Allowed", door_id: "", text: "", font_size: 14, color: t?.color || "#E2E8F0" };
}
function _uid() { return "fp_" + Math.random().toString(36).slice(2, 10); }
function _snap(v, g, on) { return on ? Math.round(v / g) * g : v; }

function FloorPlanEditor({ apiMode = false, user }) {
  const isAdmin = ["Administrator","Super Admin"].includes(user.role);
  const svgRef = useRef(null);
  const containerRef = useRef(null);

  const [floors, setFloors] = useState([]);
  const [activeFloorId, setActiveFloorId] = useState(null);
  const [objects, setObjects] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [activeTool, setActiveTool] = useState("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(true);
  const [snapOn, setSnapOn] = useState(true);
  const [gridSize] = useState(20);
  const [dragState, setDragState] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [posts, setPosts] = useState([]);
  const [restrictedAreas, setRestrictedAreas] = useState([]);
  const [roomDetail, setRoomDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  const pushHistory = useCallback((objs) => {
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIdx + 1);
      return [...trimmed, JSON.parse(JSON.stringify(objs))];
    });
    setHistoryIdx(prev => prev + 1);
  }, [historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prev = history[historyIdx - 1];
    setObjects(prev);
    setHistoryIdx(historyIdx - 1);
    setSelectedIds(new Set());
  }, [history, historyIdx]);

  const redo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const next = history[historyIdx + 1];
    setObjects(next);
    setHistoryIdx(historyIdx + 1);
    setSelectedIds(new Set());
  }, [history, historyIdx]);

  const activeFloor = floors.find(f => f.id === activeFloorId);

  function loadFloors() {
    if (!apiMode) { setLoaded(true); return; }
    getFloors()
      .then(r => {
        setFloors(r.data);
        if (r.data.length > 0) {
          const fid = r.data[0].id;
          setActiveFloorId(fid);
          loadObjects(fid);
        } else { setLoaded(true); }
      })
      .catch(() => { setError("Failed to load floors."); setLoaded(true); });
  }

  function loadObjects(floorId) {
    setLoaded(false);
    setSelectedIds(new Set());
    getFloorObjects(floorId)
      .then(r => {
        const objs = r.data.map(o => ({ ...o, properties: o.properties || {} }));
        setObjects(objs);
        setHistory([JSON.parse(JSON.stringify(objs))]);
        setHistoryIdx(0);
      })
      .catch(() => setError("Failed to load objects."))
      .finally(() => setLoaded(true));
  }

  useEffect(() => { loadFloors(); }, [apiMode]);
  useEffect(() => { if (activeFloorId) loadObjects(activeFloorId); }, [activeFloorId]);

  // Load posts for linkage dropdown
useEffect(() => {
    if (!apiMode) return;
    getRestrictedAreas().then(r => setRestrictedAreas(r.data || [])).catch(() => {});
    getPosts().then(r => setPosts(r.data || [])).catch(() => {});
  }, [apiMode]);

  // Load restricted areas for linkage dropdown
  useEffect(() => {
    if (!apiMode) return;
    getRestrictedAreas().then(r => setRestrictedAreas(r.data || [])).catch(() => {});
  }, [apiMode]);

  const selectedObj = selectedIds.size === 1 ? objects.find(o => selectedIds.has(o.id)) : null;

  // Fetch room detail when a linked room is selected
  useEffect(() => {
    if (!selectedObj || selectedObj.object_type !== "room" || !selectedObj.properties?.post_id || !apiMode) {
      setRoomDetail(null);
      return;
    }
    setLoadingDetail(true);
    getPostDetail(selectedObj.properties.post_id)
      .then(r => setRoomDetail(r.data))
      .catch(() => setRoomDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [selectedIds.size, selectedObj?.id, selectedObj?.properties?.post_id, apiMode]);

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); redo(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) {
          e.preventDefault();
          deleteSelected();
        }
      }
      if (e.key === "Escape") { setSelectedIds(new Set()); setActiveTool("select"); setContextMenu(null); }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        duplicateSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelectedIds(new Set(objects.map(o => o.id)));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, objects, undo, redo]);

  function svgPoint(e) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom - pan.x;
    const y = (e.clientY - rect.top) / zoom - pan.y;
    return { x, y };
  }

  function handleCanvasMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setDragState({ type: "pan", startX: e.clientX, startY: e.clientY, origPan: { ...pan } });
      return;
    }
    if (contextMenu) { setContextMenu(null); return; }
    if (e.button !== 0) return;
    const pt = svgPoint(e);
    if (activeTool !== "select") {
      const cfg = OBJ_TYPES.find(o => o.type === activeTool);
      const w = cfg?.w || 160;
      const h = cfg?.h || 120;
      const newObj = {
        id: _uid(), floor_id: activeFloorId, object_type: activeTool,
        x: _snap(pt.x - w / 2, gridSize, snapOn), y: _snap(pt.y - h / 2, gridSize, snapOn),
        width: w, height: h, rotation: 0, name: cfg?.label || "Object",
        properties: _defaultProps(activeTool), z_index: objects.length,
      };
      setObjects(prev => [...prev, newObj]);
      pushHistory([...objects, newObj]);
      setSelectedIds(new Set([newObj.id]));
      setActiveTool("select");
      return;
    }
    const hit = [...objects].reverse().find(o => pt.x >= o.x && pt.x <= o.x + o.width && pt.y >= o.y && pt.y <= o.y + o.height);
    if (hit) {
      if (e.ctrlKey || e.metaKey) {
        setSelectedIds(prev => {
          const next = new Set(prev);
          if (next.has(hit.id)) next.delete(hit.id); else next.add(hit.id);
          return next;
        });
      } else {
        if (!selectedIds.has(hit.id)) setSelectedIds(new Set([hit.id]));
        setDragState({ type: "move", startX: pt.x, startY: pt.y, objects: objects.map(o => ({ id: o.id, x: o.x, y: o.y })) });
      }
    } else {
      setSelectedIds(new Set());
    }
  }

  function handleCanvasMouseMove(e) {
    if (!dragState) return;
    if (dragState.type === "pan") {
      const dx = (e.clientX - dragState.startX) / zoom;
      const dy = (e.clientY - dragState.startY) / zoom;
      setPan({ x: dragState.origPan.x + dx, y: dragState.origPan.y + dy });
      return;
    }
    if (dragState.type === "move") {
      const pt = svgPoint(e);
      const dx = pt.x - dragState.startX;
      const dy = pt.y - dragState.startY;
      setObjects(prev => prev.map(o => {
        if (!selectedIds.has(o.id)) return o;
        const orig = dragState.objects.find(d => d.id === o.id);
        if (!orig) return o;
        return { ...o, x: _snap(orig.x + dx, gridSize, snapOn), y: _snap(orig.y + dy, gridSize, snapOn) };
      }));
    }
    if (dragState.type === "resize") {
      const pt = svgPoint(e);
      const obj = objects.find(o => o.id === dragState.objectId);
      if (!obj) return;
      const orig = dragState.orig;
      let newX = orig.x, newY = orig.y, newW = orig.width, newH = orig.height;
      const h = dragState.handle;
      if (h.includes("e")) { newW = Math.max(40, pt.x - orig.x); }
      if (h.includes("w")) { newW = Math.max(40, orig.x + orig.width - pt.x); newX = pt.x; }
      if (h.includes("s")) { newH = Math.max(30, pt.y - orig.y); }
      if (h.includes("n")) { newH = Math.max(30, orig.y + orig.height - pt.y); newY = pt.y; }
      newW = _snap(newW, gridSize, snapOn);
      newH = _snap(newH, gridSize, snapOn);
      newX = _snap(newX, gridSize, snapOn);
      newY = _snap(newY, gridSize, snapOn);
      setObjects(prev => prev.map(o => o.id === dragState.objectId ? { ...o, x: newX, y: newY, width: newW, height: newH } : o));
    }
  }

  function handleCanvasMouseUp() {
    if (dragState && (dragState.type === "move" || dragState.type === "resize")) {
      pushHistory(objects);
    }
    setDragState(null);
  }

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prev => Math.max(0.2, Math.min(3, prev + delta)));
  }

  function deleteSelected() {
    const next = objects.filter(o => !selectedIds.has(o.id));
    setObjects(next);
    pushHistory(next);
    setSelectedIds(new Set());
  }

  function duplicateSelected() {
    const newObjs = objects.filter(o => selectedIds.has(o.id)).map(o => ({
      ...JSON.parse(JSON.stringify(o)), id: _uid(), x: o.x + 30, y: o.y + 30,
      name: o.name + " (copy)", z_index: objects.length,
    }));
    const next = [...objects, ...newObjs];
    setObjects(next);
    pushHistory(next);
    setSelectedIds(new Set(newObjs.map(o => o.id)));
  }

  function bringForward() {
    const maxZ = Math.max(0, ...objects.map(o => o.z_index));
    const next = objects.map(o => selectedIds.has(o.id) ? { ...o, z_index: maxZ + 1 } : o);
    setObjects(next); pushHistory(next);
  }

  function sendBackward() {
    const minZ = Math.min(0, ...objects.map(o => o.z_index));
    const next = objects.map(o => selectedIds.has(o.id) ? { ...o, z_index: minZ - 1 } : o);
    setObjects(next); pushHistory(next);
  }

  function updateObjectProp(id, key, value) {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, [key]: value } : o));
  }

  function updateObjectProps(id, props) {
    setObjects(prev => prev.map(o => o.id === id ? { ...o, properties: { ...o.properties, ...props } } : o));
  }

  async function saveFloorPlan() {
    if (!activeFloorId) return;
    setSaving(true);
    let linkedCount = 0;
    let errors = [];
    try {
      let updated = [...objects];
      let changed = false;

      const links = [];
      for (let i = 0; i < updated.length; i++) {
        const o = updated[i];
        const accLvl = o.properties?.access_level;

        if (o.object_type === "room" && !o.properties?.post_id) {
          links.push(
            createPost({ name: o.name || "New Room", description: o.properties?.description || "" })
              .then(r => { if (r.data?.id) { updated[i] = { ...updated[i], properties: { ...updated[i].properties, post_id: r.data.id } }; changed = true; linkedCount++; } })
              .catch(e => errors.push("Room \"" + o.name + "\": " + (e?.response?.data?.detail || e.message)))
          );
        }

        const isRestrictedType = o.object_type === "restricted_area";
        const isRestrictedRoom = o.object_type === "room" && (accLvl === "Restricted" || accLvl === "Highly Restricted");
        if ((isRestrictedType || isRestrictedRoom) && !o.properties?.restricted_area_id) {
          links.push(
            createRestrictedArea({ name: o.name || "Restricted Area", description: o.properties?.description || "" })
              .then(r => { if (r.data?.id) { updated[i] = { ...updated[i], properties: { ...updated[i].properties, restricted_area_id: r.data.id } }; changed = true; linkedCount++; } })
              .catch(e => errors.push("Restricted area \"" + o.name + "\": " + (e?.response?.data?.detail || e.message)))
          );
        }
      }
      await Promise.all(links);

      if (changed) setObjects(updated);

      const toSave = (changed ? updated : objects).map(o => ({
        object_type: o.object_type, x: o.x, y: o.y, width: o.width, height: o.height,
        rotation: o.rotation || 0, name: o.name, properties: o.properties || {}, z_index: o.z_index,
      }));

      await bulkSaveFloorObjects(activeFloorId, { objects: toSave });

      if (changed) {
        const newPosts = await getPosts().catch(() => null);
        if (newPosts?.data) setPosts(newPosts.data);
        const newAreas = await getRestrictedAreas().catch(() => null);
        if (newAreas?.data) setRestrictedAreas(newAreas.data);
      }
      if (errors.length > 0) {
        setError("Saved but: " + errors.join("; "));
      } else if (linkedCount > 0) {
        setError("Saved & linked " + linkedCount + " object(s) to VMS.");
      } else {
        setError("Floor plan saved.");
      }
    } catch (e) { setError("Save failed: " + (e?.response?.data?.detail || e.message || "Unknown error")); }
    finally { setSaving(false); }
  }

  async function handleAddFloor() {
    // Re-sync from the backend first — the local `floors` state can be stale
    // (another session/tab added or deleted floors), which would otherwise
    // collide with a floor_number that already exists in the DB and surface
    // as a confusing "floor already exists" error.
    let list = floors;
    try {
      const fresh = await getFloors();
      if (fresh.data && fresh.data.length > 0) {
        list = fresh.data;
        setFloors(list);
      }
    } catch (e) { /* fall back to stale local list */ }

    let num = list.length > 0 ? Math.max(...list.map(f => f.floor_number)) + 1 : 1;
    let r = null;
    // If a number is taken after all (race/leftover row), just take the next free one.
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        r = await createFloor({ name: `Floor ${num}`, floor_number: num });
        break;
      } catch (e) {
        if (e?.response?.status === 409) { num++; continue; }
        throw e;
      }
    }
    if (!r) { setError("Failed to create floor: no free floor number."); return; }
    setFloors(prev => [...prev, r.data]);
    setActiveFloorId(r.data.id);
  }

  async function handleRenameFloor(floorId, newName) {
    try {
      await updateFloor(floorId, { name: newName });
      setFloors(prev => prev.map(f => f.id === floorId ? { ...f, name: newName } : f));
    } catch (e) { setError("Rename failed."); }
  }

  async function handleDeleteFloor(floorId) {
    if (!confirm("Delete this floor and all its objects?")) return;
    try {
      await deleteFloor(floorId);
      const remaining = floors.filter(f => f.id !== floorId);
      setFloors(remaining);
      if (remaining.length > 0) setActiveFloorId(remaining[0].id);
      else setActiveFloorId(null);
    } catch (e) { setError("Delete failed."); }
  }

  const CANVAS_BG = "#FAFBFC";
  const linkedRestrictedArea = selectedObj?.object_type === "restricted_area" && selectedObj?.properties?.restricted_area_id
    ? restrictedAreas.find(a => a.id === selectedObj.properties.restricted_area_id) || null
    : null;

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] select-none" ref={containerRef}>
      {/* ── Top Toolbar ────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-200 flex-wrap">
        <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
          <button onClick={undo} disabled={historyIdx <= 0} title="Undo (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-sm">↩</button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} title="Redo (Ctrl+Y)"
            className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 text-sm">↪</button>
        </div>
        <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
          <button onClick={() => setActiveTool("select")} title="Select (V)"
            className={cls("px-2 py-1 rounded text-xs font-medium", activeTool === "select" ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100")}>↖ Select</button>
        </div>
        <div className="flex items-center gap-1 border-r border-gray-200 pr-3 mr-1">
          <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1 rounded hover:bg-gray-100 text-sm">−</button>
          <span className="text-xs text-gray-500 w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1 rounded hover:bg-gray-100 text-sm">+</button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="px-2 py-1 rounded text-xs hover:bg-gray-100">Fit</button>
        </div>
        <div className="flex items-center gap-2 border-r border-gray-200 pr-3 mr-1">
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} className="w-3 h-3" /> Grid
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} className="w-3 h-3" /> Snap
          </label>
        </div>
        <div className="flex-1" />
        {isAdmin && (
          <button onClick={saveFloorPlan} disabled={saving || !activeFloorId}
            className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving..." : "💾 Save Floor Plan"}
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Toolbar (hidden on mobile) ────────────── */}
        {isAdmin && (
          <div className="hidden md:flex w-[52px] bg-gray-900 flex-col items-center py-2 gap-1 overflow-y-auto shrink-0">
            {OBJ_TYPES.map(t => (
              <button key={t.type} onClick={() => setActiveTool(activeTool === t.type ? "select" : t.type)}
                title={t.label}
                className={cls("w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[10px] leading-tight transition-colors",
                  activeTool === t.type ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                <span className="text-sm">{t.icon}</span>
                <span className="truncate w-full text-center">{t.label.slice(0, 6)}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Mobile tool picker (bottom bar on mobile) ──── */}
        {isAdmin && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 flex items-center justify-center gap-1 px-2 py-2 overflow-x-auto safe-area-bottom">
            {OBJ_TYPES.map(t => (
              <button key={t.type} onClick={() => setActiveTool(activeTool === t.type ? "select" : t.type)}
                title={t.label}
                className={cls("w-10 h-10 rounded-lg flex flex-col items-center justify-center text-[10px] leading-tight shrink-0 transition-colors",
                  activeTool === t.type ? "bg-blue-600 text-white" : "text-gray-400 hover:bg-gray-700 hover:text-white")}>
                <span className="text-sm">{t.icon}</span>
                <span className="truncate w-full text-center">{t.label.slice(0, 6)}</span>
              </button>
            ))}
          </div>
        )}

        {/* ── Floor Tabs ───────────────────────────────────── */}
        <div className="w-full flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 border-b border-gray-200 overflow-x-auto">
            {floors.map(f => (
              <div key={f.id} className="flex items-center">
                <button onClick={() => setActiveFloorId(f.id)}
                  onDoubleClick={() => { const n = prompt("Rename floor:", f.name); if (n) handleRenameFloor(f.id, n); }}
                  className={cls("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
                    activeFloorId === f.id ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100")}>
                  {f.name}
                </button>
                {isAdmin && activeFloorId === f.id && floors.length > 1 && (
                  <button onClick={() => handleDeleteFloor(f.id)} className="text-gray-400 hover:text-red-500 text-xs ml-1" title="Delete floor">✕</button>
                )}
              </div>
            ))}
            {isAdmin && (
              <button onClick={handleAddFloor} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-dashed border-gray-300 text-gray-400 hover:border-blue-400 hover:text-blue-500">
                + Add Floor
              </button>
            )}
          </div>

          {/* ── Canvas ──────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden relative" style={{ background: CANVAS_BG }}
            onWheel={handleWheel}>
            {error && <div className="absolute top-2 left-2 z-50 bg-red-50 text-red-600 text-xs px-3 py-1 rounded-lg border border-red-200">{error}
              <button onClick={() => setError("")} className="ml-2 font-bold">✕</button>
            </div>}

            {!activeFloorId && loaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-400 text-lg mb-3">No floors yet</p>
                  {isAdmin && <button onClick={handleAddFloor} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">+ Add First Floor</button>}
                </div>
              </div>
            )}

            {activeFloorId && (
              <svg ref={svgRef} width="100%" height="100%"
                className={cls("cursor-crosshair", activeTool === "select" && "cursor-default", (dragState?.type === "pan") && "cursor-grabbing")}
                onMouseDown={handleCanvasMouseDown} onMouseMove={handleCanvasMouseMove} onMouseUp={handleCanvasMouseUp} onMouseLeave={handleCanvasMouseUp}
                onContextMenu={e => {
                  e.preventDefault();
                  if (!isAdmin) return;
                  const pt = svgPoint(e);
                  const hit = [...objects].reverse().find(o => pt.x >= o.x && pt.x <= o.x + o.width && pt.y >= o.y && pt.y <= o.y + o.height);
                  if (hit && !selectedIds.has(hit.id)) setSelectedIds(new Set([hit.id]));
                  setContextMenu({ x: e.clientX, y: e.clientY, hitObj: !!hit });
                }}>
                <g transform={`scale(${zoom}) translate(${pan.x}, ${pan.y})`}>
                  {/* Grid */}
                  {showGrid && (
                    <defs>
                      <pattern id="grid" width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                        <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                  )}
                  {showGrid && <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" />}

                  {/* Objects sorted by z_index */}
                  {[...objects].sort((a, b) => a.z_index - b.z_index).map(obj => {
                    const isSel = selectedIds.has(obj.id);
                    return (
                      <g key={obj.id}
                        onMouseDown={e => {
                          if (!isAdmin) return;
                          e.stopPropagation();
                          const pt = svgPoint(e);
                          if (!isSel && !e.ctrlKey) setSelectedIds(new Set([obj.id]));
                          setDragState({ type: "move", startX: pt.x, startY: pt.y, objects: objects.map(o => ({ id: o.id, x: o.x, y: o.y })) });
                        }}>
                        <rect x={obj.x} y={obj.y} width={obj.width} height={obj.height}
                          rx={obj.object_type === "room" ? 6 : obj.object_type === "hallway" ? 2 : 4}
                          fill={obj.properties?.color || OBJ_TYPES.find(t => t.type === obj.object_type)?.color || "#E2E8F0"}
                          stroke={isSel ? "#2563EB" : (OBJ_TYPES.find(t => t.type === obj.object_type)?.stroke || "#94A3B8")}
                          strokeWidth={isSel ? 2.5 : 1.5}
                          className="transition-all duration-75" />

                        {/* Object type icon */}
                        {obj.object_type !== "text_label" && obj.object_type !== "hallway" && (
                          <text x={obj.x + 10} y={obj.y + 16} fontSize="12" fill={isSel ? "#2563EB" : "#64748B"} className="pointer-events-none">
                            {OBJ_TYPES.find(t => t.type === obj.object_type)?.icon || ""}
                          </text>
                        )}

                        {/* Name */}
                        <text x={obj.x + obj.width / 2} y={obj.y + (obj.object_type === "text_label" ? obj.height / 2 + 4 : obj.height / 2 + (obj.properties?.room_number ? - 2 : 4))}
                          textAnchor="middle" fontSize={obj.object_type === "text_label" ? (obj.properties?.font_size || 14) : 11}
                          fontWeight={obj.object_type === "text_label" ? "400" : "700"}
                          fill={isSel ? "#1E40AF" : "#1E293B"} className="pointer-events-none">
                          {obj.object_type === "text_label" ? (obj.properties?.text || "Text") : (obj.name || "Untitled")}
                        </text>

                        {/* Room number */}
                        {obj.object_type === "room" && obj.properties?.room_number && (
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2 + 12} textAnchor="middle" fontSize="9" fill="#64748B" className="pointer-events-none">
                            {obj.properties.room_number}
                          </text>
                        )}

                        {/* Access level indicator */}
                        {obj.object_type === "room" && obj.properties?.access_level && obj.properties.access_level !== "Public" && (
                          <text x={obj.x + obj.width - 8} y={obj.y + 14} textAnchor="middle" fontSize="10" className="pointer-events-none">
                            {obj.properties.access_level === "Highly Restricted" ? "🔴" : obj.properties.access_level === "Restricted" ? "🔒" : "👤"}
                          </text>
                        )}

                        {/* Hallway dashed center line */}
                        {obj.object_type === "hallway" && (
                          <line x1={obj.x + 5} y1={obj.y + obj.height / 2} x2={obj.x + obj.width - 5} y2={obj.y + obj.height / 2}
                            stroke="#CBD5E1" strokeWidth="1" strokeDasharray="6 4" className="pointer-events-none" />
                        )}

                        {/* Door symbol */}
                        {obj.object_type === "door" && (
                          <line x1={obj.x + 5} y1={obj.y + obj.height} x2={obj.x + obj.width - 5} y2={obj.y}
                            stroke="#F59E0B" strokeWidth="2" className="pointer-events-none" />
                        )}

                        {/* Entrance arrow */}
                        {obj.object_type === "entrance" && (
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2 + 5} textAnchor="middle" fontSize="16" fill="#3B82F6" className="pointer-events-none">⬇</text>
                        )}

                        {/* Exit arrow */}
                        {obj.object_type === "exit" && (
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2 + 5} textAnchor="middle" fontSize="16" fill="#EF4444" className="pointer-events-none">⬆</text>
                        )}

                        {/* Stairs pattern */}
                        {obj.object_type === "stairs" && (
                          <g className="pointer-events-none">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <line key={i} x1={obj.x + 10 + i * 10} y1={obj.y + 8} x2={obj.x + 10 + i * 10} y2={obj.y + obj.height - 8}
                                stroke="#C4B5FD" strokeWidth="1.5" />
                            ))}
                          </g>
                        )}

                        {/* Elevator */}
                        {obj.object_type === "elevator" && (
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2 + 5} textAnchor="middle" fontSize="18" fill="#0EA5E9" className="pointer-events-none">🔼</text>
                        )}

                        {/* Restroom */}
                        {obj.object_type === "restroom" && (
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2 + 5} textAnchor="middle" fontSize="18" className="pointer-events-none">🚻</text>
                        )}

                        {/* Security checkpoint */}
                        {obj.object_type === "security_checkpoint" && (
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2 + 5} textAnchor="middle" fontSize="18" className="pointer-events-none">🛡</text>
                        )}

                        {/* Restricted area */}
                        {obj.object_type === "restricted_area" && (
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2 + 5} textAnchor="middle" fontSize="18" className="pointer-events-none">🔒</text>
                        )}

                        {/* Emergency exit */}
                        {obj.object_type === "emergency_exit" && (
                          <text x={obj.x + obj.width / 2} y={obj.y + obj.height / 2 + 5} textAnchor="middle" fontSize="16" fill="#EF4444" className="pointer-events-none">🚨</text>
                        )}

                        {/* Resize handles (admin only) */}
                        {isSel && isAdmin && ["nw", "ne", "se", "sw", "n", "e", "s", "w"].map(h => {
                          const hx = h.includes("e") ? obj.x + obj.width : h.includes("w") ? obj.x : obj.x + obj.width / 2;
                          const hy = h.includes("s") ? obj.y + obj.height : h.includes("n") ? obj.y : obj.y + obj.height / 2;
                          const cursors = { nw: "nw-resize", ne: "ne-resize", se: "se-resize", sw: "sw-resize", n: "n-resize", e: "e-resize", s: "s-resize", w: "w-resize" };
                          return (
                            <rect key={h} x={hx - 4} y={hy - 4} width="8" height="8" rx="1"
                              fill="#2563EB" stroke="#fff" strokeWidth="1" style={{ cursor: cursors[h] }}
                              onMouseDown={e => {
                                e.stopPropagation();
                                setDragState({ type: "resize", objectId: obj.id, handle: h, orig: { x: obj.x, y: obj.y, width: obj.width, height: obj.height } });
                              }} />
                          );
                        })}
                      </g>
                    );
                  })}

                  {objects.length === 0 && loaded && (
                    <text x="500" y="300" textAnchor="middle" fill="#94A3B8" fontSize="16">
                      {isAdmin ? "Click a tool on the left, then drag on the canvas to place objects" : "No floor plan objects on this floor"}
                    </text>
                  )}
                </g>
              </svg>
            )}

            {/* Context Menu */}
            {contextMenu && isAdmin && (
              <div className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                onMouseLeave={() => setContextMenu(null)}>
                {contextMenu.hitObj ? (
                  <>
                    <button onClick={() => { duplicateSelected(); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">📋 Duplicate</button>
                    <button onClick={() => { bringForward(); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">⬆ Bring Forward</button>
                    <button onClick={() => { sendBackward(); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">⬇ Send Backward</button>
                    <hr className="my-1 border-gray-100" />
                    <button onClick={() => { deleteSelected(); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">🗑 Delete</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setActiveTool("room"); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">⬛ Add Room</button>
                    <button onClick={() => { setActiveTool("hallway"); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">═ Add Hallway</button>
                    <button onClick={() => { setActiveTool("door"); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">🚪 Add Door</button>
                    <button onClick={() => { setActiveTool("entrance"); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">⬇ Add Entrance</button>
                    <button onClick={() => { setActiveTool("exit"); setContextMenu(null); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">⬆ Add Exit</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {/* ── Right Properties Panel ───────────────────────── */}
        {selectedObj && (
          <>
            {/* Desktop: fixed sidebar */}
            <div className="hidden md:block w-[300px] bg-white border-l border-gray-200 overflow-y-auto shrink-0">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-sm text-gray-900">{isAdmin ? "Properties" : "Room Info"}</h3>
                  <button onClick={() => setSelectedIds(new Set())} className="text-gray-400 hover:text-gray-600 text-sm">X</button>
                </div>
                <div className="flex flex-col gap-3">
                  {isAdmin && (
                    <>
                      <Input label="Name" value={selectedObj.name} onChange={e => updateObjectProp(selectedObj.id, "name", e.target.value)} />
                      {selectedObj.object_type === "room" && (
                        <>
                          <Input label="Room Number" value={selectedObj.properties?.room_number || ""} onChange={e => updateObjectProps(selectedObj.id, { room_number: e.target.value })} placeholder="e.g. F-201" />
                          <Input label="Department" value={selectedObj.properties?.department || ""} onChange={e => updateObjectProps(selectedObj.id, { department: e.target.value })} placeholder="e.g. Finance" />
                          <Input label="Capacity" type="number" value={selectedObj.properties?.capacity || ""} onChange={e => updateObjectProps(selectedObj.id, { capacity: e.target.value })} placeholder="Max occupants" />
                          <div className="block text-xs font-semibold text-gray-600">
                            <span>Access Level</span>
                            <select value={selectedObj.properties?.access_level || "Public"}
                              onChange={e => updateObjectProps(selectedObj.id, { access_level: e.target.value })}
                              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                              {ACCESS_LEVELS.map(l => <option key={l}>{l}</option>)}
                            </select>
                          </div>
                          <div className="block text-xs font-semibold text-gray-600">
                            <span>Visitor Access</span>
                            <select value={selectedObj.properties?.visitor_access || "Allowed"}
                              onChange={e => updateObjectProps(selectedObj.id, { visitor_access: e.target.value })}
                              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                              {VISITOR_ACCESS.map(l => <option key={l}>{l}</option>)}
                            </select>
                          </div>
                          <div className="bg-gray-50 rounded-lg px-3 py-2 text-[11px] text-gray-500">
                            <span className="font-semibold">Security method:</span>{" "}
                            {selectedObj.properties?.access_level === "Highly Restricted"
                              ? "Badge + Secondary ID + Photo"
                              : selectedObj.properties?.access_level === "Restricted"
                              ? "Badge + Secondary ID"
                              : "Badge scan only"}
                          </div>
                          <div className="block text-xs font-semibold text-gray-600">
                            <span>Link to Post (VMS Room)</span>
                            <select value={selectedObj.properties?.post_id || ""}
                              onChange={e => updateObjectProps(selectedObj.id, { post_id: e.target.value || null })}
                              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
<option value="">-- None --</option>
                              {posts.map(p => <option key={p.id} value={p.id}>{roomLabel(p)}</option>)}
                            </select>
                          </div>
                        <Input label="Description" value={selectedObj.properties?.description || ""} onChange={e => updateObjectProps(selectedObj.id, { description: e.target.value })} placeholder="Optional notes" />
                      </>
                    )}
                    {selectedObj.object_type === "restricted_area" && (
                      <>
                        <div className="block text-xs font-semibold text-gray-600">
                          <span>Link to Restricted Area</span>
                          <select value={selectedObj.properties?.restricted_area_id || ""}
                            onChange={e => updateObjectProps(selectedObj.id, { restricted_area_id: e.target.value || null })}
                            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                            <option value="">-- None --</option>
                            {restrictedAreas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                        {!selectedObj.properties?.restricted_area_id && (
                          <button onClick={async () => {
                            const name = selectedObj.name || "Restricted Area";
                            try {
                              const r = await createRestrictedArea({ name, description: selectedObj.properties?.description || "" });
                              if (r.data?.id) {
                                updateObjectProps(selectedObj.id, { restricted_area_id: r.data.id });
                                setRestrictedAreas(prev => [...prev, r.data]);
                              }
                            } catch (e) { setError("Failed to create restricted area."); }
                          }} className="w-full px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors">
                            + Create & Link Restricted Area
                          </button>
                        )}
                        <Input label="Description" value={selectedObj.properties?.description || ""} onChange={e => updateObjectProps(selectedObj.id, { description: e.target.value })} placeholder="Optional notes" />
                      </>
                    )}
                    {selectedObj.object_type === "text_label" && (
                      <>
                        <Input label="Text" value={selectedObj.properties?.text || ""} onChange={e => updateObjectProps(selectedObj.id, { text: e.target.value })} placeholder="Label text" />
                        <div className="block text-xs font-semibold text-gray-600">
                          <span>Font Size</span>
                          <input type="range" min="8" max="48" value={selectedObj.properties?.font_size || 14}
                            onChange={e => updateObjectProps(selectedObj.id, "font_size", Number(e.target.value))}
                            className="mt-1 w-full" />
                          <span className="text-gray-400">{selectedObj.properties?.font_size || 14}px</span>
                        </div>
                      </>
                    )}
                      <hr className="border-gray-100" />
                      <p className="text-[11px] text-gray-400 uppercase tracking-wider font-bold">Position & Size</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="block text-xs font-semibold text-gray-600">
                          <span>X</span>
                          <input type="number" value={Math.round(selectedObj.x)}
                            onChange={e => updateObjectProp(selectedObj.id, "x", Number(e.target.value))}
                            className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                        </div>
                        <div className="block text-xs font-semibold text-gray-600">
                          <span>Y</span>
                          <input type="number" value={Math.round(selectedObj.y)}
                            onChange={e => updateObjectProp(selectedObj.id, "y", Number(e.target.value))}
                            className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                        </div>
                        <div className="block text-xs font-semibold text-gray-600">
                          <span>Width</span>
                          <input type="number" value={Math.round(selectedObj.width)}
                            onChange={e => updateObjectProp(selectedObj.id, "width", Math.max(20, Number(e.target.value)))}
                            className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                        </div>
                        <div className="block text-xs font-semibold text-gray-600">
                          <span>Height</span>
                          <input type="number" value={Math.round(selectedObj.height)}
                            onChange={e => updateObjectProp(selectedObj.id, "height", Math.max(20, Number(e.target.value)))}
                            className="mt-1 w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                        </div>
                      </div>
                      <hr className="border-gray-100" />
                      <div className="flex gap-2">
                        <button onClick={duplicateSelected} className="flex-1 px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-medium hover:bg-gray-200">Duplicate</button>
                        <button onClick={deleteSelected} className="flex-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100">Delete</button>
                      </div>
                    </>
                  )}
                  {!isAdmin && selectedObj.object_type === "room" && (
                    <>
                      <InfoRow label="Name" value={selectedObj.name} />
                      {selectedObj.properties?.room_number && <InfoRow label="Room #" value={selectedObj.properties.room_number} />}
                      {selectedObj.properties?.department && <InfoRow label="Department" value={selectedObj.properties.department} />}
                      {selectedObj.properties?.capacity && <InfoRow label="Capacity" value={selectedObj.properties.capacity} />}
                      <InfoRow label="Access Level" value={selectedObj.properties?.access_level || "Public"} />
                      <InfoRow label="Visitor Access" value={selectedObj.properties?.visitor_access || "Allowed"} />
                      <InfoRow label="Security" value={
                        selectedObj.properties?.access_level === "Highly Restricted" ? "Badge + ID + Photo"
                        : selectedObj.properties?.access_level === "Restricted" ? "Badge + ID"
                        : "Badge scan only"
                      } />
                    </>
                  )}
                  {!isAdmin && selectedObj.object_type === "restricted_area" && (
                    <>
                      <InfoRow label="Name" value={selectedObj.name} />
                      {selectedObj.properties?.restricted_area_id ? (
                        <div className="flex items-center gap-2 py-1 px-2 bg-red-50 rounded-lg">
                          <span className="text-sm">🔒</span>
                          <span className="text-xs font-semibold text-red-700">Linked to restricted area</span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Not linked to a restricted area</p>
                      )}
                    </>
                  )}
                  {!isAdmin && selectedObj.object_type === "text_label" && (
                    <>
                      <InfoRow label="Text" value={selectedObj.properties?.text || "\u2014"} />
                      <InfoRow label="Font Size" value={`${selectedObj.properties?.font_size || 14}px`} />
                    </>
                  )}
                  {selectedObj.object_type === "room" && selectedObj.properties?.post_id && (
                    <>
                      <hr className="border-gray-100" />
                      <p className="text-[11px] text-gray-400 uppercase tracking-wider font-bold">VMS Details</p>
                      {loadingDetail ? (
                        <p className="text-xs text-gray-400 py-2">Loading room data...</p>
                      ) : roomDetail ? (
                        <>
                          <div>
                            <p className="text-[11px] text-gray-400 uppercase font-bold mb-1">Assigned Staff</p>
                            {roomDetail.assigned_staff?.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {roomDetail.assigned_staff.map(s => (
                                  <div key={s.id} className="flex items-center gap-2 py-1.5 px-2 bg-blue-50 rounded-lg">
                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                                      {(s.name || "").charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-gray-900 truncate">{s.name}</p>
                                      <p className="text-[10px] text-gray-400">{s.role}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic">No staff assigned</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 uppercase font-bold mb-1">Visitors Inside ({roomDetail.visitors_inside?.length || 0})</p>
                            {roomDetail.visitors_inside?.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {roomDetail.visitors_inside.map(v => (
                                  <div key={v.room_visit_id} className="flex items-center gap-2 py-1.5 px-2 bg-green-50 rounded-lg">
                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-gray-900 truncate">{v.visitor_name}</p>
                                      <p className="text-[10px] text-gray-400">Host: {v.host_name}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 italic">No visitors currently inside</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 uppercase font-bold mb-1">Last Scan at this Room</p>
                            {roomDetail.last_scan ? (
                              <p className="text-xs text-gray-700">
                                {roomDetail.last_scan.scanned_by_name || "Unknown guard"}
                                {" · "}{badgeDate(roomDetail.last_scan.arrived_at)}
                                {roomDetail.last_scan.departed_at && " (departed)"}
                              </p>
                            ) : (
                              <p className="text-xs font-semibold text-red-600">No scans recorded — an assigned guard has never scanned here</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No VMS data linked</p>
                      )}
                    </>
                  )}
                  {selectedObj.object_type === "room" && !selectedObj.properties?.post_id && (
                    <>
                      <hr className="border-gray-100" />
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-700">
                        Not linked to a VMS post. {isAdmin ? "Use the Link to Post dropdown above to connect." : "Ask an admin to link this room."}
                      </div>
                    </>
                  )}
                  {selectedObj.object_type === "restricted_area" && linkedRestrictedArea && (
                    <>
                      <hr className="border-gray-100" />
                      <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <p className="text-[11px] font-bold text-red-800">Restricted Area Info</p>
                        <p className="text-xs text-red-700">Name: {linkedRestrictedArea.name}</p>
                        {linkedRestrictedArea.description && <p className="text-xs text-red-600">Description: {linkedRestrictedArea.description}</p>}
                        <p className="text-[10px] text-red-500 mt-1">{linkedRestrictedArea.active_grants || 0} active grants · {linkedRestrictedArea.total_issued || 0} badges issued</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            {/* Mobile: bottom sheet */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-2xl max-h-[60vh] overflow-y-auto">
              <div className="p-4 pb-20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-1 bg-gray-300 rounded-full" />
                    <h3 className="font-bold text-sm text-gray-900">{isAdmin ? "Properties" : "Room Info"}</h3>
                  </div>
                  <button onClick={() => setSelectedIds(new Set())} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm">X</button>
                </div>
                <div className="flex flex-col gap-3">
                  <InfoRow label="Name" value={selectedObj.name} />
                  {selectedObj.object_type === "room" && (
                    <>
                      {selectedObj.properties?.room_number && <InfoRow label="Room #" value={selectedObj.properties.room_number} />}
                      {selectedObj.properties?.department && <InfoRow label="Department" value={selectedObj.properties.department} />}
                      {selectedObj.properties?.capacity && <InfoRow label="Capacity" value={selectedObj.properties.capacity} />}
                      <InfoRow label="Access Level" value={selectedObj.properties?.access_level || "Public"} />
                      <InfoRow label="Security" value={
                        selectedObj.properties?.access_level === "Highly Restricted" ? "Badge + ID + Photo"
                        : selectedObj.properties?.access_level === "Restricted" ? "Badge + ID"
                        : "Badge scan only"
                      } />
                    </>
                  )}
                  {selectedObj.object_type === "text_label" && (
                    <InfoRow label="Text" value={selectedObj.properties?.text || "\u2014"} />
                  )}
                  {selectedObj.object_type === "restricted_area" && (
                    <>
                      {selectedObj.properties?.restricted_area_id ? (
                        <div className="flex items-center gap-2 py-1 px-2 bg-red-50 rounded-lg">
                          <span className="text-sm">🔒</span>
                          <span className="text-xs font-semibold text-red-700">Linked to restricted area</span>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Not linked to a restricted area</p>
                      )}
                    </>
                  )}
                  {selectedObj.object_type === "room" && selectedObj.properties?.post_id && (
                    <>
                      <hr className="border-gray-100" />
                      <p className="text-[11px] text-gray-400 uppercase tracking-wider font-bold">VMS Details</p>
                      {loadingDetail ? (
                        <p className="text-xs text-gray-400 py-2">Loading...</p>
                      ) : roomDetail ? (
                        <>
                          {roomDetail.assigned_staff?.length > 0 && (
                            <div>
                              <p className="text-[11px] text-gray-400 uppercase font-bold mb-1">Assigned Staff</p>
                              <div className="flex flex-wrap gap-1">
                                {roomDetail.assigned_staff.map(s => (
                                  <span key={s.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s.name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {roomDetail.visitors_inside?.length > 0 && (
                            <div>
                              <p className="text-[11px] text-gray-400 uppercase font-bold mb-1">Visitors Inside ({roomDetail.visitors_inside.length})</p>
                              <div className="flex flex-wrap gap-1">
                                {roomDetail.visitors_inside.map(v => (
                                  <span key={v.room_visit_id} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">{v.visitor_name}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <p className="text-[11px] text-gray-400 uppercase font-bold mb-1">Last Scan at this Room</p>
                            {roomDetail.last_scan ? (
                              <p className="text-xs text-gray-700">
                                {roomDetail.last_scan.scanned_by_name || "Unknown guard"}
                                {" · "}{badgeDate(roomDetail.last_scan.arrived_at)}
                                {roomDetail.last_scan.departed_at && " (departed)"}
                              </p>
                            ) : (
                              <p className="text-xs font-semibold text-red-600">No scans recorded</p>
                            )}
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                  {selectedObj.object_type === "room" && !selectedObj.properties?.post_id && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-700">
                      Not linked to a VMS post.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ROOM GUARD (My Room) ─────────────────────────────────────
function RoomGuard({ apiMode, user }) {
  const [myPost, setMyPost] = useState(null);
  const [roomAccess, setRoomAccess] = useState("Public");
  const [badgeInput, setBadgeInput] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState("");
  const [recentArrivals, setRecentArrivals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [departureInput, setDepartureInput] = useState("");
  const [departureResult, setDepartureResult] = useState(null);
  const [departureError, setDepartureError] = useState("");
  const [departing, setDeparting] = useState(false);
  const [idVerified, setIdVerified] = useState(false);
  const [photoCaptured, setPhotoCaptured] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const needsSecondaryId = roomAccess === "Restricted" || roomAccess === "Highly Restricted";
  const needsPhoto = roomAccess === "Highly Restricted";
  const canConfirm = !needsSecondaryId || (idVerified && (!needsPhoto || photoCaptured));

  useEffect(() => {
    if (!apiMode) return;
    getMyStaff()
      .then(r => {
        const me = r.data;
        if (me?.post_id) {
          setMyPost(me);
          loadRecentArrivals(me.post_id);
          loadRoomAccess(me.post_id);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiMode]);

  function loadRoomAccess(postId) {
    getPosts()
      .then(r => {
        const post = r.data.find(p => p.id === postId);
        if (post) {
          const levelMap = { "none": "Public", "restricted": "Restricted", "highly_restricted": "Highly Restricted" };
          setRoomAccess(levelMap[post.restriction_level] || post.access_level || "Public");
        }
      })
      .catch(() => {});
  }

  function loadRecentArrivals(postId) {
    getRecentArrivals(postId)
      .then(r => setRecentArrivals(r.data))
      .catch(() => {});
  }

  async function handleLookup() {
    if (!badgeInput.trim() || !myPost?.post_id) return;
    setLooking(true);
    setScanError("");
    setLookupResult(null);
    setScanResult(null);
    setIdVerified(false);
    setPhotoCaptured(false);
    try {
      const r = await lookupBadge(myPost.post_id, { badge_number: badgeInput.trim() });
      setLookupResult(r.data);
    } catch (e) {
      setScanError(e?.response?.data?.detail || "Badge not found.");
    } finally {
      setLooking(false);
    }
  }

  async function handleConfirmArrival() {
    if (!lookupResult || !myPost?.post_id) return;
    setConfirming(true);
    setScanError("");
    try {
      const r = await scanArrival(myPost.post_id, {
        badge_number: lookupResult.badge_number,
        id_verified: !!idVerified,
        photo_captured: !!photoCaptured,
        photo: photoDataUrl,
      });
      setScanResult(r.data);
      setLookupResult(null);
      setBadgeInput("");
      setIdVerified(false);
      setPhotoCaptured(false);
      setPhotoDataUrl(null);
      loadRecentArrivals(myPost.post_id);
    } catch (e) {
      setScanError(e?.response?.data?.detail || "Failed to confirm arrival.");
    } finally {
      setConfirming(false);
    }
  }

  function handleDeparture(badgeNumber) {
    if (!badgeNumber || !myPost?.post_id) return;
    setDepartureError("");
    setDepartureResult(null);
    scanDeparture(myPost.post_id, { badge_number: badgeNumber })
      .then(r => {
        setDepartureResult(r.data);
        setDepartureInput("");
        loadRecentArrivals(myPost.post_id);
      })
      .catch(e => setDepartureError(e?.response?.data?.detail || "Failed to check out visitor."));
  }

  function handleDepartureScan() {
    if (!departureInput.trim() || !myPost?.post_id || departing) return;
    setDeparting(true);
    setDepartureError("");
    setDepartureResult(null);
    scanDeparture(myPost.post_id, { badge_number: departureInput.trim() })
      .then(r => {
        setDepartureResult(r.data);
        setDepartureInput("");
        loadRecentArrivals(myPost.post_id);
      })
      .catch(e => setDepartureError(e?.response?.data?.detail || "Failed to check out visitor."))
      .finally(() => setDeparting(false));
  }

  function startCamera() {
    setCameraActive(true);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment", width: 320, height: 240 } })
      .then(stream => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } })
      .catch(() => setCameraActive(false));
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = 320;
    canvas.height = 240;
    canvas.getContext("2d").drawImage(video, 0, 0, 320, 240);
    const stream = video.srcObject;
    if (stream) stream.getTracks().forEach(t => t.stop());
    setCameraActive(false);
    setPhotoCaptured(true);
    setPhotoDataUrl(canvas.toDataURL("image/jpeg", 0.7));
  }

  function cancelCamera() {
    const video = videoRef.current;
    if (video?.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    setCameraActive(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-gray-400">Loading...</p></div>;

  if (!myPost?.post_id) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)]">
        <div className="text-center">
          <p className="text-4xl mb-3">🏠</p>
          <h2 className="text-lg font-bold text-gray-900 mb-1">No Room Assigned</h2>
          <p className="text-sm text-gray-500">Ask your administrator to assign you to a room/post.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Room — {roomLabel({ name: myPost.post_name, room_number: myPost.post_room_number })}</h1>
          <p className="text-sm text-gray-500">Scan visitor badges to log arrivals at your room. Building entry / badge issuance is handled at the Front Desk.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cls("px-3 py-1.5 rounded-lg text-xs font-semibold border",
            roomAccess === "Highly Restricted" ? "bg-red-50 text-red-700 border-red-200"
            : roomAccess === "Restricted" ? "bg-amber-50 text-amber-700 border-amber-200"
            : roomAccess === "Employee Only" ? "bg-blue-50 text-blue-700 border-blue-200"
            : "bg-gray-50 text-gray-600 border-gray-200")}>
            {roomAccess === "Highly Restricted" ? "🔴" : roomAccess === "Restricted" ? "🔒" : "🟢"} {roomAccess}
          </span>
          <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-lg text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> On Duty
          </div>
        </div>
      </div>

      {/* Security Requirements Info */}
      {needsSecondaryId && (
        <div className={cls("rounded-lg border px-4 py-3 text-xs",
          needsPhoto ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700")}>
          <span className="font-bold">Security protocol for this room:</span>{" "}
          {needsPhoto
            ? "Badge scan + Secondary ID verification + Visitor photo required"
            : "Badge scan + Secondary ID verification required"}
        </div>
      )}

      {/* Badge Scanner */}
      <div className="bg-white rounded-[12px] border border-gray-200 p-5">
        <h3 className="font-bold text-sm text-gray-900 mb-3">1. Scan Badge</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={badgeInput}
            onChange={e => setBadgeInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLookup()}
            placeholder="Enter badge number (e.g. V-001)"
            disabled={!!lookupResult}
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-50"
          />
          {!lookupResult ? (
            <button onClick={handleLookup} disabled={looking || !badgeInput.trim()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {looking ? "Looking up..." : "🔍 Look Up"}
            </button>
          ) : (
            <button onClick={() => { setLookupResult(null); setScanResult(null); setBadgeInput(""); setIdVerified(false); setPhotoCaptured(false); cancelCamera(); }}
              className="px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors">
              ✕ Clear
            </button>
          )}
        </div>

        {scanError && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {scanError}
          </div>
        )}

        {/* Step 2: Visitor Details + Verification (after lookup) */}
        {lookupResult && (
          <div className="mt-4">
            <div className={cls("rounded-lg border p-4", lookupResult.is_correct_destination ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{lookupResult.is_correct_destination ? "✅" : "⛔"}</span>
                <span className={cls("font-bold text-sm", lookupResult.is_correct_destination ? "text-green-800" : "text-red-800")}>
                  {lookupResult.is_correct_destination ? "Correct Destination" : "Not Your Visitor — Do Not Admit"}
                </span>
              </div>
              {!lookupResult.is_correct_destination && (
                <p className="text-xs text-red-700 mb-2 mt-1">
                  {lookupResult.destination_name
                    ? <>This badge is issued to <b>{lookupResult.visitor_name}</b> for <b>{lookupResult.destination_name}</b>. This is {roomLabel({ name: myPost.post_name, room_number: myPost.post_room_number })} — route the visitor to their assigned room.</>
                    : <>This badge has no room destination — that visitor is handled at the Front Desk, not a department room. Route them to the Front Desk.</>}
                </p>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Visitor</p><p className="text-sm font-semibold text-gray-900">{lookupResult.visitor_name}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Badge</p><p className="text-sm font-semibold text-gray-900 font-mono">{lookupResult.badge_number || "N/A"}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Host</p><p className="text-sm font-semibold text-gray-900">{lookupResult.host_name}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Purpose</p><p className="text-sm font-semibold text-gray-900">{lookupResult.purpose}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Company</p><p className="text-sm font-semibold text-gray-900">{lookupResult.company || "—"}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Phone</p><p className="text-sm font-semibold text-gray-900">{lookupResult.phone || "—"}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Email</p><p className="text-sm font-semibold text-gray-900">{lookupResult.visitor_email || "—"}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">ID Type</p><p className="text-sm font-semibold text-gray-900">{lookupResult.id_type || "—"}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">ID Number</p><p className="text-sm font-semibold text-gray-900">{lookupResult.id_number || "—"}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Visit Date</p><p className="text-sm font-semibold text-gray-900">{lookupResult.visit_date || "—"}</p></div>
                <div><p className="text-[10px] text-gray-400 uppercase font-bold">Status</p><Badge status={lookupResult.status} /></div>
              </div>

              {/* Verification Steps (only for a visitor assigned to THIS room) */}
              {lookupResult.is_correct_destination && needsSecondaryId && (
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <h4 className="text-xs font-bold text-gray-700 mb-2">2. Verify Identity</h4>
                  <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-white/60 transition-colors">
                    <input type="checkbox" checked={idVerified} onChange={e => setIdVerified(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Secondary ID verified</span>
                      <p className="text-[10px] text-gray-500">Confirmed visitor's government ID matches the name on the badge</p>
                    </div>
                  </label>
                </div>
              )}

              {needsPhoto && lookupResult.is_correct_destination && (
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <h4 className="text-xs font-bold text-gray-700 mb-2">3. Capture Visitor Photo</h4>
                  {!photoCaptured && !cameraActive && (
                    <button onClick={startCamera} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-200 transition-colors">
                      📷 Start Camera
                    </button>
                  )}
                  {cameraActive && (
                    <div className="flex flex-col gap-2">
                      <video ref={videoRef} className="rounded-lg border border-gray-200 max-w-[320px]" playsInline muted />
                      <div className="flex gap-2">
                        <button onClick={capturePhoto} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">📸 Capture</button>
                        <button onClick={cancelCamera} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200">Cancel</button>
                      </div>
                    </div>
                  )}
                  {photoCaptured && (
                    <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2">
                      <span>✅</span>
                      <span className="text-sm font-semibold">Photo captured</span>
                      <button onClick={() => setPhotoCaptured(false)} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">Retake</button>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              {/* Confirm Button — only ever shown for a visitor whose
                  destination IS this guard's room */}
              {lookupResult.is_correct_destination && (
                <div className="border-t border-gray-200 pt-3 mt-3 flex items-center justify-between">
                  {!canConfirm && (
                    <p className="text-xs text-red-500">
                      {!idVerified && needsSecondaryId && "Complete secondary ID verification. "}
                      {needsPhoto && !photoCaptured && "Capture visitor photo."}
                    </p>
                  )}
                  <button onClick={handleConfirmArrival} disabled={confirming || !canConfirm}
                    className={cls("ml-auto px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors",
                      canConfirm ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-200 text-gray-400 cursor-not-allowed")}>
                    {confirming ? "Confirming..." : "✅ Confirm Arrival"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Successful scan result */}
        {scanResult && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">✅</span>
              <span className="font-bold text-sm text-green-800">{scanResult.visitor_name} — Arrival logged</span>
            </div>
            <p className="text-xs text-green-600">{scanResult.detail}</p>
            <p className="text-[10px] text-gray-400 mt-1">Arrived at {scanResult.arrived_at ? new Date(scanResult.arrived_at).toLocaleTimeString() : ""}</p>
          </div>
        )}
      </div>

      {/* Scan Departure — visitor leaves after finishing their business */}
      <div className="bg-white rounded-[12px] border border-gray-200 p-5">
        <h3 className="font-bold text-sm text-gray-900 mb-1">2. Scan Departure</h3>
        <p className="text-xs text-gray-500 mb-3">When the visitor is about to leave after their business, scan their badge again — this tells the system they have departed and frees the room.</p>
        <div className="flex gap-3">
          <input
            type="text"
            value={departureInput}
            onChange={e => setDepartureInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleDepartureScan()}
            placeholder="Scan / enter badge number (e.g. V-001)"
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <button onClick={handleDepartureScan} disabled={departing || !departureInput.trim()}
            className="px-6 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {departing ? "Scanning..." : "🚪 Scan Departure"}
          </button>
        </div>
        {departureError && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{departureError}</div>
        )}
        {departureResult && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">🚪</span>
              <span className="font-bold text-sm text-gray-800">{departureResult.visitor_name || "Visitor"} — Departed</span>
            </div>
            <p className="text-xs text-gray-600">{departureResult.detail}</p>
            {departureResult.badge_number && <p className="text-[10px] text-gray-400 mt-1">Badge {departureResult.badge_number} returned</p>}
          </div>
        )}
      </div>

      {/* Recent Arrivals */}
      <div className="bg-white rounded-[12px] border border-gray-200 p-5">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Recent Arrivals at {roomLabel({ name: myPost.post_name, room_number: myPost.post_room_number })}</h3>
        {recentArrivals.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No arrivals yet.</p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-gray-400 uppercase border-b border-gray-100">
                  <th className="pb-2 pr-3 font-bold">Visitor</th>
                  <th className="pb-2 pr-3 font-bold">Badge</th>
                  <th className="pb-2 pr-3 font-bold">Host</th>
                  <th className="pb-2 pr-3 font-bold">Purpose</th>
                  <th className="pb-2 pr-3 font-bold">Arrived</th>
                  <th className="pb-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentArrivals.map(a => (
                  <tr key={a.room_visit_id} className="border-b border-gray-50">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-gray-900">{a.visitor_name}</div>
                      <div className="text-[10px] text-gray-400">{a.company || ""}</div>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-gray-600">{a.badge_number || "—"}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-600">{a.host_name}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-600">{a.purpose}</td>
                    <td className="py-2.5 pr-3 text-xs text-gray-500">{a.arrived_at ? new Date(a.arrived_at).toLocaleString() : "—"}</td>
                    <td className="py-2.5">
                      {a.departed_at ? (
                        <span className="text-xs text-gray-400">Departed</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Inside</span>
                          <button onClick={() => handleDeparture(a.badge_number)}
                            className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-semibold hover:bg-gray-200 transition-colors">
                            Check out
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RECEPTIONIST DASHBOARD ──────────────────────────────────
// Local calendar date (YYYY-MM-DD). Using toISOString() here was buggy:
// it returns the UTC date, which lags a day behind the Philippines'
// local date between midnight and ~8 AM — making "today" visits vanish
// from the dashboard they were created for.
// ─── BADGE REGISTRY (Admin / Super Admin / Receptionist) ─────────
const BADGE_TABS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "returned", label: "Returned" },
  { id: "history", label: "History" },
];
const BADGE_LEVEL_LABEL = { "none": "Public", "restricted": "Restricted", "highly_restricted": "Highly Restricted" };

function roomLabel(p) {
  if (!p || !p.name) return "";
  return p.room_number ? `${p.name} · ${p.room_number}` : p.name;
}

function badgeDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function badgeDuration(beginIso, endIso) {
  const a = new Date(beginIso), b = endIso ? new Date(endIso) : new Date();
  if (isNaN(a.getTime()) || isNaN(b.getTime()) || b < a) return "—";
  const mins = Math.floor((b - a) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h ${mins % 60}m`;
}

function BadgeRegistry({ apiMode = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  useEffect(() => {
    if (!apiMode) return;
    setLoading(true);
    const t = setTimeout(() => {
      getBadges({ status: tab === "history" ? "all" : tab, q })
        .then(r => { setRows(r.data || []); setError(""); })
        .catch(e => setError(e?.response?.data?.detail || "Failed to load the badge registry."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [apiMode, tab, q]);

  const pill = st => st === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600";

  return (
    <div className="bg-white rounded-[12px] border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold text-lg text-gray-900">🪪 Badge Registry</h2>
          <p className="text-xs text-gray-500">Audit trail of every badge issuance and return. Admin · Super Admin · Receptionist only.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search badge or visitor…"
            className="w-full h-9 pl-3 pr-8 rounded-[8px] border border-gray-200 text-sm focus:ring-2 focus:ring-blue-200 outline-none" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {BADGE_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cls("px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors",
              tab === t.id ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No badges{tab === "active" || tab === "returned" ? ` ${tab}` : ""} match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
                <th className="py-2 pr-3 font-bold">Badge</th>
                <th className="py-2 pr-3 font-bold">Visitor</th>
                <th className="py-2 pr-3 font-bold">Room</th>
                <th className="py-2 pr-3 font-bold">Status</th>
                <th className="py-2 font-bold">Issued At</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || i} onClick={() => setSel(r)}
                  className="border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer transition-colors">
                  <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-gray-800">{r.badge_number || "—"}</td>
                  <td className="py-2.5 pr-3 font-medium text-gray-900">{r.visitor_name || "—"}</td>
                  <td className="py-2.5 pr-3 text-xs text-gray-600">{r.room || "—"}</td>
                  <td className="py-2.5 pr-3"><span className={cls("inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize", pill(r.status))}>{r.status || "—"}</span></td>
                  <td className="py-2.5 text-xs text-gray-500">{badgeDate(r.issued_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!sel} title="Badge Detail" onClose={() => setSel(null)} wide>
        {sel && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase font-bold">Badge Number</p>
                <p className="font-mono text-lg font-bold text-gray-900">{sel.badge_number || "—"}</p>
              </div>
              <span className={cls("px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize", pill(sel.status))}>{sel.status || "—"}</span>
            </div>
            {sel.status === "active" && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 font-medium">
                ● Still in use — active for {badgeDuration(sel.issued_at)}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
              <InfoRow label="Visitor" value={sel.visitor_name} />
              <InfoRow label="Purpose" value={sel.purpose} />
              <InfoRow label="Host" value={sel.host_name} />
              <InfoRow label="Destination Room" value={sel.room || "No room assigned"} />
              <InfoRow label="Room Restriction Level" value={BADGE_LEVEL_LABEL[sel.room_restriction_level] || "—"} />
              <InfoRow label="Visit Reference" value={sel.visit_request_id ? sel.visit_request_id.slice(0, 8) : "—"} />
              <InfoRow label="Issued At" value={badgeDate(sel.issued_at)} />
              <InfoRow label="Issued By" value={sel.issued_by_name} />
              <InfoRow label="Returned At" value={sel.returned_at ? badgeDate(sel.returned_at) : "—"} />
              {sel.status === "returned" && <InfoRow label="Duration Held" value={sel.issued_at && sel.returned_at ? badgeDuration(sel.issued_at, sel.returned_at) : "—"} />}
            </div>
          </>
        )}
      </Dialog>
    </div>
  );
}

// ─── RECEPTIONIST DASHBOARD ──────────────────────────────────
// Local calendar date (YYYY-MM-DD). Using toISOString() here was buggy:
// it returns the UTC date, which lags a day behind the Philippines'
// local date between midnight and ~8 AM — making "today" visits vanish
// from the dashboard they were created for.
function localDateISO(d = new Date()) {
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ReceptionistDashboard({ requests, visitors, user, apiMode }) {
  const today = localDateISO();
  const todayRequests = requests.filter(r => r.visit_date === today);
  // Only the matched host employee approves — hide other people's pending
  // requests from employees so they never see an Approve button they can't
  // act on. Receptionists see everything (they assign/reject).
  const isEmployeeSide = user.role === "Employee";
  const pending = requests.filter(r =>
    r.approval_status === "Pending" &&
    (!isEmployeeSide || (r.host_staff_id && String(r.host_staff_id) === String(user.id)))
  );
  const checkedIn = requests.filter(r => r.status === "Checked In");
  const checkedOutToday = requests.filter(r => r.status === "Checked Out" && r.visit_date === today);
  // Future-dated visits (never invisible): anything after today that isn't
  // complete/rejected yet, sorted soonest first.
  const upcoming = requests
    .filter(r => r.visit_date > today && r.approval_status !== "Rejected" && r.status !== "Checked Out")
    .sort((a, b) => a.visit_date.localeCompare(b.visit_date));

  const [approving, setApproving] = useState(null);
  const [approveError, setApproveError] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting]       = useState(null);
  const [rejectError, setRejectError]   = useState("");

  // Assign (send to correct employee) — receptionist only
  const [assignTarget, setAssignTarget]     = useState(null);
  const [employees, setEmployees]           = useState([]);
  const [assignEmployee, setAssignEmployee] = useState("");
  const [assigning, setAssigning]           = useState(false);
  const [assignError, setAssignError]       = useState("");

  // Room capacity — live occupancy for real-time capacity display
  const [roomCapacity, setRoomCapacity] = useState([]);

  // Employees can approve (their own) — receptionists can only re-route or reject.
  const isReceptionSide = user.role === "Receptionist";

  useEffect(() => {
    if (!assignTarget) return;
    setAssignEmployee(assignTarget.host_staff_id || "");
    getEmployees().then(r => setEmployees(r.data)).catch(() => setEmployees([]));
  }, [assignTarget]);

  useEffect(() => {
    if (!apiMode) return;
    getRoomCapacity().then(r => setRoomCapacity(r.data || [])).catch(() => setRoomCapacity([]));
  }, [apiMode, requests]);

  async function openReject(req) {
    setRejectTarget(req);
    setRejectReason("");
    setRejectError("");
  }

  async function openAssign(req) {
    setAssignTarget(req);
    setAssignError("");
  }

  async function handleApprove(req) {
    setApproving(req.id); setApproveError("");
    try {
      await approveRequest(req.id, { action: "Approved" });
      if (typeof refreshRequests === "function") refreshRequests();
    } catch (e) {
      setApproveError(e?.response?.data?.detail || "Failed to approve. Try again.");
    }
    setApproving(null);
  }

  async function doReject() {
    if (!rejectReason.trim()) { setRejectError("Please type a reason for the rejection."); return; }
    setRejecting(rejectTarget.id); setRejectError("");
    try {
      await approveRequest(rejectTarget.id, { action: "Rejected", rejection_reason: rejectReason.trim() });
      if (typeof refreshRequests === "function") refreshRequests();
      setRejectTarget(null);
    } catch (e) {
      setRejectError(e?.response?.data?.detail || "Failed to reject. Try again.");
    } finally { setRejecting(null); }
  }

  async function doAssign() {
    if (!assignEmployee) { setAssignError("Choose the correct employee to send this request to."); return; }
    setAssigning(true); setAssignError("");
    try {
      await assignRequest(assignTarget.id, { host_staff_id: assignEmployee });
      if (typeof refreshRequests === "function") refreshRequests();
      setAssignTarget(null);
    } catch (e) {
      setAssignError(e?.response?.data?.detail || "Failed to send request. Try again.");
    } finally { setAssigning(false); }
  }

  const greetHour = new Date().getHours();
  const greeting = greetHour < 12 ? "Good morning" : greetHour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{greeting}, {user.name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-gray-500">Front Desk · {new Date().toLocaleDateString("en-PH", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Expected Today" value={todayRequests.length} icon="📅" color="bg-blue-50 text-blue-600" />
        <Kpi label="Pending Approval" value={pending.length} icon="⏳" color="bg-amber-50 text-amber-600" />
        <Kpi label="Currently Inside" value={checkedIn.length} icon="🏢" color="bg-emerald-50 text-emerald-600" />
        <Kpi label="Checked Out Today" value={checkedOutToday.length} icon="🚪" color="bg-gray-50 text-gray-600" />
      </div>

      {/* Rooms & Live Capacity — real-time occupancy per room */}
      {roomCapacity.length > 0 && (
        <div className="bg-white rounded-[12px] border border-gray-200 p-5">
          <h3 className="font-bold text-sm text-gray-900 mb-3">🏢 Rooms &amp; Live Capacity</h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {roomCapacity.map(room => (
              <div key={room.id} className="rounded-lg border border-gray-100 p-3">
                <p className="text-xs font-semibold text-gray-900 truncate">{room.name}</p>
                <p className="text-[11px] text-gray-500">Floor {room.floor}</p>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={cls("h-full rounded-full", room.current_occupancy >= room.capacity ? "bg-red-500" : "bg-green-500")}
                    style={{ width: `${Math.min(100, Math.round((room.current_occupancy / Math.max(1, room.capacity)) * 100))}%` }} />
                </div>
                <p className={cls("mt-1 text-[11px] font-semibold", room.current_occupancy >= room.capacity ? "text-red-600" : "text-gray-500")}>
                  {room.current_occupancy} / {room.capacity} inside
                  {room.current_occupancy >= room.capacity && " · FULL"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Approvals — Quick Action */}
      {pending.length > 0 && (
        <div className="bg-white rounded-[12px] border border-amber-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-gray-900">⏳ Pending Approval — needs your action</h3>
            <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          {approveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{approveError}</p>
          )}
          <div className="flex flex-col gap-2">
            {pending.map(req => (
              <div key={req.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-amber-50/60 border border-amber-100">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold text-xs flex items-center justify-center">
                  {req.visitor_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{req.visitor_name}</p>
                    {req.company && <span className="text-[10px] text-gray-400 hidden sm:inline">· {req.company}</span>}
                  </div>
                  <p className="text-xs text-gray-500">
                    Host: {req.host_name} · {req.purpose} · {req.visit_date}
                    {req.expected_time && ` · ${req.expected_time}`}
                    {!req.host_staff_id && (
                      <span className="ml-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Unassigned</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!isReceptionSide && (
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={approving === req.id}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                      {approving === req.id ? "..." : "✓ Approve"}
                    </button>
                  )}
                  {isReceptionSide && (
                    <button
                      onClick={() => openAssign(req)}
                      disabled={assigning}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {assigning ? "..." : "↗ Send"}
                    </button>
                  )}
                  <button
                    onClick={() => openReject(req)}
                    disabled={rejecting === req.id}
                    className="px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors">
                    {rejecting === req.id ? "..." : "✕ Reject"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's Schedule */}
      <div className="bg-white rounded-[12px] border border-gray-200 p-5">
        <h3 className="font-bold text-sm text-gray-900 mb-3">Today's Visitors ({todayRequests.length})</h3>
        {todayRequests.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm text-gray-400">No visitors expected today</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {todayRequests.map(req => {
              const isInside = req.status === "Checked In";
              const isDone = req.status === "Checked Out";
              const isApproved = req.approval_status === "Approved";
              return (
                <div key={req.id} className={cls(
                  "flex items-center gap-3 py-2.5 px-3 rounded-lg border transition-colors",
                  isInside ? "bg-green-50 border-green-200" : isDone ? "bg-gray-50 border-gray-100 opacity-60" : "border-gray-100 hover:bg-gray-50"
                )}>
                  <div className={cls(
                    "w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center",
                    isInside ? "bg-green-100 text-green-700" : isDone ? "bg-gray-100 text-gray-500" : "bg-slate-100 text-slate-600"
                  )}>
                    {req.visitor_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{req.visitor_name}</p>
                      {req.company && <span className="text-[10px] text-gray-400 hidden sm:inline">· {req.company}</span>}
                    </div>
                    <p className="text-xs text-gray-500">
                      {req.host_name} · {req.purpose}
                      {req.expected_time && ` · ETA ${req.expected_time}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isInside && (
                      <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Inside</span>
                    )}
                    {isDone && (
                      <span className="text-[10px] text-gray-400">Left</span>
                    )}
                    {!isInside && !isDone && req.approval_status === "Pending" && (
                      <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Awaiting</span>
                    )}
                    {!isInside && !isDone && isApproved && (
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Approved</span>
                    )}
                    {!isInside && !isDone && req.approval_status === "Rejected" && (
                      <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Rejected</span>
                    )}
                    <Badge status={req.approval_status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upcoming Visitors (future dates) */}
      {upcoming.length > 0 && (
        <div className="bg-white rounded-[12px] border border-gray-200 p-5">
          <h3 className="font-bold text-sm text-gray-900 mb-3">📅 Upcoming Visitors ({upcoming.length})</h3>
          <div className="flex flex-col gap-1.5">
            {upcoming.map(req => (
              <div key={req.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-gray-100">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center">
                  {req.visitor_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{req.visitor_name}</p>
                  <p className="text-xs text-gray-500">
                    {req.host_name} · {req.purpose}
                    {req.expected_time && ` · ETA ${req.expected_time}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">Upcoming</span>
                  <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">{req.visit_date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Currently Inside */}
      {checkedIn.length > 0 && (
        <div className="bg-white rounded-[12px] border border-gray-200 p-5">
          <h3 className="font-bold text-sm text-gray-900 mb-3">🏢 Currently Inside ({checkedIn.length})</h3>
          <div className="flex flex-col gap-1.5">
            {checkedIn.map(req => (
              <div key={req.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-green-50/60 border border-green-100">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{req.visitor_name}</p>
                  <p className="text-xs text-gray-500">{req.host_name} · {req.purpose}</p>
                </div>
                <span className="text-xs text-green-600 font-medium">Inside</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject dialog — reason required */}
      <Dialog open={!!rejectTarget} title="Reject Visit Request" onClose={() => setRejectTarget(null)}
        footer={<>
          <Btn variant="ghost" onClick={() => setRejectTarget(null)}>Cancel</Btn>
          <Btn variant="danger" onClick={doReject} disabled={!!rejecting || !rejectReason.trim()}>
            {rejecting ? "Rejecting…" : "Reject Request"}
          </Btn>
        </>}>
        {rejectTarget && (
          <div className="flex flex-col gap-3">
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-900">{rejectTarget.visitor_name}</p>
              <p className="text-xs text-gray-500">{rejectTarget.purpose} · {rejectTarget.visit_date}</p>
            </div>
            <Input label="Reason for rejection *"
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="e.g. Typo in name, invalid ID…" required />
            {rejectError && <p className="text-xs text-red-500">{rejectError}</p>}
          </div>
        )}
      </Dialog>

      {/* Assign / Send dialog — receptionist routes a mis-typed host */}
      <Dialog open={!!assignTarget} title="Send Request to Employee" onClose={() => setAssignTarget(null)}
        footer={<>
          <Btn variant="ghost" onClick={() => setAssignTarget(null)}>Cancel</Btn>
          <Btn onClick={doAssign} disabled={assigning || !assignEmployee}>Send Request</Btn>
        </>}>
        {assignTarget && (
          <div className="flex flex-col gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              ⚠️ This request has no valid host ({assignTarget.host_name || "no name"}). Pick the correct employee to send it to — they will then approve or reject it.
            </div>
            <label className="block text-xs font-semibold text-gray-600">
              Employee
              <select value={assignEmployee} onChange={e => setAssignEmployee(e.target.value)}
                className="mt-1 w-full h-9 px-3 rounded-[8px] border border-gray-200 text-sm outline-none">
                <option value="">— Choose the employee —</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}{emp.department_name ? ` · ${emp.department_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {assignError && <p className="text-xs text-red-500">{assignError}</p>}
          </div>
        )}
      </Dialog>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => window.__vista_set_page?.("requests")}
          className="bg-white rounded-[12px] border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all group">
          <p className="text-2xl mb-2">📋</p>
          <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Visit Requests</p>
          <p className="text-xs text-gray-400">View and manage all visit requests</p>
        </button>
        <button
          onClick={() => window.__vista_set_page?.("visitors")}
          className="bg-white rounded-[12px] border border-gray-200 p-5 text-left hover:border-blue-300 hover:shadow-sm transition-all group">
          <p className="text-2xl mb-2">👥</p>
          <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">Visitor History</p>
          <p className="text-xs text-gray-400">Browse and register visitors</p>
        </button>
      </div>
    </div>
  );
}

// ─── LAYOUT ───────────────────────────────────────────────────────
function Sidebar({ page, setPage, user, open, onClose }) {
  const nav = roleNav(user);

  function handleNav(id) { setPage(id); onClose(); }

  return (
    <>
      {/* Backdrop — mobile only */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-[110] lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside className={cls(
        "fixed left-0 top-0 w-60 h-screen bg-[#0F172A] flex flex-col z-[120] transition-transform duration-300",
        // On large screens: always visible, no transform needed
        // On mobile: slide in/out based on `open`
        "lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-white/[.06]">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs">🪪</div>
          <span className="text-white font-bold text-sm">Vista VMS</span>
          {/* Close button — mobile only */}
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-white lg:hidden text-lg leading-none">✕</button>
        </div>
        <div className="px-3 py-3 border-b border-white/[.06]">
          <div className="flex items-center gap-2 px-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">{user.initials}</div>
            <div><p className="text-white text-xs font-semibold">{user.name}</p><p className="text-slate-400 text-[10px]">{user.role}</p></div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {nav.map(n=>(
            <button key={n.id} onClick={()=>handleNav(n.id)}
              className={cls("flex items-center gap-2.5 mx-2 px-3 py-2 text-[13px] font-medium rounded-lg transition-colors text-left w-[calc(100%-16px)]",page===n.id?"bg-blue-600 text-white":"text-slate-400 hover:bg-white/5 hover:text-white")}>
              <span>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 text-[10px] text-slate-500 border-t border-white/[.06]">Vista VMS · v1.2</div>
      </aside>
    </>
  );
}

function Topbar({ user, onLogout, onMenuOpen }) {
  const roleColors={Administrator:"bg-purple-600","Super Admin":"bg-rose-600","Security Guard":"bg-emerald-600",Receptionist:"bg-blue-600",Employee:"bg-slate-600"};
  return (
    <header className="fixed top-0 left-0 lg:left-60 right-0 h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-4 z-[50]">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuOpen}
        className="lg:hidden flex flex-col gap-1.5 p-1.5 rounded-md hover:bg-gray-100 transition-colors"
        aria-label="Open menu"
      >
        <span className="block w-5 h-0.5 bg-gray-600 rounded"/>
        <span className="block w-5 h-0.5 bg-gray-600 rounded"/>
        <span className="block w-5 h-0.5 bg-gray-600 rounded"/>
      </button>

      {/* Logo — mobile only (hidden on desktop since sidebar shows it) */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center text-white text-xs">🪪</div>
        <span className="font-bold text-sm text-gray-800">Vista VMS</span>
      </div>

      <div className="flex-1"/>
      <div className={cls("px-2.5 py-1 rounded-full text-white text-[11px] font-bold hidden sm:block",roleColors[user.role]||"bg-gray-600")}>{user.role}</div>
      <div className="text-sm font-medium text-gray-700 hidden sm:block">{user.name}</div>
      <button onClick={onLogout} className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Sign Out</button>
    </header>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────
export default function VistaVMS({ apiMode = false, authUser = null, onSignInWithPassword = null, onEnrollBiometric = null, onVerifyBiometric = null, onLogout = null }) {
  const [screen, setScreen] = useState("landing"); // landing | visitor | staff-login | app | retrieve
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [visitors, setVisitors] = useState(SEED_VISITORS);
  const [requests, setRequests] = useState(SEED_REQUESTS);

  // Expose setPage for in-component quick actions (e.g. ReceptionistDashboard)
  useEffect(() => { window.__vista_set_page = setPage; return () => { delete window.__vista_set_page; }; }, []);

  // Fetch real visit requests from the backend when running in apiMode
  const refreshRequests = useCallback(async () => {
    if (!apiMode) return;
    try {
      const res = await getVisitRequests();
      setRequests(res.data);
    } catch (e) {
      console.error("Failed to load visit requests", e);
    }
  }, [apiMode]);

  const refreshVisitors = useCallback(async () => {
    if (!apiMode) return;
    try {
      const res = await getVisitors();
      setVisitors(res.data);
    } catch (e) {
      console.error("Failed to load visitors", e);
    }
  }, [apiMode]);

  // Initial fetch when the app screen mounts
  useEffect(() => {
    if (apiMode && screen === "app") { refreshRequests(); refreshVisitors(); }
  }, [apiMode, screen, refreshRequests, refreshVisitors]);

  // Re-fetch whenever the user switches back to this tab or returns to the app
  // from the phone home screen. Fixes the stale-data bug where a laptop left
  // open on the dashboard showed different counts than a phone opened fresh.
  useEffect(() => {
    if (!apiMode || screen !== "app") return;
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshRequests(); refreshVisitors();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [apiMode, screen, refreshRequests, refreshVisitors]);

  // NOTE: screen/user transitions are driven directly by handleLoginSuccess
  // and handleLogout below — there is no longer a separate effect syncing
  // from `authUser`, since that raced with handleLoginSuccess (both could
  // flip `screen` to "app" independently, sometimes before `user` was fully
  // populated, causing a render crash reading `user.role` on undefined).

  const handleLoginSuccess = (realUser) => {
    if (!realUser || !realUser.role) {
      console.error("Login succeeded but user object is incomplete:", realUser);
      return;
    }
    setUser(realUser); setPage("dashboard"); setScreen("app");
  };

  const handleLogout = async () => {
    if (onLogout) await onLogout();
    setUser(null); setScreen("landing");
  };

  if (screen === "landing") return <LandingPage onVisitor={() => setScreen("visitor")} onStaff={() => setScreen("staff-login")} onRetrieve={() => setScreen("retrieve")} />;
  if (screen === "visitor") return <VisitorPortal onBack={() => setScreen("landing")} apiMode={apiMode} />;
  if (screen === "retrieve") return <RetrievePass onBack={() => setScreen("landing")} />;
  if (screen === "staff-login") return (
    // BUG #5 FIX: onBack must be passed here so the "← Back" button inside
    // StaffLogin can navigate back to the landing page. Without it, clicking
    // "← Back" called undefined and silently did nothing.
    <StaffLogin
      onSignInWithPassword={onSignInWithPassword}
      onEnrollBiometric={onEnrollBiometric}
      onVerifyBiometric={onVerifyBiometric}
      onSuccess={handleLoginSuccess}
      onBack={() => setScreen("landing")}
    />
  );

  if (screen === "app" && (!user || !user.role)) {
    // Guards against any stale localStorage state or timing edge case —
    // never render the dashboard shell with an incomplete user object.
    return <LandingPage onVisitor={() => setScreen("visitor")} onStaff={() => setScreen("staff-login")} onRetrieve={() => setScreen("retrieve")} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans">
      <Sidebar page={page} setPage={setPage} user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Topbar user={user} onLogout={handleLogout} onMenuOpen={() => setSidebarOpen(true)} />
      <main className="lg:ml-60 mt-14 min-h-[calc(100vh-3.5rem)] p-4 lg:p-6">
        {/* URL BYPASS FIX: every page checks the user role AND module
             permission before rendering. Anyone who forces a page they
             aren't assigned (DevTools, localStorage) gets "Access denied". */}
        {page === "dashboard" && (["Receptionist","Employee"].includes(user.role)
          ? <ReceptionistDashboard requests={requests} visitors={visitors} user={user} apiMode={apiMode} refreshRequests={refreshRequests} />
          : <Dashboard requests={requests} visitors={visitors} user={user} />)}
        {page === "visitors" && (ROLE_MODULE_GUARD(user, "visitors")
          ? <VisitorsPage visitors={visitors} setVisitors={setVisitors} requests={requests} user={user} apiMode={apiMode} refreshVisitors={refreshVisitors} />
          : <AccessDenied />)}
        {page === "requests" && (ROLE_MODULE_GUARD(user, "requests")
          ? <VisitRequestsPage requests={requests} setRequests={setRequests} user={user} apiMode={apiMode} refreshRequests={refreshRequests} />
          : <AccessDenied />)}
        {page === "security" && (ROLE_MODULE_GUARD(user, "security")
          ? <SecurityDesk requests={requests} setRequests={setRequests} user={user} apiMode={apiMode} refreshRequests={refreshRequests} />
          : <AccessDenied />)}
        {page === "myroom" && (ROLE_MODULE_GUARD(user, "myroom")
          ? <RoomGuard apiMode={apiMode} user={user} />
          : <AccessDenied />)}
        {page === "analytics" && (ROLE_MODULE_GUARD(user, "analytics")
          ? <Analytics requests={requests} visitors={visitors} user={user} apiMode={apiMode} />
          : <AccessDenied />)}
        {page === "audit" && (ROLE_MODULE_GUARD(user, "audit")
          ? <AuditLog apiMode={apiMode} />
          : <AccessDenied />)}
        {page === "restricted" && (ROLE_MODULE_GUARD(user, "restricted")
          ? <RestrictedAreas requests={requests} user={user} apiMode={apiMode} />
          : <AccessDenied />)}
        {page === "staff" && (ROLE_MODULE_GUARD(user, "staff")
          ? <StaffManagement apiMode={apiMode} />
          : <AccessDenied />)}
        {page === "departments" && (ROLE_MODULE_GUARD(user, "departments")
          ? <DepartmentsManagement apiMode={apiMode} />
          : <AccessDenied />)}
        {page === "floorplan" && (ROLE_MODULE_GUARD(user, "floorplan")
          ? <FloorPlanEditor apiMode={apiMode} user={user} />
          : <AccessDenied />)}
        {page === "visitor-history" && (ROLE_MODULE_GUARD(user, "visitor-history")
          ? <VisitRequestsPage requests={requests} setRequests={setRequests} user={user} apiMode={apiMode} refreshRequests={refreshRequests} defaultFilter="Checked Out" />
          : <AccessDenied />)}
        {page === "badges" && (ROLE_MODULE_GUARD(user, "badges")
          ? <BadgeRegistry apiMode={apiMode} />
          : <AccessDenied />)}
      </main>
    </div>
  );
}
