import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as TerminalIcon, Cpu, Globe, RefreshCw, Info, FolderSync, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import './index.css';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';
type KernelMode = 'host' | 'webvm';

interface TerminalProps {
  onClose: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({ onClose }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [kernelMode, setKernelMode] = useState<KernelMode>('host');
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [showArchitectureModal, setShowArchitectureModal] = useState(false);
  const [showVfsModal, setShowVfsModal] = useState(false);
  const [vfsFiles, setVfsFiles] = useState<string[]>([]);
  const [isLoadingVfs, setIsLoadingVfs] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const reconnect = useCallback(() => {
    setStatus('connecting');
    setConnectionAttempt(value => value + 1);
  }, []);

  // Fetch OS.js VFS files from the server
  const fetchVfsFiles = useCallback(async () => {
    setIsLoadingVfs(true);
    try {
      const res = await fetch('/vfs/read?path=home:/');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setVfsFiles(data.map((f: any) => (typeof f === 'string' ? f : f.filename || f.path)));
        }
      }
    } catch (e) {
      // Fallback
    } finally {
      setIsLoadingVfs(false);
    }
  }, []);

  // Create file in OS.js VFS
  const handleCreateVfsFile = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    try {
      const res = await fetch('/vfs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: `home:/${newFileName.trim()}`,
          data: newFileContent || 'Hello from OS.js Terminal Dual-Kernel Bridge!\n'
        })
      });
      if (res.ok) {
        setSyncNotice(`✓ File "${newFileName.trim()}" saved to OS.js VFS (home:/)`);
        setNewFileName('');
        setNewFileContent('');
        fetchVfsFiles();
        setTimeout(() => setSyncNotice(null), 4000);
      }
    } catch (e) {
      setSyncNotice('Note: File can also be created via Host shell: `osjs create <file>`');
      setTimeout(() => setSyncNotice(null), 4000);
    }
  }, [newFileName, newFileContent, fetchVfsFiles]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let active = true;
    const terminal = new XTerm({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 14,
      scrollback: 5000,
      theme: {
        background: '#090d11',
        foreground: '#d7e4e7',
        cursor: '#32d6df',
        selectionBackground: '#1b5260',
        black: '#101820',
        red: '#ff6b70',
        green: '#67e6a7',
        yellow: '#f6c45d',
        blue: '#65aaff',
        magenta: '#c69aff',
        cyan: '#53d9e6',
        white: '#d7e4e7',
        brightBlack: '#5e7078',
        brightRed: '#ff9296',
        brightGreen: '#91f0bd',
        brightYellow: '#ffda85',
        brightBlue: '#90c0ff',
        brightMagenta: '#d9baff',
        brightCyan: '#8aeaf2',
        brightWhite: '#ffffff'
      }
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(mount);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/terminal`);
    socketRef.current = socket;

    const sendResize = () => {
      try {
        fitAddon.fit();
      } catch (error) {
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      if (kernelMode === 'host') {
        sendResize();
      }
    });
    resizeObserver.observe(mount);

    const inputSubscription = terminal.onData(data => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'input', data }));
      }
    });

    socket.onopen = () => {
      if (!active) return;
      setStatus('connected');
      sendResize();
      terminal.focus();
    };

    socket.onmessage = event => {
      if (!active) return;
      try {
        const packet = JSON.parse(String(event.data));
        if (packet.type === 'ready') {
          setWorkingDirectory(packet.cwd || '');
        } else if (packet.type === 'output') {
          terminal.write(packet.data || '');
        } else if (packet.type === 'exit') {
          terminal.write(`\r\n[Shell exited with code ${packet.exitCode}]\r\n`);
        }
      } catch (error) {
        terminal.write('\r\n[Invalid response from terminal server]\r\n');
      }
    };

    socket.onerror = () => {
      if (active) setStatus('disconnected');
    };

    socket.onclose = () => {
      if (active) {
        setStatus('disconnected');
        terminal.write('\r\n[Connection closed. Use Reconnect to start a new shell.]\r\n');
      }
    };

    return () => {
      active = false;
      resizeObserver.disconnect();
      inputSubscription.dispose();
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000, 'Terminal window closed');
      }
      terminalRef.current = null;
      terminal.dispose();
    };
  }, [connectionAttempt]);

  // When switching back to host, re-fit and focus terminal
  useEffect(() => {
    if (kernelMode === 'host' && fitAddonRef.current && terminalRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          terminalRef.current?.focus();
        } catch (e) {
          // ignore
        }
      }, 50);
    }
  }, [kernelMode]);

  return (
    <div className="osjs-terminal">
      <header className="osjs-terminal__toolbar">
        <div className="osjs-terminal__identity">
          <span className="osjs-terminal__mark" aria-hidden="true">&gt;_</span>
          <div>
            <div className="flex items-center gap-2">
              <strong>Terminal</strong>
              <div className="osjs-kernel-switcher">
                <button
                  type="button"
                  className={`osjs-kernel-btn ${kernelMode === 'host' ? 'osjs-kernel-btn--active' : ''}`}
                  onClick={() => setKernelMode('host')}
                  title="Host Shell: Direct access to OS.js Core, POSIX PTY & VFS"
                >
                  <Cpu size={12} className="inline mr-1" />
                  Host Shell (OS.js Core)
                </button>
                <button
                  type="button"
                  className={`osjs-kernel-btn ${kernelMode === 'webvm' ? 'osjs-kernel-btn--active' : ''}`}
                  onClick={() => setKernelMode('webvm')}
                  title="WebVM: CheerpX Virtualized x86 Linux Kernel"
                >
                  <Globe size={12} className="inline mr-1" />
                  WebVM Kernel (CheerpX)
                </button>
              </div>
            </div>
            <span className="osjs-terminal__cwd" title={workingDirectory}>
              {kernelMode === 'host'
                ? (workingDirectory ? `vfs: ${workingDirectory}` : 'Connecting to OS.js POSIX PTY…')
                : 'WebVM Linux Kernel Passthrough (CheerpX Debian/WASM)'}
            </span>
          </div>
        </div>

        <div className="osjs-terminal__actions">
          {kernelMode === 'host' ? (
            <span className={`osjs-terminal__status osjs-terminal__status--${status}`}>
              <span />{status}
            </span>
          ) : (
            <span className="osjs-terminal__status osjs-terminal__status--connected">
              <span />virtualized
            </span>
          )}

          {kernelMode === 'host' && status === 'disconnected' && (
            <button type="button" onClick={reconnect} className="flex items-center gap-1">
              <RefreshCw size={11} /> Reconnect
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setShowVfsModal(true);
              fetchVfsFiles();
            }}
            className="flex items-center gap-1"
            title="Inspect and Sync with OS.js Virtual File System"
          >
            <FolderSync size={11} /> VFS Bridge
          </button>

          <button
            type="button"
            onClick={() => setShowArchitectureModal(true)}
            className="flex items-center gap-1"
            title="View Dual-Kernel Architecture"
          >
            <Info size={11} /> Dual-Kernel
          </button>

          <button type="button" onClick={onClose} aria-label="Close Terminal">
            Close
          </button>
        </div>
      </header>

      {/* Main Terminal Screen Area */}
      <div className="osjs-terminal__workspace">
        {/* Host Shell (POSIX PTY) View */}
        <div
          className="osjs-terminal__screen"
          ref={mountRef}
          style={{ display: kernelMode === 'host' ? 'block' : 'none' }}
          onMouseDown={() => terminalRef.current?.focus()}
          aria-label="Interactive shell terminal"
        />

        {/* WebVM Kernel Passthrough View */}
        {kernelMode === 'webvm' && (
          <div className="osjs-webvm-container">
            <div className="osjs-webvm-banner">
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-cyan-400" />
                <span className="font-semibold text-xs text-slate-200">
                  LeaningTech WebVM (CheerpX Virtualized x86 Linux)
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Client-side Kernel
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  Full x86 binary emulation without host overhead
                </span>
                <button
                  type="button"
                  className="osjs-webvm-action-btn"
                  onClick={() => window.open('https://webvm.io/', '_blank', 'noopener,noreferrer')}
                >
                  Pop Out
                </button>
              </div>
            </div>
            <iframe
              src="https://webvm.io/"
              title="LeaningTech WebVM Linux Terminal"
              className="osjs-webvm-iframe"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
        )}
      </div>

      {/* Architecture Info Modal */}
      {showArchitectureModal && (
        <div className="osjs-modal-backdrop" onClick={() => setShowArchitectureModal(false)}>
          <div className="osjs-modal" onClick={e => e.stopPropagation()}>
            <div className="osjs-modal__header">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu size={16} className="text-cyan-400" />
                OS.js Dual-Kernel Terminal Architecture
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-white"
                onClick={() => setShowArchitectureModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="osjs-modal__body text-xs text-slate-300 space-y-4">
              <div className="p-3 bg-slate-900/80 rounded border border-slate-700">
                <h4 className="font-semibold text-cyan-300 mb-1 flex items-center gap-1.5">
                  <TerminalIcon size={13} /> 1. Host Kernel (OS.js Core & VFS)
                </h4>
                <p className="text-slate-300 mb-2">
                  Powered by a real POSIX PTY bridge in the Node.js backend. You get an authentic interactive bash shell with full ANSI colors, cursor control, autocomplete, and signals.
                </p>
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li><strong>Live VFS Mount:</strong> Runs in <code className="text-yellow-300">/app/applet/vfs/demo</code> (<code className="text-yellow-300">home:/</code>).</li>
                  <li><strong>OS.js CLI:</strong> Run <code className="text-green-300">osjs apps</code>, <code className="text-green-300">osjs status</code>, or <code className="text-green-300">osjs create &lt;file&gt;</code> directly from bash.</li>
                  <li><strong>Real-time Sync:</strong> Files created in the terminal appear instantly in OS.js File Manager and Textpad.</li>
                </ul>
              </div>

              <div className="p-3 bg-slate-900/80 rounded border border-slate-700">
                <h4 className="font-semibold text-emerald-300 mb-1 flex items-center gap-1.5">
                  <Globe size={13} /> 2. WebVM Kernel (CheerpX Virtual Linux)
                </h4>
                <p className="text-slate-300 mb-2">
                  Powered by LeaningTech's WebVM engine. Runs an unmodified Debian Linux distribution entirely client-side using WebAssembly and an x86 system call emulator.
                </p>
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li><strong>Sandboxed execution:</strong> Test experimental software without affecting the host container.</li>
                  <li><strong>Network & Packages:</strong> Supports networking and custom toolchains directly in the browser.</li>
                  <li><strong>VFS Bridge:</strong> Use the VFS Bridge toolbar button to exchange files with OS.js <code className="text-yellow-300">home:/</code>.</li>
                </ul>
              </div>
            </div>
            <div className="osjs-modal__footer">
              <button
                type="button"
                className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-medium"
                onClick={() => setShowArchitectureModal(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VFS Bridge Modal */}
      {showVfsModal && (
        <div className="osjs-modal-backdrop" onClick={() => setShowVfsModal(false)}>
          <div className="osjs-modal" onClick={e => e.stopPropagation()}>
            <div className="osjs-modal__header">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderSync size={16} className="text-cyan-400" />
                OS.js VFS File Bridge (home:/)
              </h3>
              <button
                type="button"
                className="text-slate-400 hover:text-white"
                onClick={() => setShowVfsModal(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="osjs-modal__body text-xs text-slate-300 space-y-4">
              <p className="text-slate-400">
                Files stored in <code className="text-cyan-300">home:/</code> are shared between the Terminal, File Manager, Textpad, and Draw apps.
              </p>

              {syncNotice && (
                <div className="p-2 bg-emerald-950/80 border border-emerald-700 text-emerald-300 rounded text-xs">
                  {syncNotice}
                </div>
              )}

              <form onSubmit={handleCreateVfsFile} className="space-y-2 bg-slate-900/60 p-3 rounded border border-slate-800">
                <span className="font-semibold text-slate-200 block">Create File in OS.js VFS:</span>
                <input
                  type="text"
                  placeholder="filename.txt"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                />
                <textarea
                  placeholder="File content..."
                  value={newFileContent}
                  onChange={e => setNewFileContent(e.target.value)}
                  rows={3}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs"
                >
                  Save to VFS
                </button>
              </form>

              <div>
                <span className="font-semibold text-slate-300 block mb-1">
                  Current files in home:/ ({isLoadingVfs ? 'Loading…' : `${vfsFiles.length} item(s)`}):
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1 bg-slate-950/80 p-2 rounded border border-slate-800 font-mono text-[11px]">
                  {vfsFiles.length === 0 ? (
                    <span className="text-slate-500">No custom files yet. Use the form above or type `osjs create notes.txt` in the terminal!</span>
                  ) : (
                    vfsFiles.map((file, i) => (
                      <div key={i} className="text-cyan-300 flex items-center justify-between">
                        <span>📄 {file}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="osjs-modal__footer">
              <button
                type="button"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs"
                onClick={() => setShowVfsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
