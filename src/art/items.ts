import { brush, C, type PixelContext } from './pixel';

export const ITEM_ART_IDS = ['knife', 'pistol', 'shotgun', 'carbine', 'ammo9', 'shell', 'ammoR', 'bandage', 'medkit', 'antidote', 'water', 'food', 'scrap', 'wire', 'fuse', 'battery', 'watch', 'pearl', 'sample', 'ledger'] as const;
export type ItemArtId = typeof ITEM_ART_IDS[number];

/** Authored 32px silhouettes. Texture identity never depends on a runtime tint. */
export function paintItem(c: PixelContext, id: ItemArtId, size: 24 | 32): void {
  if (size === 24) { paintSmall(c, id); return; }
  const { r, p, e } = brush(c), S = C;
  switch (id) {
    case 'knife':
      p(S.ink, [[2,27],[9,18],[8,16],[11,13],[14,15],[27,2],[30,1],[29,9],[17,22],[19,24],[16,27],[13,25],[6,31]]);
      p(S.steel, [[12,17],[28,3],[27,10],[16,22]]); p(S.paper, [[12,17],[28,3],[24,11],[15,20]]);
      p(S.steelDark, [[8,16],[10,14],[18,24],[16,26]]); p(S.wood, [[3,27],[10,19],[13,23],[6,29]]);
      r(S.paperShade, 5,25,3,2); r(S.woodLight, 8,21,2,3); break;
    case 'pistol':
      p(S.ink, [[3,6],[28,6],[28,8],[31,8],[31,15],[19,15],[19,21],[14,23],[12,30],[3,29],[7,17],[3,16]]);
      r(S.steel,4,8,24,6); r(S.steelLight,5,7,22,2); r(S.steelDark,5,12,21,3); r(S.ink,27,9,3,3);
      p(S.wood,[[8,16],[15,17],[11,28],[4,27]]); p(S.woodLight,[[8,17],[11,18],[7,26],[5,26]]);
      p(S.steel,[[14,16],[18,16],[17,21],[14,22],[14,20],[16,20],[16,18],[13,18]]);
      r(S.ink,6,9,1,3); r(S.ink,9,9,1,3); r(S.paperShade,8,22,2,2); break;
    case 'shotgun':
      p(S.ink,[[1,17],[8,11],[13,11],[14,8],[30,8],[31,10],[31,19],[17,19],[11,24],[2,27]]);
      p(S.wood,[[2,18],[8,13],[14,13],[16,18],[10,22],[3,25]]); p(S.woodLight,[[2,18],[8,13],[12,13],[9,16],[3,20]]);
      r(S.steelDark,13,9,17,10); r(S.steelLight,14,9,16,2); r(S.steel,14,12,15,2);
      r(S.ink,15,14,16,2); r(S.steelLight,16,16,14,2); r(S.wood,14,18,8,3); r(S.woodLight,14,18,8,1);
      r(S.ink,4,20,1,4); r(S.steelDark,11,22,4,2); break;
    case 'carbine':
      p(S.ink,[[1,18],[8,12],[11,13],[13,8],[20,8],[21,10],[31,10],[31,15],[22,15],[21,20],[23,27],[16,29],[13,20],[9,22],[2,25]]);
      p(S.wood,[[2,18],[8,14],[15,14],[16,19],[9,20],[3,23]]); p(S.woodLight,[[3,18],[8,14],[13,14],[10,17]]);
      r(S.steel,12,11,18,3); r(S.steelLight,14,10,15,1); r(S.steelDark,12,14,12,4); r(S.wood,21,14,7,3);
      p(S.steel,[[16,18],[20,18],[22,26],[17,27]]); p(S.steelDark,[[19,19],[20,19],[21,25],[19,26]]);
      r(S.ink,14,9,5,2); r(S.brassLight,14,9,2,1); r(S.ink,28,8,2,3); break;
    case 'ammo9':
      for (const [x,y] of [[4,9],[17,4]]) {
        e(S.ink,x,y,10,11); r(S.ink,x,y+5,10,18); e(S.brassLight,x+1,y+1,8,9);
        r(S.brass,x+1,y+7,8,14); r(S.brassLight,x+2,y+8,2,12); r(S.woodDark,x+7,y+7,2,14);
        r(S.ink,x,y+18,10,1); r(S.paperShade,x+1,y+20,8,2);
      } break;
    case 'shell':
      for (const [x,y] of [[2,5],[18,9]]) {
        r(S.ink,x,y,12,22); r(S.red,x+1,y+2,10,14); r(S.redLight,x+2,y+3,2,12); r(S.redDark,x+9,y+3,2,13);
        r(S.paperShade,x+1,y+1,10,2); r(S.ink,x+4,y+1,3,1); r(S.brass,x+1,y+17,10,3);
        r(S.brassLight,x,y+20,12,2); r(S.woodDark,x+8,y+18,3,2);
      } break;
    case 'ammoR':
      for (const [x,y] of [[4,1],[18,4]]) {
        p(S.ink,[[x+4,y],[x+7,y+5],[x+7,y+10],[x+10,y+13],[x+10,31],[x,31],[x,y+13],[x+3,y+10],[x+3,y+5]]);
        p(S.woodLight,[[x+4,y+2],[x+6,y+6],[x+6,y+11],[x+3,y+11],[x+3,y+6]]);
        p(S.brass,[[x+3,y+11],[x+6,y+11],[x+9,y+14],[x+9,29],[x+1,29],[x+1,y+14]]);
        r(S.brassLight,x+2,y+14,2,14-y); r(S.paperShade,x+1,29,8,1); r(S.woodDark,x+7,y+14,2,14-y);
      } break;
    case 'bandage':
      p(S.ink,[[3,3],[27,3],[27,5],[30,5],[30,28],[27,28],[27,30],[3,30],[3,28],[1,28],[1,5],[3,5]]);
      r(S.paperShade,3,4,24,25); r(S.paper,4,7,24,18); r(S.steel,4,5,22,2); r(S.steel,4,26,22,2);
      e(S.clothDark,7,11,14,11); e(S.paperShade,8,12,12,9); e(S.paper,10,13,8,7); e(S.clothDark,12,14,4,5);
      p(S.paperShade,[[18,15],[23,18],[23,23],[17,23],[17,21],[21,21],[21,19],[18,18]]);
      r(S.red,22,8,4,2); r(S.red,24,8,2,4); r(S.paper,5,8,2,3); break;
    case 'medkit':
      r(S.ink,9,2,14,7); r(S.paperShade,10,3,12,2); r(S.ink,12,5,8,3);
      p(S.ink,[[3,7],[28,7],[31,10],[31,27],[28,30],[3,30],[1,27],[1,10]]);
      r(S.redDark,3,10,26,18); r(S.red,3,8,25,13); r(S.redLight,4,9,23,2); r(S.redDark,3,14,26,2);
      r(S.woodDark,5,17,3,10); r(S.woodDark,24,17,3,10); r(S.brassLight,6,18,2,3); r(S.brassLight,24,18,2,3);
      r(S.paper,12,17,8,8); r(S.red,15,18,2,6); r(S.red,13,20,6,2); r(S.redLight,4,26,5,1); break;
    case 'antidote':
      r(S.ink,7,1,18,8); r(S.paperShade,8,2,16,5); r(S.paper,9,2,14,1); r(S.steelDark,10,5,2,2); r(S.steelDark,15,5,2,2); r(S.steelDark,20,5,2,2);
      p(S.ink,[[7,8],[25,8],[29,12],[29,28],[26,31],[5,31],[2,28],[2,12]]);
      r(S.tealDark,4,12,23,16); r(S.teal,5,10,21,15); r(S.tealLight,5,12,3,11);
      r(S.paperShade,9,14,16,12); r(S.paper,9,14,14,10); p(S.clothDark,[[12,21],[13,18],[17,17],[20,18],[19,21],[15,23]]);
      r(S.cloth,15,18,2,5); r(S.teal,10,28,14,1); break;
    case 'water':
      r(S.ink,10,1,12,7); r(S.teal,11,2,10,4); r(S.tealLight,12,2,8,1);
      p(S.ink,[[10,7],[22,7],[25,12],[25,28],[22,31],[9,31],[6,28],[6,12]]);
      p(S.steel,[[11,8],[21,8],[23,13],[23,28],[21,29],[10,29],[8,27],[8,13]]);
      r(S.teal,9,19,14,8); r(S.tealLight,9,19,14,2); r(S.paper,10,11,2,10); r(S.tealDark,20,13,2,13);
      r(S.paper,12,14,8,5); r(S.tealDark,14,15,4,2); r(S.steelLight,9,25,13,1); r(S.steelLight,11,28,9,1); break;
    case 'food':
      e(S.ink,2,17,28,13); r(S.ink,2,9,28,15); r(S.woodDark,3,10,26,15); r(S.brass,4,11,24,15);
      r(S.red,4,15,24,8); r(S.redLight,5,15,3,8); p(S.paper,[[9,18],[13,16],[19,17],[21,16],[21,22],[18,20],[13,21]]);
      r(S.redDark,13,18,1,1); e(S.ink,2,3,28,13); e(S.steel,3,4,26,10); e(S.paperShade,5,5,22,7);
      e(S.ink,13,5,8,6); e(S.steelLight,14,6,6,3); r(S.steelDark,9,10,7,1); r(S.steelLight,7,26,17,2); break;
    case 'scrap':
      r(S.ink,20,3,10,15); r(S.steel,22,4,7,11); r(S.steelLight,23,4,6,2); r(S.ink,27,7,3,5);
      p(S.ink,[[8,5],[20,5],[27,12],[27,24],[20,31],[8,31],[1,24],[1,12]]);
      p(S.steelDark,[[8,7],[20,7],[25,12],[25,23],[19,29],[8,29],[3,23],[3,13]]);
      p(S.steel,[[8,7],[19,7],[24,12],[21,13],[8,10],[5,15],[3,15],[3,12]]);
      e(S.ink,7,12,15,13); e(S.woodDark,9,14,11,9); e(S.ink,11,15,8,7);
      r(S.paperShade,8,8,3,2); r(S.paperShade,4,21,2,3); r(S.wood,19,25,4,2); r(S.ink,20,10,2,2); r(S.ink,8,26,2,2); break;
    case 'wire':
      e(S.ink,1,2,27,27); e(S.teal,2,3,25,25); e(S.tealLight,3,4,23,22); e(S.tealDark,6,7,17,18);
      e(S.teal,7,8,15,16); e(S.ink,10,10,10,12); r(S.clothDark,1,13,8,4); r(S.clothDark,20,12,8,4);
      p(S.ink,[[20,20],[25,20],[25,25],[30,25],[31,30],[25,31],[20,26]]);
      p(S.teal,[[21,21],[24,21],[24,26],[29,26],[29,29],[25,29],[21,25]]);
      r(S.brassLight,28,25,3,2); r(S.brass,29,28,2,2); r(S.tealLight,5,7,2,4); break;
    case 'fuse':
      p(S.ink,[[1,11],[7,11],[7,8],[25,8],[25,11],[31,11],[31,23],[25,23],[25,26],[7,26],[7,23],[1,23]]);
      r(S.paperShade,7,9,18,16); r(S.paper,8,10,16,12); r(S.steel,2,12,6,10); r(S.steel,24,12,6,10);
      r(S.steelLight,2,12,6,3); r(S.steelLight,24,12,6,3); r(S.steelDark,5,15,3,7); r(S.steelDark,27,15,3,7);
      r(S.clothDark,12,15,8,2); r(S.clothDark,12,18,5,1); r(S.paper,10,23,12,1); break;
    case 'battery':
      r(S.ink,5,1,8,6); r(S.ink,20,2,8,6); r(S.steelLight,6,2,6,3); r(S.woodLight,21,3,6,3);
      r(S.ink,3,6,27,25); r(S.clothDark,4,7,25,22); r(S.brass,5,7,23,5); r(S.brassLight,5,7,23,2);
      r(S.steelDark,5,13,22,14); r(S.teal,6,14,3,13); r(S.paperShade,11,16,13,8); r(S.paper,12,17,11,6);
      r(S.ink,14,18,2,4); r(S.ink,13,19,4,2); r(S.ink,19,19,3,2); r(S.steelLight,6,28,7,1); break;
    case 'watch':
      e(S.ink,11,0,10,9); e(S.brass,12,1,8,7); e(S.ink,14,2,4,4); r(S.brassLight,13,1,5,1);
      e(S.ink,2,6,28,26); e(S.woodDark,3,7,26,24); e(S.brass,4,7,24,23); e(S.brassLight,5,8,22,21);
      e(S.ink,7,10,18,17); e(S.paperShade,8,11,16,15); e(S.paper,9,11,14,13);
      r(S.ink,15,12,2,2); r(S.ink,9,18,2,2); r(S.ink,21,18,2,2); r(S.ink,15,23,2,2);
      r(S.woodDark,15,17,7,2); p(S.ink,[[15,17],[17,17],[20,24],[18,24]]); r(S.brass,15,17,2,2); break;
    case 'pearl':
      e(S.ink,2,26,28,5); e(S.ink,3,2,26,27); e(S.tealDark,4,3,24,25); e(S.teal,5,3,23,23);
      e(S.steelLight,5,3,22,21); e(S.paper,6,4,19,17); e('#faf2d6',8,5,9,6);
      p(S.tealLight,[[5,14],[8,19],[15,23],[23,21],[26,16],[25,22],[19,27],[11,27],[6,22]]);
      r(S.paper,8,12,2,2); r(S.steel,20,22,3,2); break;
    case 'sample':
      r(S.ink,3,2,26,7); r(S.steelDark,4,3,24,5); r(S.steelLight,5,3,22,2); r(S.ink,8,6,2,2); r(S.ink,22,6,2,2);
      p(S.ink,[[5,9],[27,9],[29,12],[29,27],[26,31],[6,31],[3,27],[3,12]]);
      r(S.steel,5,11,22,16); r(S.redDark,6,19,20,9); r(S.red,6,18,20,6); r(S.redLight,6,18,20,2);
      r(S.paper,6,12,2,7); r(S.tealDark,24,11,2,6); r(S.paperShade,11,13,11,10); r(S.paper,12,13,9,8);
      r(S.redDark,17,4,4,13); r(S.redLight,18,5,1,10); r(S.ink,14,18,4,2); r(S.steelLight,9,28,13,1); break;
    case 'ledger':
      p(S.ink,[[3,3],[27,3],[31,7],[31,28],[4,30],[1,27],[1,6]]);
      r(S.woodDark,2,6,27,21); r(S.paperShade,6,24,23,4); r(S.paper,7,24,20,1); r(S.steelDark,8,27,18,1);
      r(S.tealDark,3,4,26,20); r(S.teal,6,4,21,18); r(S.tealLight,6,4,20,2); r(S.wood,3,4,3,22);
      r(S.paperShade,10,8,13,10); r(S.paper,11,9,11,8); p(S.tealDark,[[12,13],[21,13],[19,16],[14,16]]);
      r(S.tealDark,16,10,1,4); r(S.red,23,20,3,10); r(S.redLight,23,20,1,8); break;
  }
}

/** Separate 24px drawings: fewer ribs, wider openings and larger identity marks. */
function paintSmall(c: PixelContext, id: ItemArtId): void {
  const { r, p, e } = brush(c), S = C;
  switch (id) {
    case 'knife':
      p(S.ink,[[1,21],[6,14],[5,12],[8,10],[10,12],[21,1],[23,1],[22,7],[13,17],[15,19],[12,22],[10,20],[5,24]]);
      p(S.steel,[[9,13],[22,2],[21,7],[12,17]]); p(S.paper,[[9,13],[22,2],[18,8],[11,15]]);
      p(S.wood,[[2,21],[7,15],[10,19],[5,22]]); r(S.paperShade,4,18,3,2); p(S.steelDark,[[6,12],[8,11],[14,19],[12,20]]); break;
    case 'pistol':
      p(S.ink,[[1,3],[21,3],[21,5],[23,5],[23,11],[14,11],[14,17],[10,18],[8,23],[1,22],[4,13],[1,12]]);
      r(S.steel,2,5,19,6); r(S.steelLight,3,4,17,2); r(S.steelDark,3,9,17,2); r(S.ink,21,6,2,2);
      p(S.wood,[[5,12],[11,13],[7,21],[2,20]]); r(S.woodLight,5,14,2,5); r(S.steel,11,13,2,3); r(S.ink,4,6,1,2); break;
    case 'shotgun':
      p(S.ink,[[0,13],[6,8],[10,8],[10,5],[23,5],[24,7],[24,14],[14,14],[9,18],[1,22]]);
      p(S.wood,[[1,14],[6,10],[11,10],[13,14],[8,17],[2,20]]); p(S.woodLight,[[1,14],[6,10],[9,10],[6,13],[2,16]]);
      r(S.steelDark,10,6,13,8); r(S.steelLight,11,6,12,2); r(S.ink,11,9,13,2); r(S.steel,11,11,12,2); r(S.woodLight,11,14,6,2); break;
    case 'carbine':
      p(S.ink,[[0,13],[6,9],[9,9],[9,5],[15,5],[16,7],[24,7],[24,11],[17,11],[16,15],[18,22],[12,23],[10,15],[6,18],[1,20]]);
      p(S.wood,[[1,14],[6,11],[11,11],[12,14],[6,16],[2,18]]); r(S.woodLight,3,13,5,2);
      r(S.steel,10,8,13,3); r(S.steelLight,11,7,10,1); r(S.wood,17,11,5,2); p(S.steel,[[12,14],[15,14],[17,21],[13,21]]); r(S.ink,11,6,4,2); break;
    case 'ammo9':
      for (const [x,y] of [[1,5],[13,1]]) { e(S.ink,x,y,9,9); r(S.ink,x,y+5,9,14); e(S.brassLight,x+1,y+1,7,7); r(S.brass,x+1,y+6,7,11); r(S.brassLight,x+2,y+7,2,9); r(S.paperShade,x+1,y+16,7,2); } break;
    case 'shell':
      for (const [x,y] of [[1,2],[13,5]]) { r(S.ink,x,y,10,18); r(S.red,x+1,y+2,8,11); r(S.redLight,x+2,y+3,2,9); r(S.paperShade,x+1,y+1,8,2); r(S.brass,x+1,y+13,8,3); r(S.brassLight,x,y+16,10,1); } break;
    case 'ammoR':
      for (const [x,y] of [[2,0],[14,3]]) { p(S.ink,[[x+3,y],[x+6,y+5],[x+6,y+8],[x+8,y+10],[x+8,24],[x,24],[x,y+10],[x+2,y+8],[x+2,y+4]]); p(S.woodLight,[[x+3,y+2],[x+5,y+5],[x+5,y+9],[x+2,y+9],[x+2,y+5]]); r(S.brass,x+1,y+10,6,12-y); r(S.brassLight,x+2,y+10,2,11-y); r(S.paperShade,x+1,22,6,1); } break;
    case 'bandage':
      r(S.ink,1,1,22,22); r(S.paperShade,2,2,20,20); r(S.paper,3,5,18,14); r(S.steel,3,3,18,2); r(S.steel,3,20,18,1);
      e(S.clothDark,5,8,12,10); e(S.paperShade,6,9,10,8); e(S.paper,8,10,6,6); e(S.clothDark,10,11,3,4);
      r(S.paperShade,15,13,4,5); r(S.red,17,6,3,2); break;
    case 'medkit':
      r(S.ink,7,0,11,5); r(S.paperShade,8,1,9,2); r(S.ink,10,3,5,2); r(S.ink,0,5,24,18);
      r(S.redDark,1,7,22,15); r(S.red,2,6,20,11); r(S.redLight,2,6,20,2); r(S.redDark,2,11,20,2);
      r(S.paper,9,13,7,7); r(S.red,12,14,1,5); r(S.red,10,16,5,1); r(S.brassLight,3,14,2,3); r(S.brassLight,19,14,2,3); break;
    case 'antidote':
      r(S.ink,4,0,16,6); r(S.paperShade,5,1,14,4); r(S.paper,6,1,12,1);
      p(S.ink,[[4,6],[20,6],[23,9],[23,21],[21,24],[2,24],[0,21],[0,9]]);
      r(S.teal,2,9,19,13); r(S.tealLight,3,9,2,9); r(S.paper,7,11,12,9); p(S.clothDark,[[9,16],[11,13],[16,13],[17,15],[13,18],[10,18]]); break;
    case 'water':
      r(S.ink,7,0,10,5); r(S.tealLight,8,1,8,3); p(S.ink,[[7,5],[17,5],[20,10],[20,21],[18,24],[5,24],[3,21],[3,10]]);
      p(S.steel,[[8,6],[16,6],[18,10],[18,21],[16,22],[7,22],[5,20],[5,10]]);
      r(S.teal,6,15,12,5); r(S.tealLight,6,15,12,2); r(S.paper,6,9,2,6); r(S.paperShade,9,10,7,4); r(S.tealDark,10,11,4,1); r(S.steelLight,7,21,9,1); break;
    case 'food':
      e(S.ink,1,15,22,8); r(S.ink,1,7,22,12); r(S.brass,2,8,20,12); r(S.red,2,11,20,7);
      p(S.paper,[[6,14],[10,12],[15,13],[18,12],[18,17],[15,15],[10,17]]); e(S.ink,1,1,22,11); e(S.steel,2,2,20,8); e(S.paperShade,4,3,16,5);
      e(S.ink,10,3,7,4); e(S.steelLight,11,4,5,2); r(S.steelLight,6,21,12,1); break;
    case 'scrap':
      r(S.ink,16,1,8,11); r(S.steel,17,2,6,8); r(S.steelLight,18,2,5,2); r(S.ink,21,5,3,3);
      p(S.ink,[[6,4],[15,4],[21,10],[21,18],[15,24],[6,24],[0,18],[0,10]]);
      p(S.steelDark,[[6,5],[15,5],[20,10],[20,17],[14,22],[6,22],[2,17],[2,10]]);
      p(S.steel,[[6,5],[15,5],[18,8],[7,8],[3,12],[2,10]]); e(S.ink,5,10,12,10); e(S.woodDark,7,12,8,6); e(S.ink,9,13,5,4); r(S.paperShade,5,6,3,2); r(S.wood,15,19,3,2); break;
    case 'wire':
      e(S.ink,0,0,22,22); e(S.tealLight,1,1,20,20); e(S.teal,3,3,16,16); e(S.ink,7,6,9,11);
      r(S.clothDark,0,9,7,3); r(S.clothDark,16,8,6,3); p(S.ink,[[16,16],[20,16],[20,19],[24,19],[24,24],[19,24],[16,21]]);
      p(S.teal,[[17,17],[19,17],[19,21],[23,21],[23,23],[20,23],[17,20]]); r(S.brassLight,22,19,2,2); break;
    case 'fuse':
      r(S.ink,4,5,16,15); r(S.ink,0,8,24,9); r(S.paperShade,5,6,14,13); r(S.paper,6,7,12,9);
      r(S.steel,1,9,5,7); r(S.steel,18,9,5,7); r(S.steelLight,1,9,5,2); r(S.steelLight,18,9,5,2); r(S.clothDark,9,11,6,2); r(S.clothDark,9,14,3,1); break;
    case 'battery':
      r(S.ink,3,0,7,5); r(S.ink,15,1,7,5); r(S.steelLight,4,1,5,3); r(S.woodLight,16,2,5,2); r(S.ink,1,5,22,19);
      r(S.clothDark,2,6,20,17); r(S.brass,2,6,20,4); r(S.brassLight,3,6,18,1); r(S.steelDark,3,11,18,10); r(S.teal,3,12,2,9);
      r(S.paper,8,13,11,7); r(S.ink,10,14,1,5); r(S.ink,9,16,3,1); r(S.ink,15,16,3,1); break;
    case 'watch':
      e(S.ink,8,0,9,7); e(S.brassLight,9,1,7,5); e(S.ink,11,2,3,3); e(S.ink,1,5,22,19);
      e(S.brass,2,6,20,17); e(S.brassLight,3,6,18,16); e(S.ink,5,8,14,13); e(S.paper,6,9,12,11);
      r(S.ink,11,10,1,2); r(S.woodDark,11,14,6,2); p(S.ink,[[11,14],[13,14],[16,19],[14,19]]); r(S.ink,7,14,2,1); break;
    case 'pearl':
      e(S.ink,1,19,22,5); e(S.ink,1,0,22,23); e(S.teal,2,1,20,21); e(S.steelLight,2,1,19,18); e(S.paper,3,2,17,14); e('#faf2d6',5,3,8,5);
      p(S.tealLight,[[3,13],[7,17],[13,19],[20,15],[18,20],[10,22],[5,19]]); break;
    case 'sample':
      r(S.ink,1,1,22,6); r(S.steel,2,2,20,4); r(S.steelLight,3,2,18,1); p(S.ink,[[3,7],[21,7],[23,10],[23,21],[20,24],[3,24],[1,21],[1,10]]);
      r(S.steel,3,9,18,12); r(S.redDark,4,14,16,8); r(S.red,4,14,16,5); r(S.redLight,4,14,16,2);
      r(S.paper,4,9,2,5); r(S.paperShade,8,11,10,8); r(S.paper,9,11,8,6); r(S.redDark,13,3,4,11); r(S.redLight,14,3,1,10); r(S.ink,10,15,3,1); break;
    case 'ledger':
      p(S.ink,[[2,1],[21,1],[24,4],[24,21],[3,24],[0,21],[0,4]]); r(S.woodDark,1,3,22,18); r(S.paperShade,5,19,18,3); r(S.paper,6,19,16,1);
      r(S.tealDark,2,2,20,17); r(S.teal,5,2,16,15); r(S.tealLight,5,2,15,2); r(S.wood,2,2,3,19);
      r(S.paper,8,6,11,8); p(S.tealDark,[[9,10],[18,10],[16,13],[11,13]]); r(S.tealDark,13,7,1,4); r(S.red,18,16,3,8); break;
  }
}
