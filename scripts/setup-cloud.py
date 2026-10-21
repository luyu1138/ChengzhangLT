#!/usr/bin/env python3
"""Idempotent SDK setup under /workspace; preserve artifact and TLS verification."""
from pathlib import Path
import hashlib, os, shutil, ssl, subprocess, tarfile, urllib.parse, urllib.request, zipfile

base=Path('/workspace/.tools')
downloads=base/'downloads'
downloads.mkdir(parents=True,exist_ok=True)
context=ssl.create_default_context()
cert=os.environ.get('CODEX_PROXY_CERT')
if cert and Path(cert).is_file(): context.load_verify_locations(cert)
def fetch(url,name):
    out=downloads/name
    with urllib.request.urlopen(url,context=context,timeout=120) as response, out.open('wb') as target:
        shutil.copyfileobj(response,target)
    return out
def verify(path,expected,algorithm='sha256'):
    digest=hashlib.new(algorithm)
    with path.open('rb') as source:
        for block in iter(lambda:source.read(1024*1024),b''):digest.update(block)
    if digest.hexdigest()!=expected:raise RuntimeError('Official artifact checksum mismatch: '+path.name)

java=base/'java'
if not (java/'bin/javac').is_file():
    candidates=sorted(base.glob('jdk-21.*/bin/javac'))
    if not candidates:
        archive=fetch('https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz','jdk.tar.gz')
        expected=fetch('https://download.oracle.com/java/21/latest/jdk-21_linux-x64_bin.tar.gz.sha256','jdk.sha256').read_text().split()[0]
        verify(archive,expected)
        with tarfile.open(archive) as package:package.extractall(base,filter='data')
        candidates=sorted(base.glob('jdk-21.*/bin/javac'))
    java.symlink_to(candidates[-1].parents[1],target_is_directory=True)

gradle=base/'gradle-8.13'
if not (gradle/'bin/gradle').is_file():
    archive=fetch('https://services.gradle.org/distributions/gradle-8.13-bin.zip','gradle.zip')
    verify(archive,'20f1b1176237254a6fc204d8434196fa11a4cfb387567519c61556e8710aed78')
    with zipfile.ZipFile(archive) as package:package.extractall(base)
(gradle/'bin/gradle').chmod(0o755)

sdk=base/'android-sdk'
sdkmanager=sdk/'cmdline-tools/19.0/bin/sdkmanager'
if not sdkmanager.is_file():
    archive=fetch('https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip','cmdline-tools.zip')
    # SHA-1 is the checksum published in Google's HTTPS repository manifest.
    verify(archive,'5fdcc763663eefb86a5b8879697aa6088b041e70','sha1')
    dest=sdk/'cmdline-tools';dest.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(archive) as package:package.extractall(dest)
    (dest/'cmdline-tools').rename(dest/'19.0')
for binary in sdkmanager.parent.iterdir():binary.chmod(0o755)
user=base/'android-user';user.mkdir(exist_ok=True)
trust=base/'java-cacerts'
shutil.copy2(java/'lib/security/cacerts',trust)
if cert and Path(cert).is_file():
    subprocess.run([str(java/'bin/keytool'),'-importcert','-noprompt','-alias','codex-egress-root','-file',cert,'-keystore',str(trust),'-storepass','changeit'],check=True)
env=os.environ.copy();env.update(JAVA_HOME=str(java),ANDROID_HOME=str(sdk),ANDROID_USER_HOME=str(user),JAVA_TOOL_OPTIONS='-Djavax.net.ssl.trustStore='+str(trust))
proxy=urllib.parse.urlsplit(env.get('HTTPS_PROXY',''))
args=[str(sdkmanager),'--sdk_root='+str(sdk)]
properties=['systemProp.javax.net.ssl.trustStore='+str(trust),'systemProp.http.nonProxyHosts=localhost|127.*|[::1]']
if proxy.hostname:
    args+=['--proxy=http','--proxy_host='+proxy.hostname,'--proxy_port='+str(proxy.port or 80)]
    for protocol in ('http','https'):properties+=['systemProp.'+protocol+'.proxyHost='+proxy.hostname,'systemProp.'+protocol+'.proxyPort='+str(proxy.port or 80)]
cache=base/'gradle-cache';cache.mkdir(exist_ok=True)
(cache/'gradle.properties').write_text('\n'.join(properties)+'\n')
subprocess.run(args+['--licenses'],input='y\n'*100,text=True,env=env,check=True,stdout=subprocess.DEVNULL)
subprocess.run(args+['platform-tools','platforms;android-35','build-tools;35.0.0'],env=env,check=True)
print('JDK 21, Gradle 8.13, Android SDK 35 ready under /workspace/.tools')
