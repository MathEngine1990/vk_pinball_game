import sys, pathlib, subprocess, json, math, array
sys.path.insert(0,str(pathlib.Path('tmp/audio-tools').resolve()))
import imageio_ffmpeg
ff=imageio_ffmpeg.get_ffmpeg_exe()
root=pathlib.Path('public/audio/music'); out=pathlib.Path('public/audio/runtime');out.mkdir(parents=True,exist_ok=True)
manifest={'chunkSeconds':12,'tracks':[],'menu':'menu.m4a'}
report=[]
def decode(p):
 return subprocess.check_output([ff,'-v','error','-i',str(p),'-f','s16le','-ac','2','-ar','32000','pipe:1'])
def encode(pcm,dest):
 if dest.exists() and dest.stat().st_size>0:return
 subprocess.run([ff,'-v','error','-y','-f','s16le','-ar','32000','-ac','2','-i','pipe:0','-c:a','aac','-b:a','96k','-movflags','+faststart',str(dest)],input=pcm,check=True)
for folder in sorted(root.glob('track-*')):
 stems={}
 for role in ['drums','bass','other']:
  files=list(folder.glob('*_'+role+'.m4a'))
  if files:stems[role]=decode(files[0])
 lengths={r:len(b)//4 for r,b in stems.items()}
 if max(lengths.values())-min(lengths.values())>3200:raise Exception('Stem duration mismatch '+str(lengths))
 samples=min(lengths.values());duration=samples/32000
 folderout=out/folder.name;folderout.mkdir(exist_ok=True)
 count=math.ceil(duration/12)
 # Apply one common safety gain to preserve the relative mix, not per-stem normalization.
 arrays=[array.array('h',b[:samples*4]) for b in stems.values()]
 peak=max(abs(sum(v)) for v in zip(*arrays))/32768
 gain=min(1,.88/max(peak,.001))
 for role,pcm in stems.items():
  values=array.array('h',pcm[:samples*4]);values=array.array('h',(int(v*gain) for v in values));pcm=values.tobytes()
  for n in range(count):encode(pcm[n*12*32000*4:min(samples,(n+1)*12*32000)*4],folderout/(role+'-'+str(n)+'.m4a'))
 manifest['tracks'].append({'id':folder.name,'duration':duration,'roles':list(stems),'chunks':count})
 report.append({'id':folder.name,'seconds':{r:n/32000 for r,n in lengths.items()},'commonGain':gain,'mixPeakBefore':peak})
 print(report[-1],flush=True)
subprocess.run([ff,'-v','error','-y','-i',str(root/'menu.mp3'),'-vn','-c:a','aac','-b:a','96k','-ar','32000','-movflags','+faststart',str(out/'menu.m4a')],check=True)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
pathlib.Path('outputs/audio-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
