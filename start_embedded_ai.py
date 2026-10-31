"""Run the local GGUF service on loopback. The web app remains independently usable."""
import os
import subprocess
import sys

if __name__ == '__main__':
    env=os.environ.copy()
    # Explicit provider/administrator settings retain precedence.
    if env.get('AI_ENABLED','1').lower() in ('1','true') and env.get('AI_PROVIDER','local')=='local' and not env.get('AI_BASE_URL'):
        env.update(AI_ENABLED='1',AI_PROVIDER='local',AI_MODEL='network-engineer',AI_BASE_URL='http://127.0.0.1:18081/v1')
        try:
            subprocess.Popen(['/opt/llama/llama-server','-m','/opt/models/network.gguf','--alias','network-engineer','--host','127.0.0.1','--port','18081','--ctx-size','16384','--parallel','1','--threads','1'],cwd='/opt/llama',env={'PATH':os.defpath,'LD_LIBRARY_PATH':'/opt/llama'},stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        except OSError as error:
            print(f"Embedded runtime failed to start: {error.strerror}", file=sys.stderr, flush=True)
            env["AI_ENABLED"]="0"
    os.execve(sys.executable,[sys.executable,'app.py'],env)
