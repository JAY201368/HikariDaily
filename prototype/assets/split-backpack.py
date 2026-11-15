"""T06 registered runtime occlusion only; never redraw or recolour the generated source.
Requires local Pillow to reproduce. Viewing the prototype does not require Python.
All outputs keep the complete 1359 x 1157 source canvas. Retained RGBA pixels
are byte-identical to backpack-photo-v2.png, with hard polygon alpha selection.
"""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).parent
source = Image.open(root / 'backpack-photo-v2.png').convert('RGBA')
polygons = {
    'mid': [
        [(410,385),(451,410),(515,426),(582,430),(655,421),(718,404),(767,376),(767,600),(405,605)],
        [(663,450),(700,476),(767,490),(842,489),(914,473),(984,434),(986,609),(660,607)]
    ],
    'front': [[(0,300),(347,300),(327,375),(292,472),(291,531),(312,626),(347,699),(382,727),(444,742),(560,748),(733,748),(899,741),(981,725),(1015,699),(1030,648),(1038,574),(1064,520),(1106,480),(1117,300),(1359,300),(1359,1157),(0,1157)]]
}
for name, shapes in polygons.items():
    mask = Image.new('1', source.size)
    pen = ImageDraw.Draw(mask)
    for shape in shapes: pen.polygon(shape, fill=1)
    result = Image.new('RGBA', source.size)
    result.paste(source, (0,0), mask)
    result.save(root / f'backpack-photo-{name}.png')
    source_bytes, result_bytes = source.tobytes(), result.tobytes()
    assert all(source_bytes[i*4:i*4+4] == result_bytes[i*4:i*4+4]
               for i, selected in enumerate(mask.convert('L').tobytes()) if selected)
print('PASS: two registered alpha layers; all retained source RGBA pixels unchanged')
