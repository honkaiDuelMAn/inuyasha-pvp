"""Stage only the static browser-hosted game for GitHub Pages."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def stage(destination):
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'public', destination, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('*.map'))
    shutil.copyfile(ROOT / 'public/direct.html', destination / 'index.html')
    shutil.copyfile(ROOT / 'THIRD-PARTY.txt', destination / 'THIRD-PARTY.txt')
    shutil.copyfile(ROOT / 'README.md', destination / 'README.md')
    (destination / '.nojekyll').touch()
    files = {p.relative_to(destination).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(destination.rglob('*')) if p.is_file() and p.name != 'web-hashes.json'}
    (destination / 'web-hashes.json').write_text(json.dumps(files, indent=2), encoding='utf8')
    print(f'Staged {len(files)} static files: {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('destination', type=Path)
    stage(parser.parse_args().destination.resolve())
