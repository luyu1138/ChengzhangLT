#!/usr/bin/env python3
"""Build a locally signed installable release APK. Signing material stays outside Git."""
from pathlib import Path
import os, secrets, subprocess, shutil, hashlib

root = Path(__file__).resolve().parents[1]
tools = Path('/workspace/.tools')
env = os.environ.copy()
env.setdefault('JAVA_HOME', str(tools / 'java'))
if not env.get('BLUEPRINT_KEYSTORE'):
    signing = tools / 'signing'
    signing.mkdir(parents=True, exist_ok=True)
    signing.chmod(0o700)
    password_file = signing / 'local-release.password'
    if not password_file.exists():
        password_file.write_text(secrets.token_urlsafe(32))
        password_file.chmod(0o600)
    env['BLUEPRINT_STORE_PASSWORD'] = password_file.read_text().strip()
    env['BLUEPRINT_KEY_PASSWORD'] = env['BLUEPRINT_STORE_PASSWORD']
    env['BLUEPRINT_KEYSTORE'] = str(signing / 'blueprint-local-release.jks')
    env['BLUEPRINT_KEY_ALIAS'] = 'blueprint'
    if not Path(env['BLUEPRINT_KEYSTORE']).exists():
        subprocess.run([str(Path(env['JAVA_HOME']) / 'bin/keytool'), '-genkeypair', '-keystore', env['BLUEPRINT_KEYSTORE'],
            '-storepass:env', 'BLUEPRINT_STORE_PASSWORD', '-keypass:env', 'BLUEPRINT_KEY_PASSWORD', '-alias', 'blueprint',
            '-keyalg', 'RSA', '-keysize', '3072', '-validity', '3650', '-dname', 'CN=Growth Blueprint Local Distribution'], env=env, check=True)
        Path(env['BLUEPRINT_KEYSTORE']).chmod(0o600)
subprocess.run(['npm', 'run', 'build'], cwd=root, env=env, check=True)
subprocess.run(['bash', 'scripts/android.sh', 'assembleRelease', 'lintRelease'], cwd=root, env=env, check=True)
apk = root / 'releases/成长蓝图-v1.0.0.apk'
shutil.copy2(root / 'android/app/build/outputs/apk/release/app-release.apk', apk)
digest = hashlib.sha256(apk.read_bytes()).hexdigest()
(apk.parent / 'SHA256SUMS').write_text(digest + '  ' + apk.name + '\n')
print('Release APK:', apk)
print('SHA-256:', digest)
