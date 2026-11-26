import {keys,names,units,normalize,scale,sum,profileKey,parse,portions,balance} from './core.mjs';

const appMode = document.documentElement.dataset.mode || 'server';
const canUseServer = appMode === 'server';
const scope = new URL('./', location.href).pathname;
const storeKey = scope === '/' ? 'mahlzeit.v1' : 'mahlzeit.v1:'+scope;
const $ = selector => document.querySelector(selector);
const app = $('#app'), dialog = $('#dialog');
const keyDefault = () => Object.fromEntries(keys.map(key => [key,{target:null,below:10,above:10,weight:1}]));
const defaults = () => ({goals:keyDefault(),days:{},profiles:{},templates:[],cache:{}});
let readError = false;
let data = defaults();
try {
  const saved = JSON.parse(localStorage.getItem(storeKey));
  if (saved) data = {...data,...saved};
} catch { readError = true; }
const format = new Intl.NumberFormat('de-DE',{maximumFractionDigits:1});
const dateLong = new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const monthLong = new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'});
const num = value => format.format(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const id = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2);
const dateKey = (date = new Date()) => [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const dateFrom = key => new Date(key+'T12:00:00');
let selected = dateKey(), month = dateFrom(selected), route = 'heute', draft = null, input = '', busy = false, timer, config = canUseServer ? null : {ai:false};
const icons = {
  heute:'<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/>',
  kalender:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-12 4h2m3 0h2m-7 3h2"/>',
  einstellungen:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="white"/><circle cx="15" cy="17" r="2.5" fill="white"/>',
  add:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="m14 5 5 5M5 19l4-.8L20 7a1.4 1.4 0 0 0 0-2l-1-1a1.4 1.4 0 0 0-2 0L6 15z"/>',
  trash:'<path d="M5 7h14m-12 0 1 13h8l1-13M9 7V4h6v3m-5 4v5m4-5v5"/>',
  bookmark:'<path d="M6 4h12v17l-6-4-6 4z"/>',
  prev:'<path d="m14 6-6 6 6 6"/>', next:'<path d="m10 6 6 6-6 6"/>'
};
function icon(name) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
}
function button(action,label,style='',glyph='',params='') {
  return '<button type="button" class="btn '+style+'" data-action="'+action+'" '+params+(style.includes('icon')?' aria-label="'+esc(label)+'" title="'+esc(label)+'"':'')+'>'+ (glyph ? icon(glyph) : '')+(style.includes('icon')?'':esc(label))+'</button>';
}
function toast(message) {
  $('#toast').textContent = message;
  clearTimeout(timer);
  timer = setTimeout(() => { $('#toast').textContent = ''; },4200);
}
function change(update) {
  let latest;
  try { latest=JSON.parse(localStorage.getItem(storeKey)); } catch { latest=null; }
  const next = structuredClone(latest ? {...defaults(),...latest} : data);
  update(next);
  try { localStorage.setItem(storeKey,JSON.stringify(next)); }
  catch { toast('Speichern fehlgeschlagen. Prüfe den Browserspeicher.'); return false; }
  data = next;
  return true;
}
function currentKey() { return route === 'kalender' ? selected : dateKey(); }
const dayGroups = key => data.days[key] || [];
const foods = key => dayGroups(key).flatMap(group => group.items);
const mealTotal = item => item.values[0] === null ? 'Nährwerte fehlen' : num(item.values[0])+' kcal';
function status(item) {
  const sources = {estimate:'Schätzung',database:'Datenbank',personal:'Persönlicher Wert',manual:'Manuell'};
  const product = item.source === 'database' && /^\d{8,14}$/.test(item.code || '')
    ? ' <a target="_blank" rel="noopener noreferrer" href="https://world.openfoodfacts.org/product/'+item.code+'">Open Food Facts</a>' : '';
  return '<div class="source"><span class="badge">'+(sources[item.source] || sources.manual)+'</span>'+product+(item.note?' '+esc(item.note):'')+'</div>';
}
function dashboard(key) {
  const values = sum(foods(key));
  const target = data.goals.kcal.target;
  const remaining = target - values[0];
  const progress = target ? Math.min(100, values[0]/target*100) : 0;
  const summary = target ? (remaining < -.05 ? num(-remaining)+' kcal über Ziel' : remaining > .05 ? num(remaining)+' kcal offen' : 'Kalorienziel erreicht') : 'Kein Kalorienziel';
  const macro = keys.slice(1).map((field,i) => {
    const goal = data.goals[field], value = values[i+1], target = goal.target;
    const delta = target ? value - target : 0;
    return '<div class="macro"><span>'+names[i+1]+'</span><strong>'+num(value)+' g</strong><small>'+(target ? 'Ziel '+num(target)+' g · '+(delta > 0 ? '+' : '')+num(delta)+' g' : 'Kein Ziel')+'</small></div>';
  }).join('');
  return '<section class="card hero" aria-label="Tagesbilanz"><div class="hero-top"><div><p class="eyebrow">Tagesbilanz</p><div class="calorie"><strong>'+num(values[0])+'</strong><span>'+(target?'/ '+num(target)+' ':'')+'kcal</span></div></div><span class="pill">'+summary+'</span></div>'+
    '<div class="track" '+(target?'role="progressbar" aria-label="Kalorienziel" aria-valuenow="'+Math.round(progress)+'"':'aria-hidden="true"')+'><i style="width:'+progress+'%"></i></div><div class="macros">'+macro+'</div></section>';
}
function entry(item,where,group='') {
  const params = 'data-id="'+item.id+'" data-where="'+where+'" data-group="'+group+'"';
  return '<div class="entry stack"><div class="row"><div><h3 class="entry-title">'+esc([item.brand,item.name].filter(Boolean).join(' '))+'</h3><p class="muted">'+num(item.quantity)+' '+esc(item.unit)+' · '+mealTotal(item)+'</p></div><div class="actions">'+button('edit','Lebensmittel bearbeiten','outline icon','edit',params)+button('delete-item','Lebensmittel löschen','outline icon','trash',params)+'</div></div>'+
    '<p class="muted">'+[1,2,3].map(i=>names[i]+' '+(item.values[i] === null ? '–' : num(item.values[i])+' g')).join(' · ')+'</p>'+status(item)+'</div>';
}
function draftBlock(key) {
  if (draft?.date !== key) return '';
  const incomplete = draft.items.some(item => item.values.some(value => value === null));
  return '<section class="card stack" id="draft" aria-labelledby="draft-title"><div class="row wrap"><div><h2 id="draft-title">Entwurf prüfen</h2><small>'+draft.items.length+' Lebensmittel</small></div>'+button('cancel-draft','Verwerfen','outline')+'</div>'+
  (draft.message?'<p class="warning">'+esc(draft.message)+'</p>':'')+
  draft.items.map(item=>entry(item,'draft')).join('')+
  '<label class="field">Name der Mahlzeit (optional)<input id="meal-name" maxlength="60" placeholder="z. B. Frühstück" value="'+esc(draft.name)+'"></label>'+
  '<label class="check"><input id="from-draft-template" type="checkbox" '+(draft.asTemplate?'checked':'')+'> Auch als Mahlzeitenvorlage speichern</label>'+
  '<div class="actions">'+button('confirm-draft','Einträge bestätigen','primary','add',incomplete?'disabled':'')+button('add-manual','Lebensmittel ergänzen','outline')+'</div>'+
  (incomplete?'<small>Ergänze fehlende Nährwerte, bevor du den Entwurf bestätigst.</small>':'')+'</section>';
}
function composer(key) {
  return '<section class="card stack"><div class="row wrap"><h2>Essen eintragen</h2>'+button('templates','Vorlagen'+(data.templates.length?' ('+data.templates.length+')':''),'outline','bookmark')+'</div>'+
    '<form id="food-form" class="stack"><label class="field">Was hast du gegessen?<textarea required maxlength="600" id="food-text" placeholder="z. B. 3 Eier und 4 Scheiben Vollkornbrot">'+esc(input)+'</textarea></label>'+
    '<div class="actions"><button class="btn primary" '+(busy?'disabled':'')+'>'+icon('add')+(busy?'Wird ausgewertet …':'Essen hinzufügen')+'</button>'+button('add-manual','Manuell','outline','',''+(busy?'disabled':''))+'</div></form></section>'+draftBlock(key);
}
function diary(key) {
  const groups = dayGroups(key);
  return '<section class="card stack"><div class="row wrap"><h2>Einträge</h2>'+(groups.length?button('delete-day','Tag leeren','outline','','data-date="'+key+'"'):'')+'</div>'+
  (!groups.length?'<div class="empty"><strong>Hier ist noch nichts eingetragen</strong><small>Füge dein Essen per Text oder aus einer Vorlage hinzu.</small></div>':groups.map(group=>
    '<article class="group"><div class="row wrap"><div><h3>'+esc(group.name)+'</h3><small>'+num(sum(group.items)[0])+' kcal</small></div><div class="actions">'+button('rename-group','Mahlzeit umbenennen','outline icon','edit','data-group="'+group.id+'"')+button('save-template','Als Vorlage speichern','outline icon','bookmark','data-group="'+group.id+'"')+'</div></div>'+group.items.map(item=>entry(item,'day',group.id)).join('')+'</article>').join(''))+'</section>';
}
function calendar() {
  const first = new Date(month.getFullYear(),month.getMonth(),1);
  const count = new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
  const days = [...Array((first.getDay()+6)%7)].map(()=>'<span></span>');
  for (let i=1;i<=count;i++) {
    const date = new Date(first.getFullYear(),first.getMonth(),i), key = dateKey(date), items = foods(key);
    const result = balance(items,data.goals), total = items.length ? num(sum(items)[0])+' kcal' : '';
    const title = dateLong.format(date)+' · '+result.label+(total?' · '+total:'');
    days.push('<button type="button" class="day '+(key===selected?'selected':'')+'" style="'+(result.color?'--day:'+result.color:'')+'" data-action="select-day" data-date="'+key+'" aria-label="'+esc(title)+'" title="'+esc(title)+'" aria-pressed="'+(key===selected)+'">'+i+(total?'<small>'+num(sum(items)[0])+'<span> kcal</span></small>':'')+'</button>');
  }
  return '<section class="card stack"><div class="row"><div class="actions">'+button('prev-month','Vorheriger Monat','outline icon','prev')+'</div><h2>'+esc(monthLong.format(month))+'</h2>'+button('next-month','Nächster Monat','outline icon','next')+'</div>'+
  '<div class="month-grid">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map(day=>'<span class="weekday">'+day+'</span>').join('')+days.join('')+'</div>'+
  '<div class="legend"><span><i style="background:#a5c4f3"></i> Unter Ziel</span><span><i style="background:#c5ebce"></i> Im Zielbereich</span><span><i style="background:#f4b3a7"></i> Über Ziel</span></div></section>';
}
function field(label,name,value,options='') {
  return '<label class="field">'+label+'<input name="'+name+'" value="'+esc(value)+'" '+options+'></label>';
}
function settings() {
  const fields = keys.map((key,i) => '<div class="group"><h3>'+names[i]+'</h3><div class="grid4">'+
    field(i ? 'Ziel in g' : 'Ziel in kcal',key+'-target',data.goals[key].target,'type="number" min="1" max="100000" step="any" placeholder="Offen"')+
    field('Unterhalb (%)',key+'-below',data.goals[key].below,'required type="number" min="0" max="100" step="any"')+
    field('Oberhalb (%)',key+'-above',data.goals[key].above,'required type="number" min="0" max="100" step="any"')+
    field('Gewichtung',key+'-weight',data.goals[key].weight,'required type="number" min="1" max="10" step="any"')+'</div></div>').join('');
  const profiles = Object.entries(data.profiles).map(([key,record])=>
    '<div class="entry row"><div><h3>'+esc([record.brand,record.name].filter(Boolean).join(' '))+'</h3><small>Pro 1 '+esc(record.unit)+' · '+record.values.map((value,i)=>num(value)+(i?' g':' kcal')+(i?' '+names[i]:'')).join(' · ')+'</small></div>'+
    '<div class="actions">'+button('edit-profile','Persönlichen Wert bearbeiten','outline icon','edit','data-profile="'+esc(key)+'"')+button('delete-profile','Persönlichen Wert löschen','outline icon','trash','data-profile="'+esc(key)+'"')+'</div></div>').join('');
  return '<section class="card stack"><h2>Tagesziele</h2><p class="muted">Leere Ziele fließen nicht in die Kalenderfarbe ein. Die Gewichtung von 1 bis 10 bestimmt, wie stark Abweichungen die Farbe beeinflussen.</p><form id="goals" class="stack">'+fields+'<button type="submit" class="btn primary">Ziele speichern</button></form></section>'+
    '<section class="card stack"><h2>Persönliche Lebensmittel</h2>'+(profiles||'<p class="muted">Speichere eine Korrektur im Lebensmitteleditor, damit sie beim nächsten Eintrag vorgeschlagen wird.</p>')+'</section>'+
    '<section class="card stack"><div class="row wrap"><h2>Mahlzeitenvorlagen</h2>'+button('templates','Vorlagen verwalten','outline','bookmark')+'</div></section>'+
    '<section class="card stack"><h2>Lebensmittelsuche</h2><p class="muted">'+(!canUseServer?'In dieser Version stehen lokale Richtwerte, Vorlagen und manuelle Eingaben zur Verfügung.':config===null?'Status wird geprüft …':config.ai?'NanoGPT ist eingerichtet.':'NanoGPT ist noch nicht eingerichtet. Richtwerte für gängige Lebensmittel, Produktsuche und manuelle Eingabe sind verfügbar.')+' Einträge und Ziele bleiben in diesem Browser.</p></section>';
}
function render() {
  if (dialog.open) dialog.close();
  const tabs = {heute:'Heute',kalender:'Kalender',einstellungen:'Einstellungen'};
  $('#navigation').innerHTML = Object.entries(tabs).map(([key,label])=>'<a href="#'+key+'" '+(route===key?'aria-current="page"':'')+'>'+icon(key)+label+'</a>').join('');
  const key = currentKey();
  const subtitle = route==='heute' ? dateLong.format(dateFrom(key)) : '';
  const title = '<div class="page-title">'+(subtitle?'<p>'+esc(subtitle)+'</p>':'')+'<h1>'+tabs[route]+'</h1></div>';
  const detail = route==='kalender'?'<div class="row wrap"><h2>'+esc(dateLong.format(dateFrom(key)))+'</h2><span class="pill">'+balance(foods(key),data.goals).label+'</span></div>':'';
  app.innerHTML = (readError?'<p class="warning">Der Browserspeicher konnte nicht gelesen werden.</p>':'')+title+
    (route==='einstellungen'?settings():(route==='kalender'?calendar()+detail:'')+dashboard(key)+
    (!keys.some(k=>data.goals[k].target)?'<div class="card row wrap"><p>Lege deine Tagesziele selbst fest.</p><a class="btn outline" href="#einstellungen">Ziele einstellen</a></div>':'')+
    composer(key)+diary(key));
}
function open(content) { dialog.innerHTML=content; if (!dialog.open) dialog.showModal(); }
function modalTitle(title) { return '<div class="row"><h2>'+esc(title)+'</h2>'+button('close-dialog','Schließen','outline')+'</div>'; }
function addDraft(items,key,options={}) {
  if (draft && draft.items.length && !confirm('Den aktuellen Entwurf ersetzen?')) return false;
  draft = {date:key,items:items.map(item=>({...item,id:id()})),name:options.name||'',asTemplate:false,message:options.message||''};
  render();
  $('#draft')?.scrollIntoView({block:'nearest'});
  return true;
}
function personal(item) {
  const sameIdentity = !item.alias || item.brand || item.alias===normalize(item.name);
  const term = normalize([item.brand,item.name].filter(Boolean).join(' '));
  const matching = Object.values(data.profiles).filter(record =>
    (sameIdentity && normalize(record.brand)===normalize(item.brand) && normalize(record.name)===normalize(item.name)) ||
    (record.alias && (record.alias===term || record.alias===item.alias)));
  const exact = sameIdentity && data.profiles[profileKey(item)];
  const record = exact || matching.find(record=>record.unit===item.unit) || (item.assumed && matching.length===1 ? matching[0] : null);
  if (!record) return item;
  const quantity = item.assumed && record.reference ? record.reference : item.quantity;
  return {...item,name:record.name,brand:record.brand,quantity,unit:record.unit,source:'personal',note:item.assumed?'Gespeicherte Portionsgröße.':'',code:undefined,values:scale(record.values,quantity)};
}
async function analyse(original,key) {
  if (busy || !original.trim()) return;
  if (draft?.items.length && !confirm('Den aktuellen Entwurf ersetzen?')) return;
  const parsed = parse(original);
  if (!parsed.length) {toast('Schreib ein Lebensmittel in das Textfeld.'); return;}
  const cacheKey = original.trim().toLowerCase().replace(/\s+/g,' ');
  const cached = Object.hasOwn(data.cache,cacheKey) ? data.cache[cacheKey] : null;
  let items = cached?.items || parsed;
  let message = cached?.message || '';
  const unresolved = items.map((item,index)=>({item,index})).filter(({item}) => personal(item).values.some(value=>value===null));
  if (!cached && unresolved.length && canUseServer) {
    busy=true; render();
    try {
      const response = await fetch('./api/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:unresolved.map(({item,index})=>({index,name:item.name,quantity:item.quantity,unit:item.unit,assumed:item.assumed}))}),signal:AbortSignal.timeout(26000)});
      if (!response.ok) throw new Error('API');
      const result=await response.json();
      const grouped = new Map();
      for (const suggestion of result.items) grouped.set(suggestion.index,[...(grouped.get(suggestion.index)||[]),suggestion]);
      items = items.flatMap((item,index)=>{
        const matches=grouped.get(index);
        if (!matches) return [item];
        return matches.map(candidate=>({...candidate,alias:matches.length===1?normalize(item.name):''}));
      });
      message = result.message || '';
    } catch { message='Die Lebensmittelsuche ist gerade nicht verfügbar. Ergänze fehlende Werte manuell.'; }
    finally { busy=false; }
  }
  if (!canUseServer && unresolved.length) message='Für diese Lebensmittel fehlen Richtwerte. Ergänze die Nährwerte im Entwurf.';
  if (!cached && items.every(item=>item.values.every(value=>value!==null))) {
    change(next=>{
      const entries = Object.entries(next.cache).filter(([k])=>k!==cacheKey).slice(-149);
      next.cache = Object.fromEntries([...entries,[cacheKey,{items,message}]]);
    });
  }
  draft=null;
  input='';
  addDraft(portions(items.map(personal)),key,{message});
  render();
  if (currentKey()===key && route!=='einstellungen') $('#draft')?.scrollIntoView({block:'nearest'});
}
function editFood(item,context) {
  const isProfile = context.where==='profile';
  open('<form id="food-edit" class="stack">'+modalTitle(isProfile?'Persönlichen Wert bearbeiten':item.name?'Lebensmittel bearbeiten':'Lebensmittel hinzufügen')+
  '<div class="grid2">'+field('Lebensmittel','name',item.name,'required maxlength="120"')+field('Marke (optional)','brand',item.brand,'maxlength="100"')+
  field('Menge','amount',item.quantity,'required type="number" min="0.001" max="100000" step="any" '+(isProfile?'readonly':''))+
  '<label class="field">Einheit<select name="unit" '+(isProfile?'disabled':'')+'>'+units.map(unit=>'<option '+(item.unit===unit?'selected':'')+'>'+unit+'</option>').join('')+'</select></label></div>'+
  '<p class="muted">Nährwerte für die oben eingetragene Menge.</p><div class="grid4">'+keys.map((key,i)=>field(names[i]+(i?' (g)':' (kcal)'),key,item.values[i]===null?'':Math.round(item.values[i]*10000)/10000,'required type="number" min="0" max="100000" step="any"')).join('')+'</div>'+
  (isProfile?'':status(item)+'<label class="check"><input name="remember" type="checkbox"> Werte als persönliches Lebensmittel speichern</label>')+
  '<button type="submit" class="btn primary">Speichern</button></form>');
  const form = $('#food-edit'), amount = form.elements.amount, unitControl = form.elements.unit;
  let last = item.quantity, lastUnit = item.unit;
  function resize() {
    const current = amount.valueAsNumber;
    if (current > 0 && last > 0 && unitControl.value === lastUnit) {
      for (const key of keys) if (form.elements[key].value !== '') form.elements[key].value = scale([form.elements[key].valueAsNumber],current/last)[0];
    }
    last = current;
    lastUnit = unitControl.value;
  }
  amount.addEventListener('change',resize);
  unitControl.addEventListener('change',()=>{ last=amount.valueAsNumber; lastUnit=unitControl.value; });
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const name=form.elements.name.value.trim(), brand=form.elements.brand.value.trim();
    if (!name) {toast('Gib einen Lebensmittelnamen ein.');return;}
    const quantity=amount.valueAsNumber, unit=unitControl.value;
    const values = keys.map(key => form.elements[key].valueAsNumber);
    const changed = name!==item.name || brand!==(item.brand||'') || unit!==item.unit || values.some((v,i)=>item.values[i]===null || Math.abs(v - item.values[i]*quantity/item.quantity) > .00011);
    const remember = isProfile || form.elements.remember.checked;
    const updated = {...item,id:item.id||id(),name,brand,quantity,unit,values};
    if (changed) Object.assign(updated,{source:'manual',note:'',code:undefined,alias:undefined});
    if (remember) {
      updated.source='personal';
      updated.note='';
      updated.code=undefined;
    }
    if (remember || context.where==='day') {
      const ok=change(next=>{
        if (remember) {
          const key = profileKey(updated);
          const reference = isProfile ? next.profiles[context.key]?.reference || quantity : quantity;
          if (isProfile && context.key!==key) delete next.profiles[context.key];
          const sameFood = name===item.name && brand===(item.brand||'');
          const alias = sameFood ? item.alias || '' : '';
          next.profiles[key] = {name,brand,unit,alias,reference,values:values.map(value=>value/quantity)};
        }
        if (context.where==='day') {
          const group=(next.days[context.date]||[]).find(group=>group.id===context.group);
          if (group) group.items=group.items.map(food=>food.id===updated.id?updated:food);
        }
      });
      if (!ok) return;
    }
    if (context.where==='draft') {
      if (!draft || draft.date!==context.date) {
        draft={date:context.date,name:'',items:[],message:'',asTemplate:false};
      }
      const index=draft.items.findIndex(food=>food.id===updated.id);
      if (index<0) draft.items.push(updated);
      else draft.items[index]=updated;
    }
    render();
    if (context.where==='draft') $('#draft')?.scrollIntoView({block:'nearest'});
    toast(remember?'Persönlicher Wert gespeichert.':'Lebensmittel gespeichert.');
  });
}
function templates() {
  open('<div class="stack">'+modalTitle('Mahlzeitenvorlagen')+
    (data.templates.length?data.templates.map(template=>'<article class="entry stack"><div><h3>'+esc(template.name)+'</h3><small>'+template.items.length+' Lebensmittel · '+num(sum(template.items)[0])+' kcal</small></div><div class="actions">'+button('use-template','Als Entwurf verwenden','primary','','data-id="'+template.id+'" '+(busy?'disabled':''))+button('rename-template','Umbenennen','outline','','data-id="'+template.id+'"')+button('delete-template','Vorlage löschen','outline icon','trash','data-id="'+template.id+'"')+'</div></article>').join(''):'<p class="muted">Speichere eine Mahlzeit aus einem Entwurf oder über das Lesezeichen bei einem Eintrag.</p>')+'</div>');
}
function nameDialog(title,name,callback) {
  open('<form id="name-form" class="stack">'+modalTitle(title)+field('Name','name',name,'required maxlength="60"')+'<button type="submit" class="btn primary">Speichern</button></form>');
  $('#name-form').addEventListener('submit',event=>{
    event.preventDefault();
    const value=event.currentTarget.elements.name.value.trim();
    if (value && callback(value)) {render();toast('Gespeichert.');}
  });
}
document.addEventListener('click',event=>{
  const control=event.target.closest('[data-action]');
  if (!control) return;
  const {action,id:itemId,where,group:groupId,date,profile}=control.dataset;
  const key=currentKey(), group=dayGroups(key).find(group=>group.id===groupId);
  const item=(where==='draft'?draft?.items:group?.items)?.find(item=>item.id===itemId);
  const template=data.templates.find(template=>template.id===itemId);
  switch(action) {
    case 'close-dialog': dialog.close(); break;
    case 'prev-month': case 'next-month':
      month=new Date(month.getFullYear(),month.getMonth()+(action==='next-month'?1:-1),1);
      render(); break;
    case 'select-day': selected=date; render(); break;
    case 'add-manual':
      if (draft?.date!==key && draft?.items.length && !confirm('Den Entwurf für den anderen Tag ersetzen?')) break;
      editFood({name:'',brand:'',quantity:1,unit:'Stück',values:[null,null,null,null],source:'manual',note:''},{where:'draft',date:key});break;
    case 'edit': if (item) editFood(item,{where,group:groupId,date:key}); break;
    case 'delete-item':
      if (!item) break;
      if (where==='draft') { draft.items=draft.items.filter(food=>food.id!==itemId); render(); }
      else if (confirm('„'+item.name+'“ aus dem Tag löschen?') && change(next=>{
        const groups=next.days[key]||[];
        next.days[key]=groups.map(g=>g.id===groupId?{...g,items:g.items.filter(food=>food.id!==itemId)}:g).filter(g=>g.items.length);
        if (!next.days[key].length) delete next.days[key];
      })) render();
      break;
    case 'cancel-draft': draft=null; render(); break;
    case 'confirm-draft': {
      if (!draft?.items.length) {toast('Füge ein Lebensmittel hinzu.');break;}
      if (draft.items.some(food=>food.values.some(value=>value===null))) break;
      const name=draft.name.trim() || (draft.asTemplate ? draft.items.slice(0,3).map(food=>food.name).join(', ').slice(0,60) : 'Mahlzeit');
      if (!change(next=>{
        (next.days[key] ??= []).push({id:id(),name,items:draft.items});
        if (draft.asTemplate) next.templates.push({id:id(),name,items:draft.items});
      })) break;
      draft=null;render();toast('Mahlzeit eingetragen.');break;
    }
    case 'delete-day':
      if (confirm('Alle Einträge für diesen Tag löschen?') && change(next=>{delete next.days[date];})) render();
      break;
    case 'rename-group':
      if (group) nameDialog('Mahlzeit umbenennen',group.name,value=>change(next=>{
        const target=(next.days[key]||[]).find(g=>g.id===groupId);
        if (target) target.name=value;
      }));
      break;
    case 'save-template':
      if (group) nameDialog('Als Mahlzeitenvorlage speichern',group.name,value=>change(next=>{next.templates.push({id:id(),name:value,items:group.items});}));
      break;
    case 'templates': templates(); break;
    case 'use-template':
      if (!template) break;
      if (addDraft(template.items,key,{name:template.name}) && route==='einstellungen') location.hash='heute';
      break;
    case 'rename-template':
      if (template) nameDialog('Vorlage umbenennen',template.name,value=>change(next=>{
        const target=next.templates.find(t=>t.id===itemId);
        if (target) target.name=value;
      }));
      break;
    case 'delete-template':
      if (template && confirm('Vorlage „'+template.name+'“ löschen?') && change(next=>{next.templates=next.templates.filter(t=>t.id!==itemId);})) {render();templates();}
      break;
    case 'edit-profile':
      if (data.profiles[profile]) editFood({...data.profiles[profile],quantity:1,source:'personal'},{where:'profile',key:profile});
      break;
    case 'delete-profile':
      if (data.profiles[profile] && confirm('Diesen persönlichen Wert löschen?') && change(next=>{delete next.profiles[profile];})) render();
      break;
  }
});
app.addEventListener('input',event=>{
  if (event.target.id==='food-text') input=event.target.value;
  if (event.target.id==='meal-name' && draft) draft.name=event.target.value;
  if (event.target.id==='from-draft-template' && draft) draft.asTemplate=event.target.checked;
});
app.addEventListener('submit',event=>{
  event.preventDefault();
  if (event.target.id==='food-form') {
    analyse($('#food-text').value,currentKey());
  } else if (event.target.id==='goals') {
    const form = new FormData(event.target);
    if (change(next=>{
      for (const key of keys) {
        next.goals[key]=Object.fromEntries(['target','below','above','weight'].map(fieldname=>{
          const value=form.get(key+'-'+fieldname);
          return [fieldname,value===''?null:Number(value)];
        }));
      }
    })) {render(); toast('Tagesziele gespeichert.');}
  }
});
function go() {
  const hash=location.hash.slice(1);
  route=['heute','kalender','einstellungen'].includes(hash)?hash:'heute';
  render();
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',go);
window.addEventListener('storage',event=>{
  if (event.key!==storeKey) return;
  try { data={...defaults(),...JSON.parse(event.newValue)}; if (!dialog.open) render(); } catch { readError=true; }
});
go();
if (canUseServer) fetch('./api/config',{cache:'no-store'}).then(result=>result.json()).then(result=>{config=result;if(route==='einstellungen'&&!dialog.open&&!$('#goals').contains(document.activeElement))render();}).catch(()=>{config={ai:false};if(route==='einstellungen'&&!dialog.open)render();});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
