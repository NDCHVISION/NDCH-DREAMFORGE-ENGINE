"""Build "NDCH Freq Serif": Cormorant Garamond with full-height (lining) numerals as the default digits,
so "001" never reads "oo1" in burned captions (libass can't switch OpenType features on).

    python3 scripts/freq_font.py   ->  assets/fonts/NDCHFreqSerif-Regular.ttf
"""
from fontTools.ttLib import TTFont

SRC, OUT = 'assets/fonts/CormorantGaramond-Regular.ttf', 'assets/fonts/NDCHFreqSerif-Regular.ttf'
DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

f = TTFont(SRC)
names = set(f.getGlyphOrder())
for table in f['cmap'].tables:
    for code, glyph in list(table.cmap.items()):
        if glyph in DIGITS and f'{glyph}.lf' in names:
            table.cmap[code] = f'{glyph}.lf'
for rec in f['name'].names:
    if rec.nameID in (1, 4, 16):
        rec.string = 'NDCH Freq Serif'
    elif rec.nameID == 6:
        rec.string = 'NDCHFreqSerif-Regular'
    elif rec.nameID == 3:
        rec.string = 'NDCHFreqSerif-Regular;derived from Cormorant Garamond'
f.save(OUT)
print(OUT)
