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
    const env = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      HOME: process.env.HOME || os.homedir(),
      USER: process.env.USER || (os.userInfo ? os.userInfo().username : 'user'),
      LOGNAME: process.env.LOGNAME || process.env.USER || (os.userInfo ? os.userInfo().username : 'user'),
      SHELL: shell,
      LANG: process.env.LANG || 'C.UTF-8',
      TERM: 'xterm-256color'
    };

    let processHandle;
    let isPty = false;
    try {
      if (pty && typeof pty.spawn === 'function') {
        processHandle = pty.spawn(shell, ['-l'], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: path.resolve(config.root),
          env
        });
        isPty = true;
      } else {
        processHandle = spawn(shell, ['-i'], {
          cwd: path.resolve(config.root),
          env,
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
          processHandle.kill();
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
    send({type: 'ready', cwd: path.resolve(config.root)});

    if (isPty) {
      processHandle.onData(data => send({type: 'output', data}));
      processHandle.onExit(({exitCode, signal}) => {
        if (!closed) {
          send({type: 'exit', exitCode, signal});
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

      if (packet.type === 'input' && typeof packet.data === 'string') {
        if (isPty) {
          processHandle.write(packet.data);
        } else if (processHandle.stdin && !processHandle.stdin.destroyed) {
          processHandle.stdin.write(packet.data);
        }
      } else if (packet.type === 'resize') {
        if (isPty && typeof processHandle.resize === 'function') {
          const cols = Math.max(20, Math.min(MAX_COLUMNS, Math.floor(Number(packet.cols) || 80)));
          const rows = Math.max(8, Math.min(MAX_ROWS, Math.floor(Number(packet.rows) || 24)));
          processHandle.resize(cols, rows);
        }
      } else if (packet.type === 'close') {
        session.close();
        ws.close(1000, 'Terminal closed');
      }
    });

    ws.on('close', session.close);
    ws.on('error', session.close);
  }
}

module.exports = TerminalServiceProvider;
