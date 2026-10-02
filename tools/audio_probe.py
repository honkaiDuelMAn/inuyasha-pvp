"""Compile an observation-only bridge for the real browser audio regression."""
import argparse
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--java',type=Path,required=True)
parser.add_argument('--ffdec',type=Path,required=True)
args=parser.parse_args()
scratch=ROOT/'scratch/audio'
scratch.mkdir(parents=True,exist_ok=True)
source=scratch/'probe.as'
source.write_text((ROOT/'flash/pvp.as').read_text(encoding='utf8')+'\n'+(ROOT/'tests/fixtures/audio-probe.as').read_text(encoding='utf8'),encoding='utf8')
output=scratch/'pvp-audio-probe.swf'
if output.exists():output.unlink()
result=subprocess.run([str(args.java),'-Djava.awt.headless=true','-jar',str(args.ffdec),'-replace',str(ROOT/'public/game/pvp-bridge.swf'),str(output),r'\frame_1\DoAction',str(source)],capture_output=True,text=True)
(scratch/'compiler.log').write_text(result.stdout+result.stderr,encoding='utf8')
if result.returncode or not output.exists():raise RuntimeError('Probe compilation failed')
print(output)
