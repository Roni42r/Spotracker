export const keys = ['kcal','protein','carbs','fat'];
export const names = ['Kalorien','Eiweiß','Kohlenhydrate','Fett'];
export const units = ['g','ml','Stück'];
export const normalize = value => String(value).toLowerCase().normalize('NFKC').trim().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const scale = (values, factor) => values.map(value => Math.round(value * factor * 10000) / 10000);
export const sum = items => keys.map((_, i) => items.reduce((total, food) => total + food.values[i], 0));
export const profileKey = item => JSON.stringify([normalize(item.brand || ''), normalize(item.name), item.unit]);
const staples = [
  [/^eier?$|^hühnereier?$/, 'Ei', 'Stück', 1, [72,6.3,0.4,4.8], 1],
  [/^vollkornbrot$/, 'Vollkornbrot', 'Stück', 1, [90,3.2,15.6,1.3], 1],
  [/^haferflocken$/, 'Haferflocken', 'g', 100, [370,13,59,7], 50],
  [/^(voll)?milch( 3 5( prozent)?)?$/, 'Milch 3,5 %', 'ml', 100, [64,3.3,4.8,3.5], 200],
  [/^skyr( natur)?$/, 'Skyr Natur', 'g', 100, [63,11,4,0.2], 150],
  [/^bananen?$/, 'Banane', 'Stück', 1, [105,1.3,27,0.4], 1],
  [/^äpfel$|^apfel$/, 'Apfel', 'Stück', 1, [78,0.4,20.7,0.3], 1],
  [/^reis( gekocht)?$/, 'Reis, gekocht', 'g', 100, [130,2.7,28,0.3], 150],
  [/^hähnchenbrust( gegart)?$/, 'Hähnchenbrust, gegart', 'g', 100, [165,31,0,3.6], 150],
  [/^(mager)?quark$/, 'Magerquark', 'g', 100, [67,12,4,0.2], 150]
];
export function parse(text) {
  const segments = text.replace(/,\s*(?=\d+(?:[.,]\d+)?\s*(?:g|ml)\s*(?:$|[,;\n]|und\b|mit\b))/gi, ' @ ')
    .split(/\s+(?:und|mit|plus)\s+|[;\n]|(?<!\d),|,(?!\d)|\s*\+\s*/i).map(value => value.trim()).filter(Boolean);
  return segments.slice(0,20).map(segment => {
    const [rawPart, explicitWeight] = segment.split(' @ ');
    const trailing = !explicitWeight && /^([^0-9].*?)\s+(\d+(?:[.,]\d+)?\s*(?:g|ml))$/i.exec(rawPart);
    const part = trailing ? trailing[1] : rawPart;
    const weight = explicitWeight || trailing?.[2];
    const barcodeOnly = /^(?:ean\s*:?\s*)?(?:\d{8}|\d{12,14})$/i.test(part);
    const match = barcodeOnly ? null : /^(\d+(?:[.,]\d+)?)\s*(?:(kg|g|ml|l|stück|scheiben?|becher|packungen?)\s+)?(.+)$/i.exec(part);
    const extra = /^(\d+(?:[.,]\d+)?)\s*(g|ml)$/i.exec(weight || '');
    let quantity = Number((extra?.[1] || match?.[1] || '').replace(',','.'));
    let unit = (extra?.[2] || match?.[2] || (match ? 'Stück' : '')).toLowerCase();
    if (unit === 'kg' || unit === 'l') { quantity *= 1000; unit = unit === 'kg' ? 'g' : 'ml'; }
    if (unit && !['g','ml'].includes(unit)) unit = 'Stück';
    const label = (match?.[3] || part).trim();
    const assumed = !match && !extra;
    const segmentName = normalize(label);
    const staple = staples.find(([regex]) => regex.test(segmentName));
    let values = [null,null,null,null], note = 'Nährwerte und Menge prüfen.';
    if (staple) {
      const [, name, baseUnit, baseQuantity, baseValues, serving] = staple;
      const gramPerPiece = {'Ei':50,'Vollkornbrot':40,'Banane':120,'Apfel':150};
      quantity ||= serving;
      unit ||= baseUnit;
      const converted = unit === baseUnit ? quantity
        : unit === 'Stück' ? quantity * serving
        : baseUnit === 'Stück' && unit === 'g' ? quantity / gramPerPiece[name] : NaN;
      if (Number.isFinite(converted)) values = scale(baseValues, converted / baseQuantity);
      note = assumed ? 'Menge und Nährwerte geschätzt.' : 'Richtwert, abhängig von Größe und Produkt.';
      return {name, brand:'', quantity, unit, values, source:'estimate', note};
    }
    return {name:label, brand:'', quantity:quantity || 1, unit:unit || 'Stück', values, source:'manual', note, assumed};
  });
}
export function portions(items) {
  return items.flatMap(item => {
    const count = item.unit === 'Stück' && Number.isInteger(item.quantity) && item.quantity <= 24 ? item.quantity : 1;
    if (count < 2) return [{...item}];
    const values = item.values.map(value => value === null ? null : value / count);
    return Array.from({length:count}, () => ({...item, quantity:1, values:[...values]}));
  });
}
function blend(start,end,amount) {
  const a=start.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16));
  const b=end.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16));
  return '#'+a.map((value,index)=>Math.round(value+(b[index]-value)*amount).toString(16).padStart(2,'0')).join('');
}
export function balance(items, goals) {
  if (!items.length) return {label:'Keine Einträge', color:''};
  const totals = sum(items);
  let low = 0, high = 0, missing = 0, below = 0, above = 0;
  const active = keys.map((key,index) => ({...goals[key], value:totals[index]})).filter(g => g.target > 0);
  if (!active.length) return {label:'Ziele fehlen', color:''};
  const weight = active.reduce((total, goal) => total + goal.weight, 0);
  for (const goal of active) {
    const difference = (goal.value / goal.target - 1) * 100;
    const deficit = Math.max(0, -difference - goal.below);
    const excess = Math.max(0, difference - goal.above);
    if (deficit) { missing++; below = Math.max(below,deficit); }
    if (excess) { missing++; above = Math.max(above,excess); }
    low += deficit * goal.weight / weight;
    high += excess * goal.weight / weight;
  }
  if (!missing) return {label:'Im Zielbereich', color:'#a7f3d0'};
  const overshot = high === low ? above >= below : high > low;
  const strength = Math.min(1, Math.max(overshot ? high : low, (overshot ? above : below) * 0.12) / 30);
  const color = overshot ? blend('#a7f3d0','#fca5a5',strength) : blend('#a7f3d0','#bfdbfe',strength);
  const direction = below && above ? 'Ziele teils unter- und überschritten' : overshot ? 'Über Zielbereich' : 'Unter Zielbereich';
  return {label:direction, color};
}




