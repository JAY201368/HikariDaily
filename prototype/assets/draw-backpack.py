"""T03 original local artwork generator. Viewing needs no Python/Pillow.
Run from any directory: python3 prototype/assets/draw-backpack.py
Pillow is used only to bake deterministic hide pores; all geometry is authored here.
"""
from pathlib import Path
import random
import base64
from PIL import Image, ImageDraw, ImageFilter
ROOT = Path(__file__).resolve().parent
rng = random.Random(3103)
im = Image.new('RGB', (512, 512))
p = im.load()
for y in range(512):
    for x in range(512):
        v = int(max(50, min(200, rng.gauss(127, 16))))
        p[x, y] = (v, v, v)
d = ImageDraw.Draw(im)
for _ in range(15000):
    x, y = rng.randrange(512), rng.randrange(512)
    r = rng.choice([1, 1, 1, 2])
    d.arc((x, y, x+r*2, y+r), 15, 175, fill=(75, 75, 75))
    d.point((x, y+1), fill=(178, 178, 178))
im = im.filter(ImageFilter.GaussianBlur(.25))
im.save(ROOT / 'leather-grain.webp', quality=90)
DEFS = '''<defs>
<linearGradient id="hide" x1=".1" y1="0" x2=".85" y2="1"><stop stop-color="#b4865d"/><stop offset=".12" stop-color="#805333"/><stop offset=".44" stop-color="#70462e"/><stop offset=".78" stop-color="#50311f"/><stop offset="1" stop-color="#241a14"/></linearGradient>
<radialGradient id="belly" cx=".4" cy=".3" r=".8"><stop stop-color="#ab7950"/><stop offset=".42" stop-color="#805334"/><stop offset=".8" stop-color="#4b3020"/><stop offset="1" stop-color="#211811"/></radialGradient>
<linearGradient id="edge"><stop stop-color="#201710"/><stop offset=".13" stop-color="#9d7049"/><stop offset=".25" stop-color="#553620"/><stop offset=".65" stop-color="#342319"/><stop offset="1" stop-color="#100e0a"/></linearGradient>
<linearGradient id="lip" x2="0" y2="1"><stop stop-color="#b48a5d"/><stop offset=".12" stop-color="#95613c"/><stop offset=".28" stop-color="#38251a"/><stop offset=".48" stop-color="#7c5032"/><stop offset="1" stop-color="#482d1d"/></linearGradient>
<linearGradient id="brass" x2=".8" y2="1"><stop stop-color="#3e3020"/><stop offset=".18" stop-color="#d6bd83"/><stop offset=".4" stop-color="#8e7347"/><stop offset=".64" stop-color="#c1a26b"/><stop offset="1" stop-color="#4d3821"/></linearGradient>
<linearGradient id="liner" x2=".2" y2="1"><stop stop-color="#151810"/><stop offset=".34" stop-color="#424335"/><stop offset=".7" stop-color="#262b20"/><stop offset="1" stop-color="#0c100b"/></linearGradient>
<pattern id="weave" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 1H5M1 0V5" stroke="#a3a185" stroke-width=".5" opacity=".16"/></pattern>
<pattern id="pores" width="400" height="400" patternUnits="userSpaceOnUse"><image href="leather-grain.webp" width="400" height="400"/></pattern>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="2" dy="9" stdDeviation="8" flood-color="#130d08" flood-opacity=".65"/></filter>
<filter id="soft"><feGaussianBlur stdDeviation="9"/></filter>
</defs>'''
def skin(path, fill='url(#belly)', stroke='#332217', width=3):
    return f'<path d="{path}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/><path d="{path}" fill="url(#pores)" opacity=".25" style="mix-blend-mode:soft-light"/>'
def line(path, color='#c8a278', width=1, extra=''):
    return f'<path d="{path}" fill="none" stroke="{color}" stroke-width="{width}" {extra}/>'
def seam(path):
    return line(path, '#20170f', 3) + line(path, '#c0a07c', 1, 'stroke-dasharray="3 4" opacity=".65"')
def wrinkles(x,y,flip=1):
    out=''
    for i in range(5):
        yy=y+i*8+rng.randrange(-2,3)
        length=rng.randrange(20,68)
        path=f'M{x} {yy}q{flip*length*.4} -5 {flip*length} {rng.randrange(-9,10)}'
        out+=line(path,'#28190f',5,'opacity=".16"')
        out+=line(path,'#28190f',.8,'opacity=".3"')
        out+=line(f'M{x+flip*3} {yy+2}q{flip*length*.4} -5 {flip*(length-5)} 0','#d2a578',.8,'opacity=".3"')
    return out
back = '<!-- Open pack: shoulder harness, rolled lid, gussets, recessed canvas bays. -->'
back += '<ellipse cx="415" cy="638" rx="330" ry="24" fill="#281d12" opacity=".3" filter="url(#soft)"/>'
for path in ['M210 80C98 73 26 252 50 451L94 495C61 303 123 145 232 145Z','M613 88C755 86 809 307 758 499L721 475C747 320 711 167 594 149Z']:
    back += skin(path,'url(#edge)')
back += seam('M204 98C103 98 46 272 67 438M622 106C741 123 787 306 746 464')
back += skin('M322 90C313 -8 470 -19 488 91L455 97C451 24 351 28 355 100Z','url(#edge)')
back += '<g filter="url(#shadow)">'
back += skin('M167 157Q143 80 230 52Q409 19 594 62Q680 88 653 186L605 229L207 224Z')
back += seam('M182 150Q164 96 237 70Q404 40 586 80Q655 104 638 161')
back += line('M189 134Q270 105 313 116M636 136Q568 104 516 118','#2a1b12',17,'opacity=".28" filter="url(#soft)"')
back += line('M190 134Q262 107 304 118M635 136Q571 111 519 122','#c69b70',2,'opacity=".3"')
back += wrinkles(191,124)+wrinkles(627,127,-1)
back += skin('M135 196Q78 236 88 401L95 562Q99 616 172 626L240 582L227 213Z','url(#edge)')
back += skin('M638 197Q719 195 740 290L751 536Q755 593 678 623L617 570Z','url(#edge)')
back += line('M126 237Q101 371 125 548L167 600','#b88a5e',2,'opacity=".5"')
back += line('M698 238Q726 357 710 539L682 593','#ae8055',2,'opacity=".45"')
back += skin('M160 193Q379 149 657 201Q691 295 685 440L674 594Q629 647 239 636Q170 633 145 579L134 356Z')
# Wide open, visibly receding main compartment.
back += '<path d="M153 205Q384 148 657 209L633 391Q404 435 163 378Z" fill="url(#liner)" stroke="#231a11" stroke-width="9"/>'
back += '<path d="M153 205Q384 148 657 209L633 391Q404 435 163 378Z" fill="url(#weave)"/>'
back += line('M157 207Q389 155 655 211','#bd8f61',4)
back += line('M177 225Q387 178 634 227','#747059',1.5,'stroke-dasharray="4 4"')
back += line('M392 192Q375 281 393 396','#14180f',18)
back += line('M395 199Q384 283 398 394','#75715b',1,'stroke-dasharray="3 4"')
# Lower and side pocket lining remains behind devices/paper/book.
for path in ['M183 438Q378 411 614 445L627 593L177 592Z','M630 404Q672 383 724 415L728 551L641 581Z']:
    back += '<path d="'+path+'" fill="url(#liner)" stroke="#25190f" stroke-width="6"/><path d="'+path+'" fill="url(#weave)"/>'
back += line('M186 439Q384 415 613 445M633 406Q678 389 721 416','#b88a58',3)
back += wrinkles(153,520)+wrinkles(680,522,-1)
back += '</g>'
# Brass side rings and compression tabs.
for x,y in [(121,260),(704,253)]:
    back += f'<rect x="{x-10}" y="{y-19}" width="21" height="61" rx="9" fill="url(#hide)" stroke="#23170f" stroke-width="3"/><rect x="{x-14}" y="{y}" width="30" height="38" rx="12" fill="none" stroke="url(#brass)" stroke-width="7"/><circle cx="{x}" cy="{y-9}" r="4" fill="url(#brass)"/>'
front='<!-- Independent soft pocket faces: transparent above all lips. --> <g filter="url(#shadow)">'
# Upper staggered sleeves, under instrument screens.
for path, stitch in [
 ('M156 343Q220 367 300 351L310 431Q286 480 198 465Q155 449 156 343Z','M169 357Q224 379 288 365L296 426Q277 462 201 452Q169 440 169 357Z'),
 ('M478 319Q555 344 647 317L643 419Q628 457 525 448Q484 430 478 319Z','M493 336Q560 355 633 334L630 415Q615 442 529 435Q498 422 493 336Z')]:
    front += skin(path,'url(#hide)')+seam(stitch)
front += wrinkles(171,389)+wrinkles(632,378,-1)
# Upper sleeves sit between upper and lower devices, not over the lower LCDs.
mid = front + '</g>'
front = '<!-- Lower pocket lip masks stored newspaper/book and device ends. --><g filter="url(#shadow)">'
# Book side pocket, lip at local y=422 (world 482).
front += skin('M632 423Q678 437 727 416L734 541Q726 582 658 591L637 550Z','url(#edge)')
front += seam('M645 437Q680 449 716 433L721 538Q712 565 665 577')
# Deep foreground pocket, intentionally covers stored paper and device lower ends.
front += skin('M146 494Q261 475 392 500Q493 478 639 492L660 566Q662 613 610 629Q380 663 196 625Q142 610 140 564Z')
front += skin('M146 494Q261 475 392 500Q493 478 639 492L641 511Q503 500 391 519Q256 496 144 514Z','url(#lip)','#3c271a',1)
front += seam('M158 520Q263 504 392 528Q505 509 628 521L644 565Q645 600 606 614Q386 646 200 612Q157 600 155 563')
front += line('M389 526Q374 565 391 633','#392518',4)
front += line('M396 531Q384 571 399 634','#b38a62',1,'stroke-dasharray="3 4" opacity=".55"')
front += wrinkles(158,563)+wrinkles(637,565,-1)
front += line('M218 611Q296 634 354 619M438 624Q521 637 592 614','#c49c72',2,'opacity=".24"')
# Worn restraint belts with cast brass roller buckles.
for x in [240,555]:
    front += skin(f'M{x} 497l33 1 7 113q-14 19-34 2Z','url(#edge)','#372419',2)
    front += seam(f'M{x+6} 505l6 101M{x+26} 505l6 101')
    front += f'<rect x="{x-5}" y="534" width="45" height="44" rx="7" fill="url(#brass)" stroke="#2c2117" stroke-width="2"/><rect x="{x+3}" y="541" width="29" height="29" rx="3" fill="#322217"/><path d="M{x+9} 536v39h17v-39" fill="url(#hide)"/><path d="M{x+17} 536v23" stroke="url(#brass)" stroke-width="4"/><circle cx="{x+20}" cy="600" r="4" fill="url(#brass)"/>'
front += '</g>'
for x,y in [(163,513),(624,513),(651,440),(713,437)]:
    front += f'<circle cx="{x}" cy="{y}" r="4" fill="url(#brass)" stroke="#392719"/><path d="M{x-1} {y-2}h2" stroke="#e0c799" opacity=".7"/>'
front += '<text x="459" y="587" transform="rotate(-2 459 587)" text-anchor="middle" fill="#2c2017" opacity=".65" font-family="Georgia,serif" font-size="11" letter-spacing="3">H. K. / FIELD KIT</text>'
# SVGs used as CSS images cannot load nested file images: embed only our own baked grain.
grain_uri = 'data:image/webp;base64,' + base64.b64encode((ROOT/'leather-grain.webp').read_bytes()).decode()
DEFS = DEFS.replace('leather-grain.webp', grain_uri)
for name,content in [('backpack-back.svg',back),('backpack-mid.svg',mid),('backpack-front.svg',front)]:
    (ROOT/name).write_text('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="680" viewBox="0 0 800 680">'+DEFS+content+'</svg>\n')
print('Created backpack layers and deterministic local leather-grain.webp')
