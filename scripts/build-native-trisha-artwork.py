#!/usr/bin/env python3
"""Rebuild bounded native dock artwork from the existing Trisha waving GIF.
Requires Pillow. No network calls or source asset changes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument('--source',type=Path,required=True)
p.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'assets/brand')
p.add_argument('--sync-native',action='store_true')
args = p.parse_args()
source=args.source.resolve()
im=Image.open(source)
assert im.format=='GIF' and im.n_frames>1
assert im.size==(480,600), 'Review crop if upstream dimensions changed'
args.output.mkdir(parents=True,exist_ok=True)
frames=[];durations=[]
def raster(frame):
    rgba=frame.convert('RGBA').crop((0,0,480,480)).resize((96,96),Image.Resampling.LANCZOS)
    opaque=Image.alpha_composite(Image.new('RGBA',rgba.size,(243,237,255,255)),rgba).convert('RGB')
    opaque.info.clear()
    return opaque
for i in range(0,im.n_frames,3):
    duration=0
    for j in range(i,min(i+3,im.n_frames)):
        im.seek(j);duration+=im.info.get('duration',40)
    im.seek(i)
    frame=raster(im).quantize(colors=128,method=Image.Quantize.MEDIANCUT)
    frame.info.clear()
    frames.append(frame);durations.append(duration)
gif=args.output/'trisha-waving.gif'
frames[0].save(gif,save_all=True,append_images=frames[1:],duration=durations,loop=0,optimize=True,disposal=2)
im.seek(min(99,im.n_frames-1));raster(im).save(args.output/'trisha-waving-still.png')
manifest={
    'source':'trashed-app/public/images/trisha-avatar-smiling.gif',
    'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'transform':'RGBA upper square crop (0,0,480,480); Lanczos96px; alpha composite onto #f3edff before RGB quantization; every3frames accumulated durations;128colors',
    'frames':len(frames),'durationMs':sum(durations),'fileBytes':gif.stat().st_size,
    'motionPreference':'freeze on representative waving still when Reduce Motion/animator disabled','matte':'#f3edff',
}
(args.output/'trisha-waving.json').write_text(json.dumps(manifest,indent=2))
check=Image.open(gif)
assert check.size==(96,96) and check.n_frames==len(frames)
assert check.convert('RGB').getpixel((0,0))==(243,237,255), 'Alpha must not expose the source chroma-key color'
assert gif.stat().st_size<512*1024
if args.sync_native:
    root=Path(__file__).resolve().parents[1]
    for target in [root/'ios/App/App/Brand',root/'android/app/src/main/assets/brand']:
        target.mkdir(parents=True,exist_ok=True)
        for name in ['trisha-waving.gif','trisha-waving-still.png','trisha-waving.json']:
            shutil.copyfile(args.output/name,target/name)
            assert (args.output/name).read_bytes()==(target/name).read_bytes()
print(json.dumps(manifest,indent=2))
