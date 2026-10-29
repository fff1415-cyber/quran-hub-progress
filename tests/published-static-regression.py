import importlib.util
spec=importlib.util.spec_from_file_location('static_check','scripts/verify-published-static.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
sha='a'*40
html=b'<script src="/assets/client-test.js"></script><link rel="stylesheet" href="/assets/site-test.css"><script src="/api/r.php"></script><script src="https://outside.example/test.js"></script>'
files={'/deploy-sha.txt':(sha.encode(),'text/plain'),'/index.html':(html,'text/html'),'/assets/client-test.js':(b'fixture','text/javascript'),'/assets/site-test.css':(b'fixture','text/css')}
seen=[]
def fetch(path,release):
    seen.append(path);assert release==sha;return files[path]
assert module.verify_static(sha,fetch)==2
assert seen==['/deploy-sha.txt','/index.html','/assets/client-test.js','/assets/site-test.css']
files['/assets/client-test.js']=(b'<html>fallback</html>','text/html')
try:module.verify_static(sha,fetch)
except ValueError:pass
else:raise AssertionError('HTML fallback was accepted as JavaScript')
files['/deploy-sha.txt']=(b'b'*40,'text/plain')
try:module.verify_static(sha,fetch)
except ValueError:pass
else:raise AssertionError('wrong published commit was accepted')
try:module.fetch_public_static('/api/r.php',sha)
except ValueError:pass
else:raise AssertionError('application route was requested')
print('PASS: static-only release verification rejects wrong commits, HTML fallbacks and application/API paths')
