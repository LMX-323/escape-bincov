"""Maintainer-only regeneration; see assets/fonts/README.md for pinned source/tools."""
import hashlib, json, subprocess, sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

source = Path(sys.argv[1])
assert hashlib.sha256(source.read_bytes()).hexdigest() == '9c699de0d24e482700fa0a08ce3abe58ef2ceaf6173323c77b767c72cd538512'
chars = subprocess.check_output(['node','--input-type=module','-e',"import {fontCharacters} from './scripts/font-characters.mjs';process.stdout.write(await fontCharacters());"]).decode()
font = TTFont(source, recalcTimestamp=False)
missing = sorted(set(map(ord,chars))-set(font.getBestCmap()))
assert not missing, f'Upstream font lacks code points: {missing}'
options = subset.Options()
options.flavor='woff2'; options.name_IDs=['*']; options.name_languages=['*']; options.name_legacy=True
subsetter=subset.Subsetter(options=options);subsetter.populate(text=chars);subsetter.subset(font)
# Subsetting is a modification: do not distribute under the upstream reserved family name.
names={1:'Bincov Text',2:'Regular',3:'Bincov Text Regular 1.000',4:'Bincov Text Regular',6:'BincovText-Regular',16:'Bincov Text',17:'Regular'}
for record in font['name'].names:
    if record.nameID in names:record.string=names[record.nameID].encode(record.getEncoding())
font.flavor='woff2'
target=Path('assets/fonts/bincov-text.woff2');target.parent.mkdir(parents=True,exist_ok=True);font.save(target)
Path('assets/fonts/characters.txt').write_text(chars+'\n')
Path('assets/fonts/manifest.json').write_text(json.dumps({'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'characters':len(chars),'bytes':target.stat().st_size,'family':'Bincov Text','tools':'fonttools 4.61.1; brotli 1.2.0','codepoints':sorted(font.getBestCmap())},indent=2)+'\n')
print(f'Generated {target}: {len(chars)} characters, {target.stat().st_size} bytes')
