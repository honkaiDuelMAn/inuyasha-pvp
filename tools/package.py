"""Make a portable, offline Windows PvP folder and ZIP without dev scratch."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def package(destination):
    destination.mkdir(parents=True, exist_ok=True)
    for name in ['public', 'server', 'flash', 'tests', 'tools', 'runtime']:
        shutil.copytree(ROOT / name, destination / name, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('__pycache__', '*.map'))
    shutil.copytree(ROOT / 'node_modules/ws', destination / 'node_modules/ws', dirs_exist_ok=True)
    for name in ['.gitattributes', 'package.json', 'README.txt', 'THIRD-PARTY.txt', '호스트-실행.cmd', '검증결과.txt']:
        shutil.copyfile(ROOT / name, destination / name)
    manifest = {}
    for path in sorted(destination.rglob('*')):
        if path.is_file() and path.name != 'package-hashes.json':
            manifest[path.relative_to(destination).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    (destination / 'package-hashes.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf8')
    archive = destination.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
        for path in sorted(destination.rglob('*')):
            if path.is_file():
                bundle.write(path, destination.name + '/' + path.relative_to(destination).as_posix())
    print(f'Packaged {len(manifest)} files. ZIP {archive.stat().st_size:,} bytes: {archive}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('destination', type=Path)
    package(parser.parse_args().destination.resolve())
