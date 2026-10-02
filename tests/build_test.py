import hashlib
import json
import struct
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HASHES = json.loads((ROOT / 'tools/original-hashes.json').read_text(encoding='utf8'))


def tags(path):
    data = path.read_bytes()
    if data[:3] == b'CWS':
        data = data[:8] + zlib.decompress(data[8:])
    assert len(data) == struct.unpack_from('<I', data, 4)[0]
    pos = 8 + (5 + 4 * (data[8] >> 3) + 7) // 8 + 4
    result = []
    while pos < len(data):
        start = pos
        value = struct.unpack_from('<H', data, pos)[0]
        pos += 2
        size = value & 63
        if size == 63:
            size = struct.unpack_from('<I', data, pos)[0]
            pos += 4
        result.append((value >> 6, data[start:pos + size]))
        pos += size
    return result


class Preservation(unittest.TestCase):
    def test_all_original_tags_are_byte_identical_with_only_one_inserted_action(self):
        baseline = tags(ROOT / 'public/game/game-original.swf')
        patched = tags(ROOT / 'public/game/game-pvp.swf')
        self.assertEqual(len(patched), len(baseline) + 1)
        frame = 1
        filtered = []
        inserted = 0
        for tag in patched:
            if len(filtered) < len(baseline) and tag == baseline[len(filtered)]:
                filtered.append(tag)
            else:
                self.assertEqual(frame, 16)
                self.assertEqual(tag[0], 12)
                inserted += 1
            if tag[0] == 1:
                frame += 1
        self.assertEqual(inserted, 1)
        self.assertEqual(filtered, baseline)

    def test_original_mode_and_character_files_are_unchanged(self):
        self.assertEqual(len(HASHES), 12)
        for name, expected in HASHES.items():
            target = ROOT / 'public/game' / ('game-original.swf' if name == 'game.swf' else 'characters/' + name)
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), expected)

    def test_flash_versions_preserve_original_execution_rules(self):
        for name in ['game-original.swf', 'game-pvp.swf']:
            self.assertEqual((ROOT / 'public/game' / name).read_bytes()[3], 6)
        self.assertEqual((ROOT / 'public/game/pvp-bridge.swf').read_bytes()[3], 8)


if __name__ == '__main__':
    unittest.main()
