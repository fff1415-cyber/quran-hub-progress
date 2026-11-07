"""Merge only the content-addressed assets from the pinned fallback build."""
import pathlib
import shutil
import sys

source, destination = (pathlib.Path(arg) / 'assets' for arg in sys.argv[1:3])
if not source.is_dir() or not destination.is_dir():
    raise SystemExit('Both release asset directories must exist')
for file in source.iterdir():
    if file.is_symlink() or not file.is_file():
        raise SystemExit('Unexpected fallback asset')
    target = destination / file.name
    if target.is_symlink() or (target.exists() and target.read_bytes() != file.read_bytes()):
        raise SystemExit('Different releases cannot publish different bytes to the same asset path')
    if not target.exists():
        shutil.copyfile(file, target)
