"""Render FRAME's code-native hexagon/F geometry. Requires Pillow, no downloaded art."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
destination = root / 'build' / 'icons'
destination.mkdir(parents=True, exist_ok=True)
public = root / 'public'
public.mkdir(exist_ok=True)
svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect x="1" y="1" width="94" height="94" rx="19" fill="#101116"/><g transform="translate(16 12)"><path d="M32 3 59 18.5v31L32 65 5 49.5v-31Z" fill="none" stroke="#bbadff" stroke-width="3"/><path d="m32 9 21.8 12.5v25L32 59 10.2 46.5v-25Z" fill="none" stroke="#bbadff" stroke-width=".6" opacity=".45"/><path d="M21 21h25v7H29v7h13v7H29v12h-8V21Z" fill="#f5f1ff"/><path d="m5 18.5 6 3.5M59 49.5l-6-3.5" stroke="#bbadff" stroke-width="3"/></g></svg>'''
(public / 'app-icon.svg').write_text(svg + '\n')
# Supersample the same straight-line paths for clean 16 px through 1024 px assets.
scale = 2048 / 96
image = Image.new('RGBA', (2048, 2048))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((scale, scale, 95*scale, 95*scale), radius=19*scale, fill='#101116')
def points(values): return [((x+16)*scale, (y+12)*scale) for x, y in values]
outer = [(32,3),(59,18.5),(59,49.5),(32,65),(5,49.5),(5,18.5),(32,3)]
inner = [(32,9),(53.8,21.5),(53.8,46.5),(32,59),(10.2,46.5),(10.2,21.5),(32,9)]
draw.line(points(outer + [outer[1]]), fill='#bbadff', width=round(3*scale), joint='curve')
draw.line(points(inner + [inner[1]]), fill='#5d577f', width=round(.6*scale), joint='curve')
draw.polygon(points([(21,21),(46,21),(46,28),(29,28),(29,35),(42,35),(42,42),(29,42),(29,54),(21,54)]), fill='#f5f1ff')
for line in [[(5,18.5),(11,22)],[(59,49.5),(53,46)]]:
    draw.line(points(line), fill='#bbadff', width=round(3*scale))
icon = image.resize((1024,1024), Image.Resampling.LANCZOS)
icon.save(destination / 'icon.png')
icon.save(destination / 'icon.ico', sizes=[(n,n) for n in [16,24,32,48,64,128,256]])
icon.save(destination / 'icon.icns')
icon.resize((256,256), Image.Resampling.LANCZOS).save(public / 'app-icon.png')
print('Created Windows ICO, macOS ICNS, Linux PNG and renderer SVG/PNG.')
