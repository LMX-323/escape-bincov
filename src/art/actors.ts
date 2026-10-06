import { brush, C, type PixelContext } from './pixel';

export type ActorArt = 'player' | 'scav' | 'salt' | 'elite' | 'creature';
/** Top-down silhouettes face right. Neutral volume shading survives continuous aim rotation. */
export function paintActor(c: PixelContext, kind: ActorArt, weapon = 'pistol'): void {
  const { r, p, e } = brush(c), S = C;
  if (kind === 'creature') {
    p(S.ink,[[0,3],[7,4],[11,8],[19,6],[24,10],[27,9],[31,12],[30,22],[25,25],[20,23],[12,26],[7,30],[1,28],[3,24],[7,21],[5,13],[1,10]]);
    p(S.clothDark,[[2,5],[7,6],[11,11],[19,8],[25,12],[29,12],[28,21],[23,22],[18,21],[12,24],[6,28],[3,27],[9,20],[7,12],[2,9]]);
    p(S.cloth,[[7,9],[13,8],[19,9],[24,13],[23,20],[17,24],[9,22],[9,16]]);
    p(S.paperShade,[[10,10],[15,8],[20,11],[21,18],[17,22],[12,22],[11,19],[16,20],[18,16],[15,12]]);
    r(S.clothLight,6,5,3,2); r(S.clothLight,3,26,4,2); r(S.tealDark,11,13,4,5);
    r(S.redDark,25,14,5,7); r(S.redLight,26,16,3,2); r(S.paper,28,20,2,2); r(S.paperShade,26,11,3,2);
    return;
  }
  // Separate body patterns, not one coat recolored four times.
  if (kind === 'player') {
    p(S.ink,[[5,3],[12,3],[16,7],[20,7],[25,11],[24,22],[19,26],[13,26],[10,30],[4,29],[4,25],[1,22],[1,9],[4,6]]);
    r(S.steelDark,6,4,6,4); r(S.steel,6,4,3,1); r(S.steelDark,5,25,6,4);
    p(S.cloth,[[6,7],[14,6],[20,9],[21,22],[15,26],[6,24],[4,18]]);
    r(S.clothLight,7,8,6,3); r(S.paperShade,9,8,4,2); r(S.clothDark,8,13,7,9);
    r(S.ink,2,11,7,12); r(S.woodDark,3,12,5,10); r(S.wood,3,12,5,3); r(S.brassLight,5,15,2,2);
    e(S.ink,13,10,12,13); e(S.clothDark,14,11,10,11); e(S.clothLight,15,11,8,8);
    p(S.cloth,[[16,11],[21,11],[23,14],[21,17],[16,17],[14,15]]); r(S.woodLight,22,15,2,5);
    p(S.clothLight,[[17,8],[21,8],[24,12],[26,14],[24,17],[21,14],[18,13]]);
    p(S.cloth,[[17,23],[21,21],[24,21],[26,23],[24,26],[20,25]]);
    r(S.paperShade,24,14,3,3); r(S.woodLight,24,21,3,3);
  } else if (kind === 'scav') {
    p(S.ink,[[7,1],[12,2],[14,7],[20,8],[24,12],[23,22],[18,26],[12,27],[8,31],[3,30],[5,24],[0,20],[0,11],[5,7]]);
    r(S.steelDark,8,3,4,5); r(S.steelDark,6,25,4,5);
    p(S.woodDark,[[7,8],[14,6],[20,9],[21,23],[14,26],[6,23],[4,16]]);
    r(S.wood,9,9,6,11); r(S.woodLight,10,9,4,3); r(S.paperShade,8,20,4,3);
    p(S.ink,[[1,11],[6,9],[10,12],[9,21],[4,24],[0,20]]); p(S.paperShade,[[2,12],[6,11],[8,13],[7,20],[4,22],[2,19]]);
    r(S.wood,3,15,4,2); e(S.ink,13,11,11,12); e(S.wood,14,12,9,10); e(S.woodLight,16,13,6,7);
    p(S.woodDark,[[15,11],[21,12],[23,15],[19,14],[17,16],[16,19],[14,18]]);
    r(S.paperShade,21,17,3,3); p(S.wood,[[17,23],[22,21],[25,23],[24,26],[20,26]]); r(S.woodLight,24,22,3,3);
  } else if (kind === 'salt') {
    p(S.ink,[[5,2],[11,2],[15,7],[19,6],[23,9],[26,9],[28,13],[24,17],[25,23],[20,27],[13,26],[10,30],[4,29],[6,23],[3,18],[4,8]]);
    r(S.steelDark,6,3,5,5); r(S.steelDark,5,25,5,4);
    p(S.tealDark,[[5,9],[13,6],[19,8],[23,14],[23,23],[16,26],[7,24],[5,18]]);
    p(S.teal,[[6,9],[13,8],[20,10],[19,23],[13,25],[6,22]]);
    p(S.paperShade,[[8,8],[11,8],[17,22],[15,24]]); r(S.wood,6,19,4,5);
    e(S.ink,14,10,11,13); e(S.paperShade,16,13,8,9); e(S.tealDark,14,9,11,10);
    r(S.teal,16,9,8,4); r(S.steelLight,16,10,6,1); r(S.ink,22,11,6,4); r(S.steel,23,11,4,1);
    p(S.tealLight,[[18,7],[21,8],[25,15],[23,17],[20,13]]); r(S.paperShade,24,15,3,3);
    r(S.tealDark,20,22,6,4); r(S.woodLight,25,21,3,3);
  } else {
    p(S.ink,[[3,1],[11,1],[15,4],[23,5],[27,10],[26,23],[23,28],[12,28],[8,32],[2,30],[2,25],[0,20],[0,8]]);
    r(S.steelDark,4,2,7,5); r(S.steelDark,3,26,7,4);
    p(S.woodDark,[[2,8],[10,4],[20,5],[25,10],[24,24],[20,27],[10,26],[2,24]]);
    p(S.redDark,[[4,8],[11,6],[21,7],[22,14],[20,25],[9,25],[4,22]]);
    r(S.wood,5,9,5,13); r(S.woodLight,5,7,6,3); r(S.paperShade,5,10,5,2); r(S.paperShade,5,22,5,2);
    r(S.ink,13,9,13,15); r(S.steelDark,14,10,11,13); r(S.steel,15,10,8,3); r(S.ink,21,14,5,6); r(S.paperShade,23,15,2,2);
    r(S.wood,20,6,4,4); r(S.woodLight,22,9,4,5); r(S.paperShade,24,14,3,3); r(S.wood,20,24,7,4); r(S.woodLight,25,22,3,3);
  }
  if (weapon === 'knife' || kind === 'scav') {
    r(S.ink,24,19,7,5); r(S.wood,24,20,3,3); p(S.steelLight,[[27,20],[32,18],[31,21],[27,22]]);
  } else if (weapon === 'shotgun') {
    r(S.ink,24,15,8,7); r(S.wood,23,16,4,4); r(S.steelLight,27,15,5,2); r(S.steel,27,19,5,2);
  } else if (weapon === 'carbine' || kind === 'elite') {
    r(S.ink,23,15,9,6); r(S.steel,24,16,8,2); r(S.wood,24,18,4,2); r(S.steelDark,26,20,3,3);
  } else {
    r(S.ink,24,16,7,5); r(S.steelLight,25,16,6,2); r(S.steelDark,25,18,4,3);
  }
}

/** Authored fallen silhouettes; no live-character rotation/tint stands in for a corpse. */
export function paintCorpse(c: PixelContext, kind: Exclude<ActorArt, 'player'>): void {
  const { r, p, e } = brush(c), S = C;
  if (kind === 'creature') {
    p(S.ink,[[1,6],[7,8],[14,7],[21,11],[29,10],[31,16],[26,22],[18,23],[12,28],[5,27],[7,23],[2,19]]);
    p(S.clothDark,[[3,9],[8,10],[14,9],[20,13],[28,12],[29,17],[23,20],[17,21],[10,25],[6,25],[9,21],[4,17]]);
    p(S.paperShade,[[10,11],[16,11],[22,15],[21,19],[15,21],[11,18]]); r(S.cloth,12,13,4,6); r(S.redDark,23,15,5,4); return;
  }
  const coat = kind === 'scav' ? S.wood : kind === 'salt' ? S.teal : S.redDark;
  p(S.ink,[[1,12],[5,8],[10,8],[14,11],[22,10],[28,14],[30,21],[25,25],[20,23],[16,27],[10,26],[9,21],[4,20]]);
  p(coat,[[9,13],[14,12],[22,12],[26,15],[26,20],[21,22],[16,24],[11,23]]);
  e(S.ink,2,9,11,11); e(kind === 'elite' ? S.steelDark : S.paperShade,3,10,9,9);
  p(kind === 'salt' ? S.tealDark : S.woodDark,[[3,10],[8,9],[11,12],[8,14],[4,14]]);
  r(S.steelDark,24,20,6,4); r(S.steelDark,13,24,5,4); r(S.paperShade,19,9,5,3); r(S.woodLight,8,21,4,3);
  if (kind === 'scav') { r(S.woodDark,13,13,7,7); r(S.paperShade,14,14,5,4); }
  if (kind === 'salt') p(S.paperShade,[[12,13],[14,13],[22,21],[20,22]]);
  if (kind === 'elite') { r(S.paperShade,11,14,2,6); r(S.wood,17,16,6,5); }
}

export function paintLoot(c: PixelContext, kind: 'loose' | 'crate' | 'empty' | 'note'): void {
  const { r, p } = brush(c), S = C;
  if (kind === 'loose') {
    p(S.ink,[[3,1],[17,1],[20,5],[20,18],[17,21],[3,21],[0,18],[0,5]]);
    r(S.wood,2,4,16,15); r(S.paperShade,3,2,14,8); r(S.paper,3,2,13,2); r(S.woodLight,2,11,16,2);
    r(S.tealDark,8,2,4,17); r(S.brassLight,8,8,4,4); r(S.ink,9,9,2,2); return;
  }
  if (kind === 'note') {
    p(S.ink,[[2,1],[12,1],[17,6],[17,21],[2,21]]); p(S.paperShade,[[3,2],[11,2],[16,7],[16,20],[3,20]]);
    r(S.paper,3,2,8,16); r(S.wood,11,2,2,5); r(S.ink,6,7,5,1); r(S.tealDark,5,10,8,2); r(S.tealDark,5,14,6,1); return;
  }
  r(S.ink,1,4,30,25); r(S.tealDark,2,6,28,21); r(S.teal,3,5,26,7); r(S.tealLight,4,5,24,2);
  r(S.ink,3,12,26,2); r(S.steelDark,4,15,24,10); r(S.teal,5,16,22,7); r(S.ink,10,18,12,3);
  for (const x of [3,25]) { r(S.steel, x,8,4,18); r(S.steelLight,x,8,2,4); r(S.paperShade,x,24,4,2); }
  if (kind === 'empty') { r(S.ink,13,8,6,8); r(S.steel,14,8,4,2); r(S.steel,15,13,3,4); }
  else { r(S.ink,13,9,6,8); r(S.brass,14,10,4,6); r(S.brassLight,14,10,4,2); r(S.ink,15,13,2,2); }
  r(S.paperShade,12,23,8,2);
}

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
