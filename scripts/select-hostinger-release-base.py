"""Select the actual published source as the API baseline; never guess after a failed push."""
import pathlib
import re
import subprocess
import sys


def select_release_base(repository, marker, head):
    base = marker.strip()
    if not re.fullmatch(r'[a-f0-9]{40}', base):
        raise ValueError('Published marker must identify a known full commit; upload has not started')
    root = pathlib.Path(repository).resolve()
    def git(*args):
        return subprocess.run(['git', '-C', str(root), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if git('cat-file', '-e', base + '^{commit}').returncode:
        raise ValueError('Published commit is unavailable; upload has not started')
    if git('merge-base', '--is-ancestor', base, head).returncode:
        raise ValueError('Published commit is outside the approved history; upload has not started')
    result = git('diff', '--quiet', base, head, '--', 'api/')
    if result.returncode not in [0, 1]:
        raise ValueError('Could not compare published API baseline; upload has not started')
    return {'base_sha': base, 'api_changed': 'true' if result.returncode else 'false'}


if __name__ == '__main__':
    for key, value in select_release_base(pathlib.Path.cwd(), sys.argv[1], sys.argv[2]).items():
        print(key + '=' + value)
