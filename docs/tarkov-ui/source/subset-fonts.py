"""Research-only font regeneration. Inputs: ChillBitmap 16px TTF, Noto CJK Regular TTC."""
from pathlib import Path
import sys, json, hashlib
from fontTools.ttLib import TTFont
from fontTools import subset

root=Path('docs/tarkov-ui')
corpus=''.join(p.read_text() for p in (root/'source').iterdir() if p.suffix in ['.js','.html','.css','.json'])
chars=''.join(sorted(set(corpus)|set(map(chr,range(32,127)))))
chars=''.join(c for c in chars if ord(c)>=32)
report={'method':'Source-wide research specimen corpus, no runtime font requests. Both modified subsets renamed under OFL.','characters':len(chars),'fonts':[]}
for slug,path,index,family in [('pixel',Path(sys.argv[1]),None,'Bincov Study Pixel'),('sans',Path(sys.argv[2]),2,'Bincov Study Sans')]:
    expected={'pixel':'9c699de0d24e482700fa0a08ce3abe58ef2ceaf6173323c77b767c72cd538512','sans':'b76b0433203017ca80401b2ee0dd69350349871c4b19d504c34dbdd80541690a'}
    assert hashlib.sha256(path.read_bytes()).hexdigest()==expected[slug], 'Unexpected source font bytes'
    font=TTFont(path,fontNumber=index if index is not None else -1,recalcTimestamp=False)
    missing=sorted(set(map(ord,chars))-set(font.getBestCmap()))
    assert not missing,(slug,missing)
    options=subset.Options();options.flavor='woff2';options.name_IDs=['*'];options.name_languages=['*'];options.name_legacy=True
    worker=subset.Subsetter(options=options);worker.populate(text=chars);worker.subset(font)
    for record in font['name'].names:
        names={1:family,2:'Regular',3:family+' Regular 1.000',4:family+' Regular',6:family.replace(' ','')+'-Regular',16:family,17:'Regular'}
        if record.nameID in names:record.string=names[record.nameID].encode(record.getEncoding())
    font.flavor='woff2';target=root/'fonts'/f'{slug}.woff2';font.save(target)
    report['fonts'].append({'source':str(path.name),'faceIndex':index,'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'family':family,'subsetSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'missing':missing})
(root/'fonts'/'manifest.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
