import glob, os
from PIL import Image, ImageChops
d = os.environ['OUT'] + '/px'
for a in sorted(glob.glob(d + '/once-*.png')):
    name = os.path.basename(a)[5:]
    for lab in ['sonra', 'once2']:
        b = f'{d}/{lab}-{name}'
        A, B = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
        if A.size != B.size:
            print(f'{lab:6} {name:55} BOYUT FARKLI {A.size} -> {B.size}'); continue
        diff = ImageChops.difference(A, B); bbox = diff.getbbox()
        if not bbox: print(f'{lab:6} {name:55} AYNI'); continue
        px = sum(1 for p in diff.getdata() if max(p) > 8); mx = max(max(p) for p in diff.getdata())
        print(f'{lab:6} {name:55} FARK bbox={bbox} piksel(>8)={px} maxdelta={mx}')
