import { brush, C, type PixelContext } from './pixel';
import type { MapData, Building } from '../world';

// Presentation-only coordinate variation: never consume the raid RNG or modify tiles.
const variant = (x: number, y: number) => Math.abs((Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0) % 7;
const signs: Record<string,string> = {
  '褪色居民楼':'居民楼','船工宿舍':'船工','海声修理铺':'海声','停业杂货铺':'杂货',
  '南湾冰鲜':'南湾','滨禾水产':'滨禾','空置冷库':'冷库','旧交易厅':'交易',
  '废弃配电所':'配电','潮汐观测站':'观测站','封存样本室':'样本室','泵站值班室':'值班',
  '旧渔港船务所':'船务','海堤泵房':'泵房','滨科夫水产站':'水产站',
};

function ground(c: PixelContext, value: number, tx: number, ty: number): void {
  const {r,p}=brush(c), x=tx*32,y=ty*32,v=variant(tx,ty);
  const base=['#3c4b4c','#29353b','#213b45','#68726a','#385454','#4a5551','#645d49'][value];
  r(base,x,y,32,32);
  if(value===2) {
    r(v%2?'#2e4850':'#29444e',x+2+v,y+5,18-v,1); r('#2b4750',x+8,y+23,16,1);
    if(v===3)r('#506066',x+9,y+6,6,1); return;
  }
  if(value===3) {
    r('#253a3c',x,y+27,32,5); r('#a2aea0',x,y,32,2); r('#7d8c80',x,y+2,2,24);
    r('#53655e',x+29,y+2,3,25); r('#66796c',x+2,y+24,27,3); return;
  }
  if(value===6) {
    for(let n=0;n<4;n++) {r('#313e3d',x,y+n*8,32,1);r(n%2?'#756f54':'#82765b',x,y+n*8+1,32,1);r('#353e35',x+5,y+n*8+3,2,1);}
    if(v===2){r('#494a3d',x+17,y+10,2,11);r('#8e8464',x+20,y+15,8,1);} return;
  }
  if(value===5) {
    r('#354844',x+31,y,1,32);r('#354844',x,y+31,32,1);r('#57635b',x+1,y+1,29,1);
    if(v===1)r('#3d5049',x+22,y+21,6,3); return;
  }
  if(value===4) {
    p('#2d474c',[[x,y+18],[x+9,y+15],[x+18,y+18],[x+32,y+17],[x+32,y+23],[x+18,y+23],[x+7,y+21],[x,y+23]]);
    r('#719082',x+6,y+15,10,1);r('#495e4b',x+21,y+6,8,2);return;
  }
  if(value===0 && tx%2===0)r('#334345',x,y,1,32);
  if(value===0 && ty%2===0)r('#334345',x,y,32,1);
  if(v===1){r(value===1?'#344148':'#52605c',x+5,y+25,8,1);r('#303f42',x+21,y+9,4,1);}
  if(v===5 && value===0) {p('#2c4041',[[x+22,y],[x+20,y+8],[x+24,y+12],[x+22,y+18],[x+24,y+11],[x+22,y+7],[x+24,y]]);}
}

type Prop = 'window'|'fish'|'icebox'|'motor'|'tools'|'goods'|'power'|'gauge'|'samples'|'pipe'|'rope';
/** Wall-mounted, 32px district props. Decorative boxes intentionally have no brass search latch. */
function prop(c: PixelContext, kind: Prop, x:number,y:number, warm=false):void {
  c.save();c.translate(x,y);const{r,p,e}=brush(c),S=C;
  switch(kind) {
    case 'window':
      r(S.ink,3,4,26,22);r(S.steel,3,4,26,2);r(warm?'#a99161':'#486e70',5,7,22,15);
      r(warm?'#d7bd80':'#799797',6,7,8,4);r('#334e51',5,18,22,4);r(S.ink,14,6,3,17);r(S.paperShade,3,25,26,2);break;
    case 'fish':
      r(S.ink,2,6,28,23);r('#8baca5',3,7,26,20);r(S.paper,4,7,24,2);r('#355b60',5,11,22,13);
      p('#a7c8be',[[7,15],[10,12],[17,13],[20,16],[17,19],[10,18]]);p('#819b92',[[19,16],[25,12],[25,21]]);
      r(S.ink,11,14,1,1);r('#d7dbbb',12,13,5,1);r('#647b73',5,26,22,1);break;
    case 'icebox':
      r(S.ink,3,7,26,22);r('#b2c1ae',4,9,24,17);r('#dfddc2',3,7,26,4);r('#748e83',5,13,22,2);
      r('#91a494',6,17,4,6);r('#c5ceb4',22,17,3,6);r('#546a67',12,12,8,2);r('#465e5e',6,27,20,1);break;
    case 'motor':
      r(S.ink,2,3,28,27);r('#526d6b',3,4,26,24);r('#9cb0a3',4,4,24,2);r('#314e54',5,8,21,17);
      e('#173039',6,9,18,15);e('#788f87',8,11,14,11);e('#284951',12,14,6,5);
      r('#a58c5e',25,8,2,14);r('#a58c5e',19,22,8,2);break;
    case 'tools':
      r('#253e43',2,3,28,26);r('#9a8155',3,4,26,23);r('#b9a172',3,4,26,2);
      r('#152e37',8,8,3,16);p('#a8bcab',[[7,7],[10,9],[13,7],[13,12],[10,14],[7,12]]);r('#b1bda3',9,14,2,9);
      r('#425b5d',19,13,3,12);r('#c2b084',17,8,7,6);r('#554e39',5,25,21,2);break;
    case 'goods':
      r('#243d40',2,4,28,25);r('#8d8464',3,5,26,2);r('#8d8464',3,17,26,2);r('#8d8464',3,27,26,2);
      r('#9cac90',6,8,6,8);r('#527973',17,9,8,7);r('#b69364',5,20,10,6);r('#79856b',19,20,5,6);break;
    case 'power':
      r(S.ink,3,2,26,28);r('#607d78',4,3,24,25);r('#a1b4a3',5,3,22,2);r('#365854',7,7,18,17);
      r('#ccb478',8,8,16,5);p('#384842',[[16,8],[12,12],[16,12],[14,15],[20,10],[16,10]]);
      r('#243e42',9,18,12,2);r('#9aad97',23,17,2,6);r('#273e3c',9,23,12,1);break;
    case 'gauge':
      r(S.ink,3,3,26,27);r('#a1b7ac',4,4,24,23);r('#d3d8b9',5,4,22,2);e('#2b454c',7,7,18,17);e('#d5d5b6',9,9,14,13);
      p('#85584c',[[16,11],[18,12],[16,18],[14,17]]);r('#263f46',15,15,2,3);r('#647e77',6,26,20,1);break;
    case 'samples':
      r('#233c45',2,3,28,27);r('#a7b9a8',3,4,26,3);r('#a7b9a8',3,26,26,2);
      for(const px of[6,16]){r('#8eaca4',px,11,8,13);r('#d7d6ba',px,8,8,3);r('#ac6559',px+1,18,6,5);r('#e7ddbd',px+1,12,2,4);}break;
    case 'pipe':
      r('#1f373f',2,11,28,15);r('#6b8e8a',2,13,28,10);r('#acc1b2',2,13,28,2);r('#456967',20,2,9,15);r('#9bb3a5',21,2,2,12);
      e('#1b363e',7,6,18,20);e('#b79868',8,7,16,18);e('#294b52',11,10,10,12);
      r('#b79868',14,8,3,16);r('#b79868',9,14,14,3);e('#d5c396',13,12,6,7);break;
    case 'rope':
      r('#293f43',2,25,28,4);e('#21353b',2,4,26,23);e('#a8956d',3,5,24,20);e('#6a684f',6,8,18,15);e('#c5af7b',7,9,16,12);e('#293f43',10,11,10,8);
      r('#b7a477',24,20,3,8);r('#b7a477',20,27,7,2);break;
  }
  c.restore();
}

function building(c:PixelContext,b:Building,world:MapData):void {
  const {r}=brush(c),tile=(x:number,y:number)=>world.tiles[y]?.[x];
  const industrial=['pump','utility','observatory','laboratory'].includes(b.kind);
  const market=b.kind==='market';
  // Clip all raised fixtures, signs and wall materials to the existing collision wall.
  c.save();c.beginPath();
  for(let y=b.y;y<b.y+b.h;y+=32)for(let x=b.x;x<b.x+b.w;x+=32)if(tile(x/32,y/32)===3)c.rect(x,y,32,32);
  c.clip();
  const wall=industrial?'#637d79':market?'#758271':b.kind==='warehouse'?'#879186':'#788779';
  r(wall,b.x,b.y,b.w,30);r('#bbbf9d',b.x+1,b.y,b.w-2,2);r('#344d4b',b.x,b.y+26,b.w,5);
  if(market){
    const shade=b.name==='滨禾水产'?'#537d78':'#9d7253';
    for(let dx=4;dx<b.w-4;dx+=24){r(shade,b.x+dx,b.y+5,22,15);r('#c6b88e',b.x+dx,b.y+5,2,14);}
    r('#344a43',b.x+6,b.y+20,b.w-12,3);
    r('#6b6550',b.x+b.w-38,b.y+10,22,9);r('#beaa7e',b.x+b.w-36,b.y+11,18,1);
  } else if(industrial || b.kind==='warehouse'){
    for(let dx=7;dx<b.w;dx+=12){r('#435e5d',b.x+dx,b.y+4,2,21);r('#8b9f8e',b.x+dx+2,b.y+4,1,20);}
  } else {
    r('#bbc0a0',b.x+7,b.y+21,b.w-14,2);r('#566f63',b.x+7,b.y+23,b.w-14,3);
  }
  const props:Record<string,Prop[]>={home:['window','goods'],workshop:['tools','motor'],shop:['goods','window'],market:['fish','icebox'],warehouse:['motor','icebox'],utility:['power','tools'],observatory:['gauge','power'],laboratory:['samples','samples'],harbor:['rope','tools'],pump:['pipe','motor'],shelter:['window','tools']};
  const chosen=props[b.kind]??['window'];
  for(let x=b.x+32,n=0;x<b.x+b.w-32;x+=64,n++)prop(c,chosen[n%chosen.length],x,b.y+b.h-32,b.kind==='shelter');
  if(b.kind==='home' || b.kind==='shop')for(let x=b.x+96;x<b.x+b.w-28;x+=64)prop(c,'window',x,b.y,false);
  // The left top wall is long enough for these intentionally short, real names.
  const label=signs[b.name]??b.name, labelWidth=label.length*16+8;
  r('#213a42',b.x+5,b.y+4,labelWidth,22);r('#b8b38d',b.x+5,b.y+4,labelWidth,1);
  c.font='16px "Bincov Text", "Microsoft YaHei", sans-serif';c.textBaseline='top';c.fillStyle='#e0d7ae';c.fillText(label,b.x+9,b.y+6);c.textBaseline='alphabetic';
  // Low tide line follows walls, with salt at sheltered corners instead of random noise.
  r('#44645a',b.x,b.y+b.h-5,b.w,3);r('#a2b09a',b.x+3,b.y+b.h-4,18,1);r('#91a591',b.x+b.w-25,b.y+b.h-4,18,1);
  c.restore();
  // Flush floor drains and threshold paint never imply new cover or collision.
  r('#2c4245',b.x+b.w-54,b.y+b.h-48,20,9);
  for(let n=0;n<6;n++)r('#728d82',b.x+b.w-53+n*3,b.y+b.h-47,1,7);
  for(const y of[b.y,b.y+b.h-32])for(let x=b.x;x<b.x+b.w;x+=32)if(tile(x/32,y/32)===5){
    r('#a5a585',x+2,y+14,28,2);r('#293e41',x+2,y+16,28,2);
  }
  if(b.kind==='observatory'||b.kind==='pump'){
    r('#2b4344',b.x+34,b.y+38,3,b.h-76);for(let n=0;n<Math.floor((b.h-76)/12);n++)r(n%5?'#829886':'#cfb77e',b.x+35,b.y+40+n*12,n%5?6:10,2);
  }
}

function boat(c:PixelContext,x:number,y:number,v:number):void {
  c.save();c.translate(x,y);const{r,p}=brush(c);
  p('#112c36',[[22,0],[38,18],[43,68],[33,100],[10,100],[0,68],[5,18]]);
  p(v===1?'#a08c67':'#99afa4',[[21,3],[34,21],[38,68],[31,94],[12,94],[5,68],[9,21]]);
  p('#3e5a57',[[21,11],[30,25],[32,68],[27,87],[15,87],[10,67],[13,25]]);
  r('#b8bb96',11,38,21,3);r('#859a82',13,42,17,26);r('#24474d',16,45,11,18);
  r(v===2?'#a58161':'#b8baa1',12,68,19,15);r('#406269',15,70,13,7);r('#d2c6a1',15,69,13,1);
  r('#a2936c',20,15,2,64);r('#a2936c',8,31,27,2);r('#516e67',10,84,22,2);c.restore();
}

export function paintWorld(c:PixelContext,world:MapData):void {
  const {r}=brush(c),tile=(x:number,y:number)=>world.tiles[y]?.[x]??2;
  for(let y=0;y<world.tiles.length;y++)for(let x=0;x<world.tiles[y].length;x++)ground(c,tile(x,y),x,y);
  for(let y=0;y<world.tiles.length;y++)for(let x=0;x<world.tiles[y].length;x++){
    const value=tile(x,y),px=x*32,py=y*32;
    if(value!==2){
      if(tile(x,y-1)===2){r('#162f39',px,py,32,4);r('#96a692',px,py+4,32,2);}
      if(tile(x,y+1)===2){r('#172f38',px,py+26,32,6);r('#a5b09a',px,py+25,32,2);}
      if(tile(x-1,y)===2){r('#172f38',px,py,4,32);r('#849c8c',px+4,py,2,32);}
      if(tile(x+1,y)===2){r('#172f38',px+28,py,4,32);r('#8ba394',px+26,py,2,32);}
    }
    if(value===1){
      if(tile(x,y-1)!==1)r('#4e6465',px,py,32,2);
      if(tile(x-1,y)!==1)r('#4e6465',px,py,2,32);
      if(tile(x,y+1)!==1 && tile(x,y-1)===1 && x%3===0)r('#959476',px+5,py+6,20,2);
      if(tile(x+1,y)!==1 && tile(x-1,y)===1 && y%3===0)r('#959476',px+6,py+5,2,20);
    }
    if(value===6&&tile(x+1,y)===2&&y%3===0){r('#20383e',px+20,py+9,9,14);r('#b4ad83',px+18,py+7,12,5);r('#75877a',px+20,py+7,3,3);}
  }
  world.buildings.forEach(b=>building(c,b,world));
  [[67*32,20*32,0],[68*32,35*32,1],[67*32,43*32,2]].forEach(([x,y,v])=>boat(c,x,y,v));
}
