"""Reproduce old-server packet corruption only in a disposable SQLite fixture."""
import os
import pathlib
import subprocess
import tempfile
BASE='c805c5dad15dc12552751580f9eeae9fbc614f66'
source=subprocess.run(['git','show',BASE+':api/routes/app_state.php'],check=True,stdout=subprocess.PIPE).stdout
with tempfile.TemporaryDirectory() as folder:
    target=pathlib.Path(folder,'old-app-state.php');target.write_bytes(source)
    subprocess.run(['php','tests/backend-grade-protocol-floor.php','--negative'],env=dict(os.environ,AUDIT_APP_STATE_SOURCE=str(target)),check=True)
