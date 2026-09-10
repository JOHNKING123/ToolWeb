"""Build local relief assets from AWS Open Data Terrarium elevation tiles.

Requires numpy and Pillow. Run from any directory; downloaded tiles are cached
outside the repository. Source: https://registry.opendata.aws/terrain-tiles/
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import io
import json
import math
import tempfile
import urllib.request
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'mock_file/china-relief/assets'
CACHE = Path(tempfile.gettempdir()) / 'toolweb-terrarium'
CACHE.mkdir(exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
ZOOM = 6
WEST, EAST, SOUTH, NORTH = 70, 138, 15, 56
def px(lon):
    return (lon + 180) / 360 * 256 * 2**ZOOM
def py(lat):
    return (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 256 * 2**ZOOM
x0, x1 = int(px(WEST)), int(px(EAST))
y0, y1 = int(py(NORTH)), int(py(SOUTH))
tx0, tx1, ty0, ty1 = x0//256, x1//256, y0//256, y1//256
tiles = [(x,y) for y in range(ty0,ty1+1) for x in range(tx0,tx1+1)]
def tile(pair):
    x,y = pair
    path = CACHE / f'{ZOOM}-{x}-{y}.png'
    if not path.exists():
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png'
        for attempt in range(3):
            try:
                with urllib.request.urlopen(url, timeout=40) as r:
                    data = r.read()
                Image.open(io.BytesIO(data)).verify()
                path.write_bytes(data)
                break
            except Exception:
                if attempt == 2:
                    raise
    return x, y, Image.open(path).convert('RGB')
mosaic = Image.new('RGB', ((tx1-tx0+1)*256,(ty1-ty0+1)*256))
with ThreadPoolExecutor(max_workers=10) as pool:
    for i,(x,y,img) in enumerate(pool.map(tile, tiles)):
        mosaic.paste(img,((x-tx0)*256,(y-ty0)*256))
        if i % 20 == 0:
            print(f'Elevation tiles: {i+1}/{len(tiles)}', flush=True)
data = np.asarray(mosaic.crop((x0-tx0*256,y0-ty0*256,x1-tx0*256,y1-ty0*256))).astype(np.float32)
h = data[:,:,0]*256 + data[:,:,1] + data[:,:,2]/256 - 32768
# Encode signed elevations as uint16 offset by 32768; avoid RGB interpolation.
grid = np.asarray(Image.fromarray(h).resize((900,700),Image.Resampling.BILINEAR))
np.clip(grid+32768,0,65535).astype('<u2').tofile(OUT / 'height.bin')
gy,gx = np.gradient(h)
slope = np.sqrt(gx*gx+gy*gy)
# Geographic tint blends are deliberately broad, without altering elevations.
lon = np.linspace(WEST,EAST,h.shape[1])[None,:]
lat = np.degrees(np.arctan(np.sinh(math.pi*(1-2*np.linspace(y0,y1,h.shape[0])[:,None]/(256*2**ZOOM)))))
stops = [0,300,900,1800,3000,4500,6000,8500]
colors = np.array([[157,191,153],[180,202,163],[204,208,167],[208,195,147],[184,156,108],[199,182,142],[226,220,190],[246,245,229]])
rgb = np.stack([np.interp(h,stops,colors[:,i]) for i in range(3)],axis=-1)
arid = np.exp(-((lon-84)/17)**4-((lat-40)/8)**4)*.7
rgb = rgb*(1-arid[:,:,None])+np.array([220,206,162])*arid[:,:,None]
rock = np.clip(slope/220,0,.64)[:,:,None]
rgb = rgb*(1-rock)+np.array([145,103,64])*rock
nx,ny,nz = -gx*.025,gy*.025,np.ones_like(h)
norm = np.sqrt(nx*nx+ny*ny+nz*nz)
shade = np.clip((nx*-.55+ny*.5+nz*.67)/norm,0,1)
rgb *= (.57+.57*shade)[:,:,None]
sea = h < 0
# Negative inland depressions stay on land; open-water bathymetry is colored.
sea &= ~((lon>75)&(lon<100)&(lat>35)&(lat<48))
depth = np.clip(-h/5000,0,1)
water = np.array([102,166,153])[None,None,:]*(1-depth[:,:,None])+np.array([42,112,111])[None,None,:]*depth[:,:,None]
rgb[sea] = water[sea]
Image.fromarray(np.uint8(np.clip(rgb,0,255))).save(OUT/'relief.jpg',quality=94)
(OUT/'metadata.json').write_text(json.dumps(dict(width=900,height=700,west=WEST,east=EAST,south=SOUTH,north=NORTH,mercatorY0=y0/(256*2**ZOOM),mercatorY1=y1/(256*2**ZOOM),source='AWS Terrain Tiles (Mapzen), zoom 6',textureWidth=h.shape[1],textureHeight=h.shape[0])))
print('Built elevation grid and relief texture.', flush=True)
