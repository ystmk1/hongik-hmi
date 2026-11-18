"""Pull the UI files from a hongik-carla-hmi checkout into this repo.

    python3 scripts/import_from_lab.py ../hongik-carla-hmi

Copies every path in lab-files.txt (same relative path, byte for byte) and
refreshes demo/data/ (language packs and study copy, exported from the lab's
Python modules). Overwrites local edits to those files, so commit first.
"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def lab_files():
    return [line.strip() for line in (HERE / 'lab-files.txt').read_text(encoding='utf-8').splitlines()
            if line.strip() and not line.startswith('#')]


def export_data(lab):
    code = r'''
import json,sys
sys.path.insert(0,sys.argv[1])
from english_locale import catalog as en
from chinese_locale import catalog as zh
from midterm_study import OPTIONS,COPY
from navigation_adapter import OPTIONS as NAV_OPTIONS,BLOCKADE_OPTIONS,FOG_OPTIONS
try:
    from research_voice import catalog as rv
    voices={l:rv(l) for l in ('ko','en','zh')}
except Exception:
    voices={}
print(json.dumps(dict(en=en(),zh=zh(),options=OPTIONS,copy=COPY,classic=dict(night=NAV_OPTIONS,congestion=BLOCKADE_OPTIONS,fog=FOG_OPTIONS),research_voice=voices),ensure_ascii=False))
'''
    result = subprocess.run([sys.executable, '-c', code, str(lab)], capture_output=True, text=True, cwd=lab)
    if result.returncode:
        print('Skipped demo/data refresh (lab Python modules did not import):\n' + result.stderr[-1500:])
        return
    data = json.loads(result.stdout)
    out = HERE / 'demo' / 'data'
    out.mkdir(parents=True, exist_ok=True)
    for lang in ('en', 'zh'):
        (out / f'language-{lang}.json').write_text(json.dumps(data[lang], ensure_ascii=False), encoding='utf-8')
    (out / 'study.json').write_text(json.dumps(dict(options=data['options'], copy=data['copy'], classic=data['classic']), ensure_ascii=False, indent=1), encoding='utf-8')
    (out / 'research-voice.json').write_text(json.dumps(data['research_voice'], ensure_ascii=False), encoding='utf-8')


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    lab = Path(sys.argv[1]).resolve()
    if not (lab / 'native_carla.py').is_file():
        raise SystemExit(f'{lab} is not a hongik-carla-hmi checkout')
    for name in lab_files():
        source, target = lab / name, HERE / name
        if name.endswith('/'):
            shutil.rmtree(target, ignore_errors=True)
            shutil.copytree(source, target)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    export_data(lab)
    commit = subprocess.run(['git', '-C', str(lab), 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    (HERE / 'demo' / 'data' / 'source.json').write_text(json.dumps(dict(repo='jungmin5589-del/hongik-carla-hmi', commit=commit), indent=1), encoding='utf-8')
    print(f'Imported {len(lab_files())} paths from {lab} @ {commit[:7]}')


if __name__ == '__main__':
    main()
