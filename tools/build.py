"""Append compiled PvP actions without recompiling any original game code/assets."""
import argparse
import json
import re
import shutil
import struct
import subprocess
import zlib
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]


def unpack(path):
    data = path.read_bytes()
    if data[:3] == b'CWS':
        data = b'FWS' + data[3:8] + zlib.decompress(data[8:])
    if data[:3] != b'FWS' or len(data) != struct.unpack_from('<I', data, 4)[0]:
        raise ValueError('Invalid SWF')
    return data


def split_tags(data):
    pos = 8 + (5 + 4 * (data[8] >> 3) + 7) // 8 + 4
    header = data[:pos]
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
    return header, result


def serialize(header, tags, compressed=False):
    data = header + b''.join(raw for _, raw in tags)
    data = b'FWS' + data[3:4] + struct.pack('<I', len(data)) + data[8:]
    return b'CWS' + data[3:8] + zlib.compress(data[8:]) if compressed else data


def build(source_root, java, ffdec):
    original = unpack(source_root / 'game.swf')
    header, tags = split_tags(original)
    scratch = ROOT / 'scratch/build'
    scratch.mkdir(parents=True, exist_ok=True)
    # Compiler receives a separate one-frame movie; originals never go through it.
    empty = scratch / 'empty.swf'
    empty.write_bytes(serialize(header[:-2] + b'\x01\x00', [(12, b'\x01\x03\x00'), (1, b'\x40\x00'), (0, b'\x00\x00')]))
    def compile_movie(input_path, output_path, source):
        result = subprocess.run([str(java), '-Djava.awt.headless=true', '-jar', str(ffdec), '-replace', str(input_path), str(output_path), r'\frame_1\DoAction', str(source)], capture_output=True, text=True)
        (scratch / (source.stem + '-compiler.log')).write_text(result.stdout + result.stderr, encoding='utf8')
        if result.returncode or not output_path.exists():
            raise RuntimeError('Compilation failed; see scratch/build/' + source.stem + '-compiler.log')
    compiled = scratch / 'loader.swf'
    compile_movie(empty, compiled, ROOT / 'flash/loader.as')
    action = next(tag for tag in split_tags(unpack(compiled))[1] if tag[0] == 12)
    if len(action[1]) < 30:
        raise RuntimeError('Compiler produced no bridge code')
    patched = []
    frame = 1
    for tag in tags:
        if frame == 16 and tag[0] == 1:
            patched.append(action)
        patched.append(tag)
        if tag[0] == 1:
            frame += 1
    output = ROOT / 'public/game'
    (output / 'characters').mkdir(parents=True, exist_ok=True)
    bridge_input = scratch / 'empty8.swf'
    bridge_input.write_bytes(serialize(header[:3] + b'\x08' + header[4:-2] + b'\x01\x00', [(12, b'\x01\x03\x00'), (1, b'\x40\x00'), (0, b'\x00\x00')]))
    compile_movie(bridge_input, output / 'pvp-bridge.swf', ROOT / 'flash/pvp.as')
    (output / 'game-pvp.swf').write_bytes(serialize(header, patched, True))
    shutil.copyfile(source_root / 'game.swf', output / 'game-original.swf')
    for path in source_root.glob('*_figure.swf'):
        shutil.copyfile(path, output / 'characters' / path.name)
    xml = re.search(rb'<MOVES>.*?</MOVES>', original, re.S).group().decode('utf8')
    moves = []
    for move in ElementTree.fromstring(xml):
        moves.append({'id': move.get('ID'), 'name': move.get('NAME'), 'characters': move.get('CHARACTERS').split(','), 'advanced': move.get('ADVANCED') == '1', 'energy': int(move.find('USERIMPACT').get('ENERGY'))})
    (ROOT / 'server').mkdir(exist_ok=True)
    (ROOT / 'server/catalog.json').write_text(json.dumps(moves, indent=2), encoding='utf8')
    (ROOT / 'public/net').mkdir(exist_ok=True)
    (ROOT / 'public/net/catalog.mjs').write_text('export const catalog = ' + json.dumps(moves, indent=2) + ';\n', encoding='utf8')
    print(f'Built game-pvp.swf: {len(tags)} unchanged tags + one PvP action; {len(moves)} original move definitions.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--original', type=Path, required=True)
    parser.add_argument('--java', type=Path, required=True)
    parser.add_argument('--ffdec', type=Path, required=True)
    args = parser.parse_args()
    build(args.original.resolve(), args.java.resolve(), args.ffdec.resolve())
