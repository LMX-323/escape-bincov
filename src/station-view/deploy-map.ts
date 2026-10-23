import type { RunWorld } from '../hideout-runtime/contract';
import { esc } from '../html';

interface Region {
  id: string; name: string; area: string; x: number; y: number;
  description: string; features: string; world?: RunWorld;
}

// A geographic overview, not connected playable terrain. Only existing worlds get a deployment target.
// The old-town slot offers today's coastal street, not a claim that the planned old town is complete.
const REGIONS: readonly Region[] = [
  { id: 'old-town', name: '老城街区', area: '内陆 · 居住区', x: 28, y: 39, world: 'buildings', description: '沿着街口进入居民楼，在楼道与院落间寻找物资。留意转角，把回家的路记清。', features: '沿海街区 / 居民楼 / 地下空间' },
  { id: 'mall', name: '滨湾商场', area: '内陆 · 商业区', x: 44, y: 56, world: 'mall', description: '卷帘门后的卖场早已失去秩序。穿过货架与中庭，在两层商场和露台之间寻找撤离路线。', features: '两层卖场 / 室外露台 / 室内搜刮' },
  { id: 'hospital', name: '县医院', area: '内陆 · 医疗区', x: 17, y: 24, description: '仍在有限运转的门诊、病房与隔离区。医护守着药库，也守着最后的救治顺序。', features: '门诊 / 药库 / 隔离区' },
  { id: 'old-hospital', name: '县医院旧址', area: '内陆 · 废弃院区', x: 14, y: 53, description: '搬迁后的病房与档案室被拾荒者占据。封闭地下层里，旧病例仍等待有人读懂。', features: '废弃病房 / 档案室 / 封闭地下层' },
  { id: 'factory', name: '工厂区', area: '内陆 · 工业区', x: 48, y: 18, description: '停工的厂房、铁路货场与维修车间连成一片。设备之间的窄路通向开阔而危险的装卸场。', features: '机械厂 / 维修车间 / 铁路货场' },
  { id: 'laboratory', name: '隐秘实验室', area: '内陆 · 地下设施', x: 69, y: 15, description: '停产厂房之下，样本库与封闭试验区仍藏着灾难被放大的证据。', features: '样本库 / 设备间 / 封闭试验区' },
  { id: 'highway', name: '西线国道', area: '内陆 · 县境通道', x: 29, y: 9, description: '废弃车队停在加油站与检查口之间。县内高地上的公路，曾是通往外面的方向。', features: '加油站 / 服务区 / 检查口' },
  { id: 'market', name: '水产市场', area: '沿海 · 冷链交易区', x: 25, y: 73, description: '交易厅已经安静，冷库和维修仓里仍可能留下补给。这里曾是水产站最熟悉的一条采购线。', features: '交易厅 / 冷库 / 维修仓' },
  { id: 'observatory', name: '观测站与泵房', area: '沿海 · 海堤设施', x: 62, y: 71, description: '观测仪记录潮位，泵房守着海堤。沿维护道路寻找样本室与配电所，拼出海的规律。', features: '观测主楼 / 样本室 / 海堤泵房' },
  { id: 'lighthouse', name: '灯塔岬角', area: '沿海 · 岬角高地', x: 85, y: 84, description: '灯塔立在海边高地，废炮台与宿舍沿坡道分布。有人把这里当作庇护，也有人把它当作信仰。', features: '灯塔 / 山间坡道 / 地下设备间' },
  { id: 'harbor', name: '旧渔港', area: '海运 · 港口仓储', x: 66, y: 49, description: '修船棚、燃油库和集装箱围着老码头。船册与运输记录，或许能解释那些不该抵港的货物。', features: '船务所 / 燃油库 / 集装箱码头' },
  { id: 'freighter', name: '远汐号', area: '海运 · 搁浅货轮', x: 88, y: 60, description: '货轮歪着船身留在港外。狭窄舱道连着甲板、机舱和污染货舱，货运清单记录着最后一次航行。', features: '甲板 / 船员舱 / 货舱' },
];
const LEGACY: Region = { id: 'coast', name: '沿海封锁区', area: '历史行动测试', x: 0, y: 0, world: 'coast', description: '仅在显式测试入口保留的经典行动。', features: '经典规则 / 每局 10 分钟' };

/** Preview state never grants access: the host's existing world allowlist remains authoritative. */
export function deploymentRegion(worlds: readonly RunWorld[], world: RunWorld, preview: string | null): Region {
  const regions = worlds.includes('coast') ? [...REGIONS, LEGACY] : REGIONS;
  return regions.find(r => r.id === preview) ?? regions.find(r => r.world === world) ?? REGIONS[0];
}

export function deploymentWorld(region: Region, worlds: readonly RunWorld[]): RunWorld | null {
  return region.world && worlds.includes(region.world) ? region.world : null;
}

const displayName = (r: Region) => r.world === 'buildings' ? '沿海街区' : r.name;

function terrain(terrainUrl: string) {
  return `<img class="county-art" src="${terrainUrl}" alt="" draggable="false">
    <svg class="county-terrain" viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true">
    <defs><pattern id="survey-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="#c9e8cc" stroke-opacity=".12"/></pattern></defs>
    <rect width="1000" height="660" fill="url(#survey-grid)"/>
    <g class="county-map-text"><text x="18" y="28">A—01</text><text x="464" y="28">B—02</text><text x="900" y="28">C—03</text>
    <text x="836" y="263">滨 科 夫 湾</text><text x="839" y="284">BINCOV BAY</text></g>
    <g class="county-compass" transform="translate(931 74)"><path d="M0-25L8 8 0 3-8 8Z"/><path d="M-20 0H20M0-30V25"/><text y="-36">N</text></g>
  </svg>`;
}

export function countyMapHtml(region: Region, worlds: readonly RunWorld[], terrainUrl: string): string {
  const active = deploymentWorld(region, worlds);
  const available = REGIONS.filter(r => deploymentWorld(r, worlds)).length;
  const nodes = REGIONS.map((r, index) => {
    const world = deploymentWorld(r, worlds), on = r.id === region.id;
    const attrs = `class="county-node ${world ? 'world available' : 'unbuilt'} ${on ? 'on' : ''}" style="--x:${r.x}%;--y:${r.y}%"`;
    const body = `<span class="node-marker" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span class="node-label"><b>${esc(world ? displayName(r) : r.name)}</b><small>${world ? '可出击' : '暂未开发'}</small></span>`;
    return world ? `<label ${attrs}><input type="radio" name="world" value="${world}" aria-label="${displayName(r)} · 可出击" ${on ? 'checked' : ''}>${body}</label>`
      : `<button type="button" ${attrs} data-region="${r.id}" aria-pressed="${on}" aria-label="${r.name} · 暂未开发，查看规划">${body}</button>`;
  }).join('');
  return `<section class="county-survey" aria-label="滨科夫县区域选择">
    ${worlds.includes('coast') ? `<label class="world county-legacy ${region.id === 'coast' ? 'on' : ''}"><input type="radio" name="world" value="coast" ${region.id === 'coast' ? 'checked' : ''}><b>沿海封锁区</b><small>历史行动测试</small></label>` : ''}
    <header class="county-heading"><div><small>作战终端 / 区域总览</small><h3>滨科夫县<span>BINCOV</span></h3></div><div class="county-count"><strong>${String(available).padStart(2, '0')}</strong><span>/ 12 区域可出击</span></div></header>
    <div class="county-chart">${terrain(terrainUrl)}<div class="county-scan" aria-hidden="true"></div>
      ${active && region.id !== 'coast' ? `<svg class="county-route" viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true"><path d="M360 581L250 482${active === 'mall' ? 'L440 370' : 'L335 356 280 257'}"/><circle cx="${region.x * 10}" cy="${region.y * 6.6}" r="38"/></svg>` : ''}
      <div class="county-nodes" role="group" aria-label="选择行动区域或查看未开发区域">${nodes}</div>
      <div class="county-base"><i aria-hidden="true">⌂</i><span>滨科夫水产站<small>当前据点</small></span></div>
      <div class="county-scale" aria-hidden="true"><i></i>区域方位示意</div>
    </div>
    <footer class="county-legend"><span><i class="live"></i>可出击 ${available}</span><span><i></i>暂未开发 ${REGIONS.length - available}</span><small>选择标记查看区域 · 虚线路线为示意</small></footer>
  </section>`;
}

export function regionBriefHtml(region: Region, worlds: readonly RunWorld[]): string {
  const world = deploymentWorld(region, worlds), name = world ? displayName(region) : region.name;
  return `<div class="region-brief ${world ? '' : 'unbuilt'}"><button type="button" class="county-back" data-act="county-map">↑ 返回地图</button><div class="region-eyebrow"><span>区域情报</span><strong>${world ? '● 可出击' : '◇ 暂未开发'}</strong></div>
    <p class="region-area">${esc(region.area)}${world === 'buildings' ? ' / 老城街区现有入口' : ''}</p><h3>${esc(name)}</h3>
    <div class="region-signal" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><span>${world ? '区域入口已开放' : '区域尚未开放'}</span></div>
    <p class="region-description">${esc(region.description)}</p><p class="region-features">${esc(region.features)}</p>
    ${world ? `<div class="region-stats"><span>行动时限<b>10 <small>分钟</small></b></span><span>撤离后返回<b>水产站</b></span></div>${world === 'buildings' ? '<p class="region-development">当前可玩沿海街区；老城完整区域仍待扩展。</p>' : ''}` : '<p class="region-development">以上为区域规划，地图与玩法暂未开发，当前无法出击。</p>'}</div>`;
}
