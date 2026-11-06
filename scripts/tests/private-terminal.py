"""Synthetic PTY acceptance: never connects to MySQL and never uses actual credentials."""
import os, pathlib, pty, select, shutil, subprocess, tempfile, termios, time

base=pathlib.Path(__file__).resolve().parent.parent
php=shutil.which('php')
if not php: raise SystemExit('PHP required')

def terminal_run(script, arguments, replies):
    master,slave=pty.openpty();before=termios.tcgetattr(slave)
    process=subprocess.Popen([php,'-d','disable_functions=shell_exec,system','-d','display_errors=1',str(script),*arguments],stdin=slave,stdout=slave,stderr=slave,close_fds=True)
    output=b'';sent=0;deadline=time.monotonic()+15
    try:
        while time.monotonic()<deadline:
            ready,_,_=select.select([master],[],[],0.1)
            if ready:
                try: chunk=os.read(master,8192)
                except OSError: chunk=b''
                output+=chunk
            if sent<len(replies) and replies[sent][0] in output:
                os.write(master,replies[sent][1]);sent+=1
            if process.poll() is not None:
                while select.select([master],[],[],0)[0]:
                    try: chunk=os.read(master,8192)
                    except OSError: break
                    if not chunk: break
                    output+=chunk
                break
        else: raise AssertionError('Terminal check timed out')
        after=termios.tcgetattr(slave)
        assert (before[3] & (termios.ECHO|termios.ECHONL))==(after[3] & (termios.ECHO|termios.ECHONL)), 'Terminal echo was not restored'
        return process.returncode,output
    finally:
        if process.poll() is None: process.kill();process.wait()
        termios.tcsetattr(slave,termios.TCSANOW,before);os.close(master);os.close(slave)

with tempfile.TemporaryDirectory(prefix='qhp-terminal-') as folder:
    folder=pathlib.Path(folder)
    old=(base/'tests/fixtures/private-setter-v1.php').read_text()
    old=old.replace('declare(strict_types=1);',"declare(strict_types=1);\nconst QHP_DEFAULT_TEST_HOST='127.0.0.1';\nconst QHP_PRODUCTION_USER_SHA256='not-a-real-user-hash';",1)
    (folder/'old.php').write_text(old);shutil.copyfile(base/'private-test-config.php',folder/'private-test-config.php');(folder/'msht-test.php').write_text('')
    os.chmod(folder,0o700);os.chmod(folder/'msht-test.php',0o600)
    status,out=terminal_run(folder/'old.php',[],[(b'Test database host',b'\n'),(b'Test database username',b'fixture-test-user\n')])
    assert status!=0 and b'undefined function shell_exec' in out and b'Test password (hidden):' not in out
    print('PASS: prior helper reproduces exit immediately after username when shell_exec/system are disabled')

token=b'QHP_SYNTHETIC_TERMINAL_CHECK'
status,out=terminal_run(base/'configure-private-test.php',['--terminal-check'],[(b'Hidden terminal check: ',token+b'\n')])
assert status==0 and b'terminal_check_ok' in out and token not in out
print('PASS: corrected helper uses inherited terminal stdin, hides synthetic input with disabled legacy functions and restores echo')
status,out=terminal_run(base/'configure-private-test.php',['--terminal-check'],[(b'Hidden terminal check: ',b'\x04')])
assert status!=0 and b'input_ended_before_password' in out
print('PASS: terminal EOF produces an explicit safe error and restores echo')
process=subprocess.run([php,str(base/'configure-private-test.php'),'--terminal-check'],input=b'',capture_output=True)
assert process.returncode!=0 and b'interactive_terminal_required' in process.stdout and b'Hidden terminal check:' not in process.stdout
print('PASS: noninteractive stdin is refused before reading a password')
