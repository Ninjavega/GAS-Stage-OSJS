const {ServiceProvider} = require('@osjs/common');
let pty = null;
try {
  pty = require('node-pty');
} catch (e) {
  // node-pty optional fallback
}
const {spawn} = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const MAX_SESSIONS = 4;
const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_COLUMNS = 300;
const MAX_ROWS = 100;

class TerminalServiceProvider extends ServiceProvider {
  constructor(core, options) {
    super(core, options);
    this.sessions = new Set();
  }

  depends() {
    return ['osjs/express'];
  }

  async init() {
    this.core.app.ws('/terminal', (ws, req) => this.openSession(ws, req));
  }

  async destroy() {
    this.sessions.forEach(session => session.close());
    this.sessions.clear();
    super.destroy();
  }

  openSession(ws, req) {
    const origin = req.headers.origin;
    const fwdHost = req.headers['x-forwarded-host'];
    const host = req.headers.host;
    let sameOrigin = false;
    try {
      if (!origin) {
        sameOrigin = true;
      } else {
        const originHost = new URL(origin).host;
        sameOrigin = Boolean(
          originHost === host ||
          (fwdHost && originHost === fwdHost) ||
          originHost.includes('localhost') ||
          originHost.includes('127.0.0.1') ||
          originHost.endsWith('.run.app')
        );
      }
    } catch (error) {
      sameOrigin = true;
    }

    if (!sameOrigin) {
      ws.close(1008, 'Authenticated same-origin session required');
      return;
    }

    if (this.sessions.size >= MAX_SESSIONS) {
      ws.close(1013, 'Terminal session limit reached');
      return;
    }

    const config = this.core.configuration;
    const shell = process.env.SHELL || '/bin/bash';
    const rootDir = path.resolve(config.root);
    const vfsDir = path.resolve(rootDir, 'vfs/demo');
    const startCwd = fs.existsSync(vfsDir) ? vfsDir : rootDir;
    const bridgeScript = path.resolve(__dirname, '../pty_bridge.py');

    let processHandle;
    let isPtyBridge = false;

    try {
      if (fs.existsSync(bridgeScript)) {
        processHandle = spawn('python3', [
          bridgeScript,
          '80',
          '24',
          startCwd,
          shell
        ], {
          cwd: startCwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            HOME: startCwd,
            USER: (req.session && req.session.user && req.session.user.username) || 'demo',
            OSJS_ROOT: rootDir,
            OSJS_VFS: vfsDir,
            PATH: `${path.resolve(rootDir, 'bin')}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
          }
        });
        isPtyBridge = true;
      } else {
        processHandle = spawn(shell, ['-i'], {
          cwd: startCwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            HOME: startCwd,
            PATH: `${path.resolve(rootDir, 'bin')}:${process.env.PATH || '/usr/local/bin:/usr/bin:/bin'}`
          },
          stdio: ['pipe', 'pipe', 'pipe']
        });
      }
    } catch (error) {
      this.core.logger.error(error);
      ws.close(1011, 'Could not start terminal shell');
      return;
    }

    let closed = false;
    const session = {
      close: () => {
        if (closed) return;
        closed = true;
        this.sessions.delete(session);
        try {
          if (isPtyBridge && processHandle.stdin && !processHandle.stdin.destroyed) {
            processHandle.stdin.write(JSON.stringify({type: 'close'}) + '\n');
          }
          processHandle.kill('SIGTERM');
        } catch (error) {
          this.core.logger.warn(error);
        }
      }
    };

    const send = payload => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload));
      }
    };

    this.sessions.add(session);
    send({type: 'ready', cwd: startCwd});

    if (isPtyBridge) {
      let stdoutBuffer = '';
      processHandle.stdout.on('data', chunk => {
        stdoutBuffer += chunk.toString();
        while (stdoutBuffer.includes('\n')) {
          const lineIdx = stdoutBuffer.indexOf('\n');
          const line = stdoutBuffer.slice(0, lineIdx).trim();
          stdoutBuffer = stdoutBuffer.slice(lineIdx + 1);
          if (!line) continue;
          try {
            const packet = JSON.parse(line);
            send(packet);
          } catch (e) {
            send({type: 'output', data: line + '\r\n'});
          }
        }
      });
      processHandle.stderr.on('data', data => {
        send({type: 'output', data: data.toString()});
      });
      processHandle.on('close', (exitCode, signal) => {
        if (!closed) {
          send({type: 'exit', exitCode: exitCode || 0, signal});
          closed = true;
          this.sessions.delete(session);
          if (ws.readyState === 1) ws.close(1000, 'Shell exited');
        }
      });
    } else {
      processHandle.stdout.on('data', data => send({type: 'output', data: data.toString()}));
      processHandle.stderr.on('data', data => send({type: 'output', data: data.toString()}));
      processHandle.on('close', (exitCode, signal) => {
        if (!closed) {
          send({type: 'exit', exitCode, signal});
          closed = true;
          this.sessions.delete(session);
          if (ws.readyState === 1) ws.close(1000, 'Shell exited');
        }
      });
    }

    ws.on('message', rawMessage => {
      const message = String(rawMessage);
      if (Buffer.byteLength(message, 'utf8') > MAX_MESSAGE_BYTES) {
        ws.close(1009, 'Terminal message too large');
        session.close();
        return;
      }

      let packet;
      try {
        packet = JSON.parse(message);
      } catch (error) {
        ws.close(1003, 'Invalid terminal message');
        session.close();
        return;
      }

      if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
        ws.close(1003, 'Invalid terminal message');
        session.close();
        return;
      }

      if (isPtyBridge) {
        if (processHandle.stdin && !processHandle.stdin.destroyed) {
          processHandle.stdin.write(JSON.stringify(packet) + '\n');
        }
      } else {
        if (packet.type === 'input' && typeof packet.data === 'string') {
          if (processHandle.stdin && !processHandle.stdin.destroyed) {
            processHandle.stdin.write(packet.data);
          }
        } else if (packet.type === 'close') {
          session.close();
          ws.close(1000, 'Terminal closed');
        }
      }
    });

    ws.on('close', session.close);
    ws.on('error', session.close);
  }
}

module.exports = TerminalServiceProvider;
