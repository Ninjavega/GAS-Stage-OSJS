#!/usr/bin/env python3
import sys
import os
import pty
import select
import termios
import struct
import fcntl
import json
import signal

def set_winsize(fd, rows, cols):
    try:
        rows = max(1, min(300, int(rows)))
        cols = max(1, min(500, int(cols)))
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except Exception:
        pass

def main():
    cols = int(sys.argv[1]) if len(sys.argv) > 1 else 80
    rows = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    cwd = sys.argv[3] if len(sys.argv) > 3 else os.getcwd()
    shell = sys.argv[4] if len(sys.argv) > 4 else os.environ.get('SHELL', '/bin/bash')

    master, slave = pty.openpty()
    set_winsize(master, rows, cols)

    child_pid = os.fork()
    if child_pid == 0:
        os.close(master)
        os.setsid()
        try:
            fcntl.ioctl(slave, termios.TIOCSCTTY, 0)
        except Exception:
            pass

        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)

        os.environ['TERM'] = 'xterm-256color'
        os.environ['COLORTERM'] = 'truecolor'
        os.environ['LANG'] = 'C.UTF-8'
        bin_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../bin'))
        os.environ['PATH'] = f"{bin_dir}:{os.environ.get('PATH', '/usr/local/bin:/usr/bin:/bin')}"
        os.environ['PS1'] = '\\[\\033[01;32m\\]osjs@cloud\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ '

        try:
            if os.path.isdir(cwd):
                os.chdir(cwd)
        except Exception:
            pass

        rcfile = os.path.join(cwd, '.bashrc')
        if not os.path.exists(rcfile):
            rcfile = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../vfs/demo/.bashrc'))
        if os.path.exists(rcfile):
            os.execv(shell, [shell, '--rcfile', rcfile, '-i'])
        else:
            os.execv(shell, [shell, '-i'])
        sys.exit(1)

    os.close(slave)

    # Put stdin in non-blocking mode
    fcntl.fcntl(sys.stdin.fileno(), fcntl.F_SETFL, os.O_NONBLOCK)
    fcntl.fcntl(master, fcntl.F_SETFL, os.O_NONBLOCK)

    stdin_buf = ""
    alive = True

    while alive:
        try:
            rlist, _, _ = select.select([sys.stdin.fileno(), master], [], [], 0.05)
        except (select.error, InterruptedError):
            continue

        # Check if child process is still alive
        pid, status = os.waitpid(child_pid, os.WNOHANG)
        if pid == child_pid:
            exit_code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else 0
            # Read remaining output
            try:
                remaining = os.read(master, 65536)
                if remaining:
                    out = json.dumps({"type": "output", "data": remaining.decode("utf-8", "replace")})
                    sys.stdout.write(out + "\n")
                    sys.stdout.flush()
            except Exception:
                pass
            sys.stdout.write(json.dumps({"type": "exit", "exitCode": exit_code}) + "\n")
            sys.stdout.flush()
            break

        for fd in rlist:
            if fd == master:
                try:
                    data = os.read(master, 16384)
                    if not data:
                        alive = False
                        break
                    out = json.dumps({"type": "output", "data": data.decode("utf-8", "replace")})
                    sys.stdout.write(out + "\n")
                    sys.stdout.flush()
                except (OSError, IOError):
                    alive = False
                    break

            elif fd == sys.stdin.fileno():
                try:
                    chunk = sys.stdin.read()
                    if not chunk:
                        alive = False
                        break
                    stdin_buf += chunk
                    while "\n" in stdin_buf:
                        line, stdin_buf = stdin_buf.split("\n", 1)
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            msg = json.loads(line)
                            mtype = msg.get("type")
                            if mtype == "input":
                                raw = msg.get("data", "").encode("utf-8")
                                os.write(master, raw)
                            elif mtype == "resize":
                                set_winsize(master, msg.get("rows", 24), msg.get("cols", 80))
                                os.kill(child_pid, signal.SIGWINCH)
                            elif mtype == "close":
                                alive = False
                                break
                        except Exception:
                            pass
                except (OSError, IOError):
                    pass

    try:
        os.close(master)
    except Exception:
        pass
    try:
        os.kill(child_pid, signal.SIGTERM)
    except Exception:
        pass

if __name__ == '__main__':
    main()
