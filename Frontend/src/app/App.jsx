import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { Editor } from '@monaco-editor/react'
import { MonacoBinding } from 'y-monaco'
import * as Y from 'yjs'
import { SocketIOProvider } from 'y-socket.io'

// Deterministic accent color per username
const USER_COLORS = [
  { bg: 'bg-emerald-400', hex: '#34d399' },
  { bg: 'bg-sky-400', hex: '#38bdf8' },
  { bg: 'bg-violet-400', hex: '#a78bfa' },
  { bg: 'bg-rose-400', hex: '#fb7185' },
  { bg: 'bg-amber-400', hex: '#fbbf24' },
  { bg: 'bg-cyan-400', hex: '#22d3ee' },
  { bg: 'bg-fuchsia-400', hex: '#e879f9' },
  { bg: 'bg-lime-400', hex: '#a3e635' },
]

function getUserColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function Avatar({ name, size = 'md' }) {
  const color = getUserColor(name)
  const sizeClass = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-[11px]'
  return (
    <div className={`${sizeClass} ${color.bg} rounded-lg flex items-center justify-center font-bold text-zinc-900 font-mono shrink-0`}>
      {getInitials(name)}
    </div>
  )
}

function LiveDot({ colorClass = 'bg-emerald-400' }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colorClass} opacity-60`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${colorClass}`} />
    </span>
  )
}

export default function App() {
  const usernameFromQuery =
    new URLSearchParams(window.location.search).get('username')?.trim() || ''
  const isViteLocalDev =
    window.location.hostname === 'localhost' && window.location.port === '5173'
  const socketServerUrl =
    import.meta.env.VITE_SOCKET_URL?.trim() ||
    (isViteLocalDev ? 'http://localhost:3000' : window.location.origin)

  const editorRef = useRef(null)
  const providerRef = useRef(null)
  const monacoBindingRef = useRef(null)
  const awarenessHandlerRef = useRef(null)
  const beforeUnloadHandlerRef = useRef(null)

  const ydoc = useMemo(() => new Y.Doc(), [])
  const yText = useMemo(() => ydoc.getText('monaco'), [ydoc])

  const [username, setUsername] = useState(usernameFromQuery)
  const [usernameInput, setUsernameInput] = useState(usernameFromQuery)
  const [isJoined, setIsJoined] = useState(Boolean(usernameFromQuery))
  const [users, setUsers] = useState([])
  const [connected, setConnected] = useState(false)
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const teardownCollab = () => {
    if (providerRef.current && awarenessHandlerRef.current)
      providerRef.current.awareness.off('change', awarenessHandlerRef.current)
    if (beforeUnloadHandlerRef.current)
      window.removeEventListener('beforeunload', beforeUnloadHandlerRef.current)
    monacoBindingRef.current?.destroy()
    providerRef.current?.destroy()
    monacoBindingRef.current = providerRef.current = awarenessHandlerRef.current = beforeUnloadHandlerRef.current = null
    setUsers([])
    setConnected(false)
  }

  useEffect(() => () => { teardownCollab(); ydoc.destroy() }, [ydoc])

  useEffect(() => {
    if (!providerRef.current || !username) return
    providerRef.current.awareness.setLocalStateField('user', { name: username })
  }, [username])

  const handleMount = (editor) => {
    editorRef.current = editor
    teardownCollab()
    const model = editor.getModel()
    if (!model) return

    const provider = new SocketIOProvider(socketServerUrl, 'monaco', ydoc, { autoConnect: true })
    providerRef.current = provider
    provider.on('status', ({ status }) => {
      setConnected(status === 'connected')
    })
    provider.on('connection-error', (error) => {
      console.error('Socket connection error:', error)
      setConnected(false)
    })

    if (username) provider.awareness.setLocalStateField('user', { name: username })

    const onAwareness = () => {
      const next = Array.from(provider.awareness.getStates().values())
        .map(s => s?.user?.name?.trim()).filter(Boolean).map(name => ({ name }))
      setUsers(next)
    }
    awarenessHandlerRef.current = onAwareness
    provider.awareness.on('change', onAwareness)
    onAwareness()

    const onUnload = () => provider.awareness.setLocalStateField('user', null)
    beforeUnloadHandlerRef.current = onUnload
    window.addEventListener('beforeunload', onUnload)

    monacoBindingRef.current = new MonacoBinding(yText, model, new Set([editor]), provider.awareness)
  }

  const handleJoin = (e) => {
    e.preventDefault()
    const name = usernameInput.trim()
    if (!name) return
    setUsername(name)
    setIsJoined(true)
    window.history.pushState({}, '', `?username=${encodeURIComponent(name)}`)
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        {/* grid bg */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        {/* glow */}
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-sm">
          <div className="bg-zinc-900/80 backdrop-blur-xl border border-zinc-800 rounded-2xl p-8 shadow-2xl">

            {/* brand */}
            <div className="flex items-center gap-2.5 mb-8">
              <div className="w-8 h-8 bg-emerald-400 rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-zinc-900" fill="none" viewBox="0 0 16 16">
                  <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M8 1v14M2 4.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1" fill="none" strokeOpacity="0.6" />
                </svg>
              </div>
              <span className="font-mono text-base font-bold text-white tracking-tight">
                code<span className="text-emerald-400">sync</span>
              </span>
            </div>

            <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Join Session</h1>
            <p className="font-mono text-xs text-zinc-500 mb-7">// real-time collaborative editing</p>

            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                  Your handle
                </label>
                <input
                  type="text"
                  placeholder="e.g. ada_lovelace"
                  value={usernameInput}
                  name="username"
                  onChange={e => setUsernameInput(e.target.value)}
                  autoFocus
                  required
                  className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 font-mono outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] text-zinc-900 font-bold text-sm rounded-xl py-3 transition-all duration-150"
              >
                Enter Room →
              </button>
            </form>

            <p className="mt-6 text-center font-mono text-[10px] text-zinc-700">
              session · shared · live
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── EDITOR ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen bg-zinc-950 flex flex-col overflow-hidden">

      {/* TOPBAR */}
      <header className="h-12 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 gap-3 shrink-0">

        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 bg-emerald-400 rounded-md flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-zinc-900" fill="none" viewBox="0 0 16 16">
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.2" />
              <path d="M8 1v14M2 4.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1" fill="none" strokeOpacity="0.7" />
            </svg>
          </div>
          <span className="font-mono text-sm font-bold text-white tracking-tight">
            code<span className="text-emerald-400">sync</span>
          </span>
        </div>

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* Active file */}
        <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
          <LiveDot colorClass="bg-emerald-400" />
          session.js
        </div>

        <div className="flex-1" />

        {/* Connection */}
        <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-500">
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
          {connected ? 'live' : 'connecting…'}
        </div>

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* Clock */}
        <span className="font-mono text-xs text-zinc-600 tabular-nums">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>

        <div className="w-px h-5 bg-zinc-700 mx-1" />

        {/* User pill */}
        <div className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5">
          <Avatar name={username} size="sm" />
          <span className="text-xs font-semibold text-zinc-300 font-mono">{username}</span>
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside className="w-52 shrink-0 bg-zinc-900/50 border-r border-zinc-800 flex flex-col overflow-hidden">

          <div className="px-4 py-3 border-b border-zinc-800/60">
            <p className="text-[9px] font-bold tracking-[0.15em] uppercase text-zinc-600 mb-0.5">
              Collaborators
            </p>
            <div className="flex items-end gap-1.5">
              <span className="text-2xl font-bold text-white leading-none">{users.length}</span>
              <span className="text-xs text-zinc-500 mb-0.5 font-mono">online</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
            {users.length > 0 ? users.map((u, i) => {
              const color = getUserColor(u.name)
              const isMe = u.name === username
              return (
                <div
                  key={`${u.name}-${i}`}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-zinc-800/40 border border-zinc-800 hover:bg-zinc-800/70 transition-colors"
                >
                  <Avatar name={u.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">
                      {u.name}
                      {isMe && <span className="text-zinc-500 font-normal"> (you)</span>}
                    </p>
                    <p className="text-[10px] text-zinc-600 font-mono">editing</p>
                  </div>
                  <LiveDot colorClass={color.bg} />
                </div>
              )
            }) : (
              <p className="px-3 py-4 font-mono text-xs text-zinc-700 text-center leading-relaxed">
                // no one<br />else here yet
              </p>
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-zinc-800/60">
            <p className="font-mono text-[10px] text-zinc-700 text-center">
              changes sync in real-time
            </p>
          </div>
        </aside>

        {/* EDITOR PANE */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="h-9 bg-zinc-900/40 border-b border-zinc-800 flex items-end px-3 gap-1">
            <div className="flex items-center gap-2 h-7 px-3 bg-zinc-950 border border-zinc-800 border-b-zinc-950 rounded-t-md font-mono text-[11px] text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              session.js
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language="javascript"
              theme="vs-dark"
              defaultValue="// Write your code here"
              onMount={handleMount}
              options={{
                fontSize: 13.5,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontLigatures: true,
                lineHeight: 22,
                padding: { top: 16, bottom: 16 },
                minimap: { enabled: false },
                scrollbar: { verticalScrollbarSize: 3, horizontalScrollbarSize: 3 },
                overviewRulerLanes: 0,
                renderLineHighlight: 'line',
                cursorBlinking: 'smooth',
                smoothScrolling: true,
                cursorSmoothCaretAnimation: 'on',
              }}
            />
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <footer className="h-6 bg-emerald-500 flex items-center px-3 gap-3 shrink-0">
        <span className="font-mono text-[10.5px] font-semibold text-zinc-900 flex items-center gap-1.5">
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.5" />
            <circle cx="6" cy="6" r="2" fill="currentColor" fillOpacity="0.5" />
          </svg>
          JavaScript
        </span>
        <span className="w-px h-3 bg-zinc-900/20" />
        <span className="font-mono text-[10.5px] font-semibold text-zinc-900">UTF-8</span>
        <span className="w-px h-3 bg-zinc-900/20" />
        <span className="font-mono text-[10.5px] font-semibold text-zinc-900">
          {users.length} collaborator{users.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />
        <span className="font-mono text-[10.5px] font-semibold text-zinc-900">codesync · v1.0</span>
      </footer>
    </div>
  )
}
