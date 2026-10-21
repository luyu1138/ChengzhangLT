#!/usr/bin/env python3
"""Host tests for native rules, official OSS V4 compatibility, transport and TS recovery."""
from pathlib import Path
import hashlib, os, subprocess, tempfile, urllib.request

root = Path(__file__).resolve().parents[1]
cache = Path('/workspace/.tools/native-test-jars')
cache.mkdir(parents=True, exist_ok=True)
artifacts = [
    ('json.jar', 'org/json/json/20240303/json-20240303.jar', '3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed'),
    ('oss-sdk.jar', 'com/aliyun/oss/aliyun-sdk-oss/3.18.3/aliyun-sdk-oss-3.18.3.jar', '61bf08359797e36895265a1d062c89e95185169b8aeb58fe921bf01f08ca481c'),
    ('codec.jar', 'commons-codec/commons-codec/1.15/commons-codec-1.15.jar', 'b3e9f6d63a790109bf0d056611fbed1cf69055826defeb9894a71369d246ed63'),
]
for name, path, digest in artifacts:
    destination = cache / name
    if not destination.exists():
        with urllib.request.urlopen('https://repo.maven.apache.org/maven2/' + path, timeout=30) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != digest:
            raise RuntimeError('Download checksum mismatch: ' + name)
        destination.write_bytes(data)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Cached artifact checksum mismatch: ' + name)
java = Path(os.environ.get('JAVA_HOME', '/workspace/.tools/java')) / 'bin'
classpath = os.pathsep.join(str(cache / name) for name, _, _ in artifacts)
source = root / 'android/app/src/main/java/cn/chengzhang/blueprint'
classes = ['OssConfig', 'OssSigner', 'OssClient', 'PortableBackup', 'ReminderRules']
with tempfile.TemporaryDirectory(prefix='blueprint-native-') as temporary:
    out = Path(temporary)
    subprocess.run([str(root / 'node_modules/.bin/tsx'), 'tests/native-interop.ts', 'prepare', temporary], cwd=root, check=True)
    subprocess.run([str(java / 'javac'), '-encoding', 'UTF-8', '-cp', classpath, '-d', temporary,
        *[str(source / (name + '.java')) for name in classes], str(root / 'tests/native/NativeLogicTest.java')], check=True)
    subprocess.run([str(java / 'java'), '-cp', temporary + os.pathsep + classpath, 'cn.chengzhang.blueprint.NativeLogicTest', temporary], check=True)
    subprocess.run([str(root / 'node_modules/.bin/tsx'), 'tests/native-interop.ts', 'verify', temporary], cwd=root, check=True)
