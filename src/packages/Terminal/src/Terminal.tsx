import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './index.css';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface TerminalProps {
  onClose: () => void;
}

export const Terminal: React.FC<TerminalProps> = ({onClose}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [connectionAttempt, setConnectionAttempt] = useState(0);

  const reconnect = useCallback(() => {
    setStatus('connecting');
    setConnectionAttempt(value => value + 1);
  }, []);

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

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/terminal`);

    const sendResize = () => {
      try {
        fitAddon.fit();
      } catch (error) {
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({type: 'resize', cols: terminal.cols, rows: terminal.rows}));
      }
    };

    const resizeObserver = new ResizeObserver(sendResize);
    resizeObserver.observe(mount);

    const inputSubscription = terminal.onData(data => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({type: 'input', data}));
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

  return (
    <div className="osjs-terminal">
      <header className="osjs-terminal__toolbar">
        <div className="osjs-terminal__identity">
          <span className="osjs-terminal__mark" aria-hidden="true">&gt;_</span>
          <div>
            <strong>Terminal</strong>
            <span className="osjs-terminal__cwd" title={workingDirectory}>
              {workingDirectory || 'Starting shell…'}
            </span>
          </div>
        </div>
        <div className="osjs-terminal__actions">
          <span className={`osjs-terminal__status osjs-terminal__status--${status}`}>
            <span />{status}
          </span>
          {status === 'disconnected' && (
            <button type="button" onClick={reconnect}>Reconnect</button>
          )}
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </header>
      <div
        className="osjs-terminal__screen"
        ref={mountRef}
        onMouseDown={() => terminalRef.current?.focus()}
        aria-label="Interactive shell terminal"
      />
    </div>
  );
};
