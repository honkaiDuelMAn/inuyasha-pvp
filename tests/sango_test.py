"""Check real game rules, native card pixels, and the original tag boundary."""
import hashlib
import json
import re
import struct
import unittest
import zlib
from pathlib import Path
from xml.etree import ElementTree

from build_test import tags

ROOT = Path(__file__).resolve().parents[1]
BASELINE = json.loads((ROOT / 'tools/original-tag-hashes.json').read_text(encoding='utf8'))
GAME_FILES = ['game-original.swf', 'game-pvp.swf']
# Literal five-row glyphs read from the original lossless card artwork.
LABELS = {
    '15': ['..###..######', '...##..##....', '...##..#####.', '...##......##', '...##..#####.'],
    '25': ['#####..######', '....##.##....', '.#####.#####.', '##.........##', '######.#####.'],
    '30': ['#####...####.', '....##.##..##', '.####..##..##', '....##.##..##', '#####...####.'],
    '20': ['#####...####.', '....##.##..##', '.#####.##..##', '##.....##..##', '######..####.'],
}


def payload(raw):
    return raw[6 if struct.unpack_from('<H', raw)[0] & 63 == 63 else 2:]


def bitmap(raw):
    data = payload(raw)
    character, fmt, width, height, count = struct.unpack_from('<HBHHB', data)
    assert (fmt, width, height, count) == (3, 62, 67, 255)
    decoded = zlib.decompress(data[8:])
    return character, decoded, [decoded[i:i + 4] for i in range(0, 1024, 4)], decoded[1024:]


def read_label(palette, pixels, top):
    return [''.join('#' if palette[pixels[y * 64 + x]] == b'\xff\xff\xff\xff' else '.'
                    for x in range(22, 35)) for y in range(top, top + 5)]


class SangoBalance(unittest.TestCase):
    def test_secret_sword_actual_impact_is_25_damage_and_15_energy_in_both_modes(self):
        for name in GAME_FILES:
            with self.subTest(game=name):
                movie = b''.join(raw for _, raw in tags(ROOT / 'public/game' / name))
                moves = ElementTree.fromstring(re.search(rb'<MOVES>.*?</MOVES>', movie, re.S).group())
                sword = moves.find("MOVE[@ID='secretSword']")
                self.assertEqual(sword.find('USERIMPACT').get('ENERGY'), '-15')
                self.assertEqual(sword.find('ENEMYIMPACT').get('LIFE'), '-25')
                powder = moves.find("MOVE[@ID='poisonPowder']")
                self.assertEqual(powder.find('USERIMPACT').get('ENERGY'), '-20')
                self.assertEqual(powder.find('ENEMYIMPACT').get('LIFE'), '-30')

    def test_native_card_art_shows_poison_20_energy_and_sword_25_damage_15_energy(self):
        for name in GAME_FILES:
            card_data = {}
            for code, raw in tags(ROOT / 'public/game' / name):
                if code == 36 and struct.unpack_from('<H', payload(raw))[0] in [669, 671]:
                    cid, _, palette, pixels = bitmap(raw)
                    card_data[cid] = (palette, pixels)
            self.assertEqual(set(card_data), {669, 671})
            for cid, damage, energy in [(669, '30', '20'), (671, '25', '15')]:
                with self.subTest(game=name, card=cid):
                    palette, pixels = card_data[cid]
                    self.assertEqual(read_label(palette, pixels, 50), LABELS[damage])
                    self.assertEqual(read_label(palette, pixels, 56), LABELS[energy])

    def test_room_energy_validation_uses_the_patched_secret_sword_cost(self):
        catalog = json.loads((ROOT / 'server/catalog.json').read_text(encoding='utf8'))
        self.assertEqual(next(m for m in catalog if m['id'] == 'secretSword')['energy'], -15)
        self.assertEqual(next(m for m in catalog if m['id'] == 'poisonPowder')['energy'], -20)

    def test_only_three_authorized_original_tags_change(self):
        original = tags(ROOT / 'public/game/game-original.swf')
        self.assertEqual(len(original), len(BASELINE['tags']))
        differences = []
        for index, ((code, raw), (expected_code, expected_hash)) in enumerate(zip(original, BASELINE['tags'])):
            self.assertEqual(code, expected_code)
            if hashlib.sha256(raw).hexdigest() != expected_hash:
                differences.append(index)
        self.assertEqual(differences, [386, 775, 777])
        # Undo only the two equal-length rule values and check the complete action.
        action = original[386][1]
        match = re.search(rb'<MOVE ID="secretSword".*?</MOVE>', action, re.S)
        restored = match.group().replace(b'ENERGY="-15"', b'ENERGY="-25"').replace(b'LIFE="-25"', b'LIFE="-15"')
        self.assertEqual(hashlib.sha256(action[:match.start()] + restored + action[match.end():]).hexdigest(), BASELINE['tags'][386][1])
        # Restore only the three numerical labels, then hash palette + all indices.
        for cid, labels in [(669, [(56, '15')]), (671, [(50, '15'), (56, '25')])]:
            index = BASELINE['bitmaps'][str(cid)]['tagIndex']
            actual_cid, decoded, palette, pixels = bitmap(original[index][1])
            self.assertEqual(actual_cid, cid)
            restored_pixels = bytearray(pixels)
            white = palette.index(b'\xff\xff\xff\xff')
            background = palette.index(bytes([28, 42, 58, 255]))
            for top, label in labels:
                for dy, row in enumerate(LABELS[label]):
                    for dx, char in enumerate(row):
                        restored_pixels[(top + dy) * 64 + 22 + dx] = white if char == '#' else background
            self.assertEqual(hashlib.sha256(decoded[:1024] + restored_pixels).hexdigest(), BASELINE['bitmaps'][str(cid)]['decodedSha256'])


if __name__ == '__main__':
    unittest.main()
