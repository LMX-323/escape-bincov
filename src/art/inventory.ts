import { brush, C, type PixelContext } from './pixel';
import { paintItem, type ItemArtId } from './items';

/** Inventory views have room for the object's proportions; world icons stay compact. */
export const inventoryArtSize = (id: string): readonly [number, number] => {
  switch (id) {
    case 'shotgun': case 'carbine': return [78, 17];
    case 'pistol': return [38, 17];
    case 'medkit': case 'ledger': return [48, 16];
    case 'water': return [12, 32];
    case 'battery': return [22, 32];
    case 'knife': return [14, 32];
    default: return [24, 24];
  }
};

export function paintInventoryItem(c: PixelContext, id: ItemArtId): void {
  const { r, p } = brush(c), S = C;
  switch (id) {
    case 'shotgun':
      p(S.ink, [[0,9],[18,8],[23,5],[33,5],[35,3],[78,3],[78,9],[39,9],[36,12],[28,12],[23,15],[3,17],[0,15]]);
      p(S.woodDark, [[1,10],[19,9],[25,7],[32,7],[28,11],[21,14],[3,15]]);
      p(S.wood, [[2,10],[18,10],[23,8],[27,8],[21,12],[5,14],[2,14]]);
      r(S.woodLight,3,10,11,1); r(S.ink,1,11,2,4); r(S.woodDark,9,12,7,1);
      r(S.steelDark,30,6,12,4); r(S.steel,33,4,44,2); r(S.steelLight,35,4,40,1);
      r(S.ink,39,6,39,1); r(S.steel,40,7,37,1); r(S.steelDark,76,4,2,4);
      r(S.wood,42,9,17,2); r(S.woodLight,43,9,15,1); r(S.ink,69,2,2,1);
      p(S.steel,[[30,10],[31,10],[31,13],[35,13],[36,10],[37,10],[36,14],[30,14]]);
      r(S.ink,33,10,1,2); r(S.steelLight,30,6,4,1); break;
    case 'carbine':
      p(S.ink,[[0,10],[17,8],[21,7],[22,4],[43,4],[44,3],[48,3],[48,4],[78,4],[78,8],[57,8],[55,11],[40,11],[42,16],[35,17],[32,11],[27,11],[22,13],[2,17],[0,16]]);
      p(S.woodDark,[[1,11],[18,9],[26,9],[23,12],[4,15],[1,15]]);
      p(S.wood,[[2,11],[17,10],[22,10],[16,12],[4,14],[2,14]]); r(S.woodLight,3,11,9,1);
      r(S.steelDark,23,5,29,5); r(S.steel,24,5,22,2); r(S.steelLight,25,5,15,1);
      r(S.ink,29,6,5,1); r(S.steelLight,35,6,5,1); r(S.ink,38,7,2,2);
      r(S.steel,47,5,30,2); r(S.steelLight,51,5,25,1); r(S.steelDark,76,5,2,3);
      r(S.ink,66,3,2,2); r(S.steel,67,2,1,1); r(S.wood,44,8,15,2); r(S.woodLight,45,8,12,1);
      p(S.steelDark,[[33,10],[39,10],[41,15],[36,16]]); p(S.steel,[[34,11],[36,11],[38,15],[36,15]]);
      p(S.steel,[[26,10],[27,10],[27,13],[30,13],[31,10],[32,10],[31,14],[26,14]]); r(S.ink,29,10,1,2); break;
    case 'pistol':
      p(S.ink,[[1,1],[36,1],[36,3],[38,3],[38,8],[23,8],[23,12],[18,13],[16,17],[4,17],[8,9],[1,9]]);
      r(S.steelDark,2,3,34,5); r(S.steel,3,2,32,4); r(S.steelLight,4,2,28,1);
      r(S.ink,6,3,1,2); r(S.ink,9,3,1,2); r(S.ink,25,3,5,1); r(S.ink,36,4,2,2);
      p(S.woodDark,[[10,8],[18,9],[15,16],[5,16]]); p(S.wood,[[10,9],[16,10],[13,15],[7,15]]);
      p(S.woodLight,[[10,10],[12,10],[10,14],[8,14]]); r(S.brass,12,12,1,1);
      p(S.steel,[[18,8],[22,8],[22,11],[20,12],[17,12],[17,11],[20,11],[21,10],[21,9],[18,9]]);
      r(S.ink,19,9,1,2); break;
    case 'medkit':
      r(S.ink,19,0,11,4); r(S.paperShade,20,1,9,1); r(S.ink,0,3,48,13);
      r(S.redDark,1,4,46,11); r(S.red,2,4,42,9); r(S.redLight,3,4,40,1);
      r(S.woodDark,5,5,3,10); r(S.woodDark,39,5,3,10); r(S.paperShade,5,8,3,3); r(S.paperShade,39,8,3,3);
      r(S.redDark,9,7,28,1); r(S.paper,20,8,10,6); r(S.red,24,9,2,4); r(S.red,22,10,6,2);
      r(S.redLight,11,12,5,1); r(S.ink,45,7,2,6); break;
    case 'water':
      r(S.ink,3,0,6,4); r(S.paperShade,4,1,4,2);
      p(S.ink,[[3,4],[9,4],[12,9],[12,29],[9,32],[3,32],[0,29],[0,9]]);
      p(S.tealDark,[[4,5],[8,5],[10,10],[10,28],[8,30],[3,30],[2,28],[2,10]]);
      p(S.teal,[[4,6],[7,6],[9,11],[9,27],[7,29],[4,29],[3,27],[3,11]]);
      r(S.tealLight,3,10,2,14); r(S.paperShade,5,15,5,9); r(S.paper,5,15,4,2); r(S.tealDark,6,19,3,1);
      r(S.tealDark,3,26,6,1); r(S.steel,4,29,4,1); break;
    case 'battery':
      r(S.ink,3,0,6,5); r(S.ink,14,1,6,4); r(S.steelLight,4,1,4,2); r(S.woodLight,15,2,4,2);
      r(S.ink,0,5,22,27); r(S.clothDark,1,6,20,25); r(S.brass,2,6,18,4); r(S.brassLight,2,6,17,1);
      r(S.steelDark,2,11,18,18); r(S.teal,2,12,2,15); r(S.paperShade,6,14,12,9); r(S.paper,7,15,10,7);
      r(S.ink,9,16,1,5); r(S.ink,8,18,3,1); r(S.ink,13,18,3,1); r(S.steel,4,28,13,1); break;
    case 'knife':
      p(S.ink,[[6,0],[10,0],[12,6],[10,20],[14,20],[14,23],[9,24],[9,31],[2,32],[2,24],[0,24],[0,21],[4,20],[4,6]]);
      p(S.steel,[[7,1],[9,2],[10,7],[8,20],[5,20],[5,7]]); p(S.paper,[[7,2],[8,3],[7,18],[5,19],[6,7]]);
      r(S.steelDark,1,21,12,2); r(S.woodDark,3,24,5,7); r(S.wood,3,24,2,6); r(S.paperShade,3,25,4,1); r(S.paperShade,3,28,4,1); break;
    case 'ledger':
      p(S.ink,[[1,1],[22,0],[25,1],[46,0],[48,2],[48,14],[25,16],[22,15],[0,16],[0,3]]);
      r(S.tealDark,1,3,46,12); r(S.teal,2,3,44,10); r(S.paperShade,4,3,18,10); r(S.paper,5,3,16,8);
      r(S.paperShade,25,2,19,10); r(S.paper,26,2,17,8); r(S.wood,22,2,3,12);
      for(const x of [7,28]) { r(S.steelDark,x,5,12,1); r(S.steelDark,x,7,10,1); r(S.steel,x,9,6,1); }
      r(S.red,38,10,3,6); r(S.redLight,38,10,1,5); break;
    default: paintItem(c, id, 24);
  }
}
