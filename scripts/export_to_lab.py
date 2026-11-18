"""Copy the UI files from this repo back into a hongik-carla-hmi checkout.

    python3 scripts/export_to_lab.py ../hongik-carla-hmi

Only paths listed in lab-files.txt are written, at the same relative path.
Nothing is committed: review with `git -C ../hongik-carla-hmi diff`, then
commit there (or open a pull request) as usual.
"""
import filecmp
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def lab_files():
    return [line.strip() for line in (HERE / 'lab-files.txt').read_text(encoding='utf-8').splitlines()
            if line.strip() and not line.startswith('#')]


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    lab = Path(sys.argv[1]).resolve()
    if not (lab / 'native_carla.py').is_file():
        raise SystemExit(f'{lab} is not a hongik-carla-hmi checkout')
    changed = []
    for name in lab_files():
        sources = sorted(p for p in (HERE / name).rglob('*') if p.is_file()) if name.endswith('/') else [HERE / name]
        for source in sources:
            relative = source.relative_to(HERE)
            target = lab / relative
            if target.is_file() and filecmp.cmp(source, target, shallow=False):
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            changed.append(str(relative))
    print('Updated in lab repo:' if changed else 'Lab repo already matches.')
    for name in changed:
        print('  ' + name)
    if changed:
        subprocess.run(['git', '-C', str(lab), 'status', '--short'])


if __name__ == '__main__':
    main()
