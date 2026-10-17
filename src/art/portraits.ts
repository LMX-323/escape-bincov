import { brush, C, type PixelContext } from './pixel';

/** Two station workers, 48px portraits. Clothing and tools echo their stock. */
export function paintPortrait(c: PixelContext, kind: 'arms' | 'med'): void {
  const {r,p,e}=brush(c), S=C;
  p(S.ink,[[6,48],[7,35],[15,29],[16,23],[14,16],[15,7],[22,2],[31,3],[37,11],[35,23],[33,29],[41,34],[44,48]]);
  p(kind==='arms'?S.woodDark:S.tealDark,[[8,47],[9,36],[17,31],[24,33],[32,30],[39,35],[42,47]]);
  r(S.woodLight,21,24,11,10); r(S.wood,28,25,4,9);
  e(S.wood,16,7,20,24); e(S.woodLight,17,8,16,21); r(S.paperShade,18,13,4,7);
  r(S.ink,20,17,3,2);r(S.ink,29,17,3,2);r(S.wood,26,19,2,5);r(S.woodDark,23,26,7,1);
  if(kind==='arms'){
    p(S.clothDark,[[13,13],[15,6],[22,2],[32,4],[36,10],[40,13]]);r(S.cloth,17,6,15,4);r(S.paperShade,18,7,6,1);
    r(S.ink,13,12,26,3);r(S.wood,19,33,16,15);r(S.woodLight,20,34,2,14);r(S.paperShade,20,24,3,3);r(S.paperShade,30,24,3,3);
    r(S.steelDark,29,38,3,10);p(S.steelLight,[[27,36],[30,38],[33,36],[33,41],[30,43],[27,40]]);
  }else{
    p(S.ink,[[15,13],[16,6],[22,2],[31,3],[36,8],[36,16],[33,15],[29,9],[20,10],[18,16]]);
    r(S.steelDark,18,7,5,2);r(S.paperShade,29,6,5,2);
    p(S.paperShade,[[17,31],[24,35],[20,42],[15,34]]);p(S.paper,[[32,30],[36,34],[29,43],[25,35]]);
    r(S.teal,11,36,6,12);r(S.teal,34,37,5,11);r(S.paperShade,32,40,5,6);r(S.red,33,38,1,5);
  }
}
