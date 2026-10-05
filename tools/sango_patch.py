"""Splice Sango's requested values into three original SWF tags only.

The frame-6 action keeps its original bytecode; its XML string receives two
equal-length numeric changes. Card bitmaps reuse their own original pixel
glyphs and palettes. No game code, shape, sound, or unrelated art is serialized.
"""
import hashlib
import json
import re
import struct
import zlib
from pathlib import Path


def patch_sango(tags):
    baseline = json.loads((Path(__file__).with_name('original-tag-hashes.json')).read_text(encoding='utf8'))
    if len(tags) != len(baseline['tags']):
        raise ValueError('Sango patch requires the original game.swf tag layout')
    result = list(tags)
    for index in [386, 775, 777]:
        code, raw = tags[index]
        expected_code, expected_hash = baseline['tags'][index]
        if code != expected_code or hashlib.sha256(raw).hexdigest() != expected_hash:
            raise ValueError(f'Sango patch source tag {index} differs from the verified original')

    action = tags[386][1]
    match = re.search(rb'<MOVE ID="secretSword".*?</MOVE>', action, re.S)
    old_move = match.group()
    new_move = old_move.replace(b'ENERGY="-25"', b'ENERGY="-15"').replace(b'LIFE="-15"', b'LIFE="-25"')
    result[386] = (12, action[:match.start()] + new_move + action[match.end():])

    def decode_bitmap(index, expected_id):
        raw = tags[index][1]
        offset = 6 if struct.unpack_from('<H', raw)[0] & 63 == 63 else 2
        data = raw[offset:]
        if struct.unpack_from('<HBHHB', data) != (expected_id, 3, 62, 67, 255):
            raise ValueError('Unexpected Sango card bitmap format')
        decoded = zlib.decompress(data[8:])
        if len(decoded) != 1024 + 64 * 67:
            raise ValueError('Unexpected Sango card pixel data')
        return data[:8], decoded[:1024], decoded[1024:]

    powder_header, powder_palette, powder_pixels = decode_bitmap(775, 669)
    sword_header, sword_palette, sword_pixels = decode_bitmap(777, 671)
    powder = bytearray(powder_pixels)
    sword = bytearray(sword_pixels)

    def copy_glyph(source_pixels, source_palette, sx, sy, target, target_palette, tx, ty, width):
        palette = [target_palette[i:i + 4] for i in range(0, 1024, 4)]
        for dy in range(5):
            for dx in range(width):
                source_index = source_pixels[(sy + dy) * 64 + sx + dx]
                color = source_palette[source_index * 4:source_index * 4 + 4]
                target[(ty + dy) * 64 + tx + dx] = palette.index(color)

    # Poison Powder EN15 -> EN20: use the original '2' and '0' glyphs.
    copy_glyph(sword_pixels, sword_palette, 22, 56, powder, powder_palette, 22, 56, 6)
    copy_glyph(powder_pixels, powder_palette, 29, 50, powder, powder_palette, 29, 56, 6)
    # Secret Sword swaps DM15 / EN25 to DM25 / EN15; the second '5' stays.
    copy_glyph(sword_pixels, sword_palette, 22, 56, sword, sword_palette, 22, 50, 6)
    copy_glyph(sword_pixels, sword_palette, 22, 50, sword, sword_palette, 22, 56, 6)

    for index, bitmap_header, palette, pixels in [(775, powder_header, powder_palette, powder),
                                                  (777, sword_header, sword_palette, sword)]:
        body = bitmap_header + zlib.compress(palette + pixels)
        # Retain the long tag-header form used by the original lossless images.
        result[index] = (36, struct.pack('<HI', (36 << 6) | 63, len(body)) + body)
    return result
