import sys
from PIL import Image, ImageDraw, ImageFont
BG = (11, 11, 12)
src, out, font = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 1200, 630
canvas = Image.new('RGB', (W, H), BG)
im = Image.open(src).convert('RGBA')
# hero render 2400x1500: place the movement on the right, cropped
scale = 0.43
im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
layer = Image.new('RGBA', (W, H), BG + (255,))
layer.alpha_composite(im, (500, -8))
canvas = layer.convert('RGB')
d = ImageDraw.Draw(canvas)
f_big = ImageFont.truetype(font, 74)
f_small = ImageFont.truetype(font, 24)
lines = ['Credit scores', 'for onchain', 'borrowers.']
y = 200
for ln in lines:
    d.text((64, y), ln, font=f_big, fill=(236, 234, 229))
    y += 76
d.ellipse((64, 72, 92, 100), outline=(236, 234, 229), width=3)
d.ellipse((72, 80, 84, 92), fill=(233, 92, 104))
d.text((104, 70), 'ChainScore', font=ImageFont.truetype(font, 26), fill=(236, 234, 229))
d.text((64, 548), 'chainscore.dev', font=f_small, fill=(154, 151, 144))
canvas.save(out, quality=88)
print('ok')
