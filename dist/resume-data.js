import { load, JSON_SCHEMA } from './vendor/js-yaml.mjs';
import { ANIMAL_SPECIES } from './animal-config.js';

export const SECTION_TYPES = ['about','experience','projects','skills','education','contact','text'];

export function parseResume(source) {
  if (source.length > 250000) throw new Error('Resume content must be smaller than 250 KB.');
  let resume;
  try { resume = load(source, { schema: JSON_SCHEMA, filename: 'resume.yml' }); }
  catch (error) {
    const location = error.mark ? ` at line ${error.mark.line + 1}, column ${error.mark.column + 1}` : '';
    throw new Error(`YAML${location}: ${error.reason || error.message}`);
  }
  const errors = validateResume(resume);
  if (errors.length) throw new Error(errors.join('\n'));
  return resume;
}

export function validateResume(resume) {
  const errors = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);
  const obj = (value, path, keys) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) { fail(path, 'expected a group of named fields.'); return false; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field; check the spelling.');
    return true;
  };
  const str = (value, path, required=false, max=16000) => {
    if (value === undefined && !required) return;
    if (typeof value !== 'string' || !value.trim()) fail(path, 'expected non-empty text; put dates and numbers in quotes.');
    else if (value.length > max) fail(path, `keep this text under ${max} characters.`);
  };
  const list = (value, path, required=false) => {
    if (value === undefined && !required) return false;
    if (!Array.isArray(value)) { fail(path, 'expected a list using "-" entries or [square brackets].'); return false; }
    if (required && !value.length) fail(path, 'add at least one entry, or set enabled: false.');
    return true;
  };
  const texts = (value, path, required=false) => { if (list(value,path,required)) value.forEach((v,i)=>str(v,`${path}[${i}]`,true)); };
  const url = (value,path) => {
    str(value,path,true,2048);
    if (typeof value !== 'string') return;
    try { const parsed = new URL(value); if (!['https:','http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error(); }
    catch { fail(path,'use a full https:// or http:// website address.'); }
  };
  const links = (value,path) => {
    if (list(value,path)) value.forEach((link,i)=>{const p=`${path}[${i}]`;if(obj(link,p,['label','url'])){str(link.label,p+'.label',true,80);url(link.url,p+'.url');}});
  };
  const logo = (value,path) => {
    if(value===undefined)return;
    if(typeof value==='string'&&/^(?:\.\/)?assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(svg|png|jpe?g|webp|gif|ico)$/i.test(value))return;
    if(typeof value==='string'&&/^https?:\/\//i.test(value)){url(value,path);return;}
    fail(path,'use an image path such as assets/companies/company.svg, or a full https:// image URL.');
  };
  if (!obj(resume,'resume',['version','profile','sections'])) return errors;
  if (resume.version !== 1) fail('version','must be 1.');
  if (obj(resume.profile,'profile',['name','headline','location','summary','email','phone','links','resume_pdf','education'])) {
    const p=resume.profile;
    str(p.name,'profile.name',true,150);str(p.headline,'profile.headline',true,180);
    str(p.location,'profile.location');str(p.summary,'profile.summary');
    str(p.email,'profile.email');str(p.phone,'profile.phone');
    if (p.email !== undefined && (typeof p.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))) fail('profile.email','enter an email address.');
    if (p.phone !== undefined && (typeof p.phone !== 'string' || !/^\+?[0-9 ()\-.]+$/.test(p.phone))) fail('profile.phone','use a quoted phone number with digits, spaces, +, -, or parentheses.');
    links(p.links,'profile.links');
    if(p.resume_pdf!==undefined&&(typeof p.resume_pdf!=='string'||!/^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.pdf$/i.test(p.resume_pdf)))fail('profile.resume_pdf','use a local PDF path such as assets/resume/your-resume.pdf.');
    if(list(p.education,'profile.education'))p.education.forEach((entry,i)=>{
      const q=`profile.education[${i}]`;
      if(obj(entry,q,['institution','degree','location','period'])){
        str(entry.institution,q+'.institution',true);str(entry.degree,q+'.degree',true);str(entry.location,q+'.location');str(entry.period,q+'.period');
      }
    });
  }
  if (!list(resume.sections,'sections',true)) return errors;
  const ids=new Set();
  resume.sections.forEach((s,i)=>{
    const p=`sections[${i}]`;
    if (!obj(s,p,['id','type','title','label','enabled','intro','items','groups','paragraphs','links','animals','story_title','featured'])) return;
    str(s.id,p+'.id',true,60);str(s.title,p+'.title',true,120);str(s.label,p+'.label',false,30);str(s.intro,p+'.intro');
    if (typeof s.id==='string' && !/^[a-z][a-z0-9-]*$/.test(s.id)) fail(p+'.id','use lowercase letters, digits, and hyphens, starting with a letter.');
    if (ids.has(s.id)) fail(p+'.id','each section needs a unique id.');ids.add(s.id);
    if (!SECTION_TYPES.includes(s.type)) {fail(p+'.type',`choose ${SECTION_TYPES.join(', ')}.`);return;}
    if (s.enabled !== undefined && typeof s.enabled !== 'boolean') fail(p+'.enabled','use true or false without quotes.');
    if(list(s.animals,p+'.animals')){
      let animalCount=0;
      s.animals.forEach((animal,j)=>{
        const q=`${p}.animals[${j}]`;
        if(!obj(animal,q,['species','count','scale']))return;
        if(!ANIMAL_SPECIES.includes(animal.species))fail(q+'.species',`choose ${ANIMAL_SPECIES.join(', ')}.`);
        const count=animal.count===undefined?1:animal.count,scale=animal.scale===undefined?1:animal.scale;
        if(!Number.isInteger(count)||count<1||count>8)fail(q+'.count','use a whole number from 1 to 8.');
        else animalCount+=count;
        if(typeof scale!=='number'||!Number.isFinite(scale)||scale<0.5||scale>2)fail(q+'.scale','use a number from 0.5 to 2.');
      });
      if(animalCount>8)fail(p+'.animals','keep at most 8 animals per island.');
    }
    const enabled=s.enabled!==false;
    const typeFields={about:['story_title','paragraphs'],contact:[],experience:['items'],projects:['items'],education:['items'],skills:['groups','featured'],text:['paragraphs','links']}[s.type];
    for(const field of ['items','groups','paragraphs','links','story_title','featured'])if(s[field]!==undefined&&!typeFields.includes(field))fail(p+'.'+field,`this field does not belong to a ${s.type} section.`);
    if(s.type==='about'){str(s.story_title,p+'.story_title');texts(s.paragraphs,p+'.paragraphs');}
    if (['experience','projects','education'].includes(s.type) && list(s.items,p+'.items',enabled)) {
      const roleIds=new Set();
      s.items.forEach((item,j)=>{
        const q=`${p}.items[${j}]`;
        const fields={experience:['id','company','team','role','location','period','technologies','highlights','url','logo','logo_background','focus','overview','stories'],projects:['name','description','period','technologies','highlights','url'],education:['institution','degree','location','period','highlights','url']}[s.type];
        if(!obj(item,q,fields))return;
        const required={experience:['company','role','period'],projects:['name','description'],education:['institution','degree']}[s.type];
        fields.filter(k=>!['technologies','highlights','url','logo','logo_background','stories'].includes(k)).forEach(k=>str(item[k],q+'.'+k,required.includes(k)));
        texts(item.technologies,q+'.technologies');texts(item.highlights,q+'.highlights');
        if(item.url!==undefined)url(item.url,q+'.url');
        logo(item.logo,q+'.logo');
        if(item.logo_background!==undefined&&!['light','dark','transparent'].includes(item.logo_background))fail(q+'.logo_background','choose light, dark, or transparent.');
        if(item.id!==undefined){
          if(typeof item.id!=='string'||!/^[a-z][a-z0-9-]*$/.test(item.id))fail(q+'.id','use lowercase letters, digits, and hyphens, starting with a letter.');
          if(roleIds.has(item.id))fail(q+'.id','each role in this section needs a unique id.');roleIds.add(item.id);
        }
        if(list(item.stories,q+'.stories')){
          const storyIds=new Set();
          item.stories.forEach((story,k)=>{
            const r=`${q}.stories[${k}]`;
            if(!obj(story,r,['id','title','label','metric','summary','challenge','work','result','technologies']))return;
            for(const field of ['id','title','summary','challenge','work','result'])str(story[field],r+'.'+field,true);
            str(story.label,r+'.label');texts(story.technologies,r+'.technologies');
            if(typeof story.id==='string'&&!/^[a-z][a-z0-9-]*$/.test(story.id))fail(r+'.id','use lowercase letters, digits, and hyphens, starting with a letter.');
            if(storyIds.has(story.id))fail(r+'.id','each story in a role needs a unique id.');storyIds.add(story.id);
            if(story.metric!==undefined&&obj(story.metric,r+'.metric',['value','label'])){str(story.metric.value,r+'.metric.value',true,60);str(story.metric.label,r+'.metric.label',true,180);}
          });
        }
      });
    }
    if(s.type==='skills' && list(s.groups,p+'.groups',enabled))s.groups.forEach((group,j)=>{const q=`${p}.groups[${j}]`;if(obj(group,q,['category','items'])){str(group.category,q+'.category',true);texts(group.items,q+'.items',true);}});
    if(s.type==='skills'&&s.featured!==undefined){str(s.featured,p+'.featured');if(!Array.isArray(s.groups)||!s.groups.some(group=>Array.isArray(group?.items)&&group.items.includes(s.featured)))fail(p+'.featured','choose a technology listed in this section’s groups.');}
    if(s.type==='text'){texts(s.paragraphs,p+'.paragraphs',enabled);links(s.links,p+'.links');}
    if(enabled&&s.type==='contact'&&resume.profile&&!resume.profile.email&&!resume.profile.phone&&!resume.profile.links?.length)fail(p,'add an email, phone, or link to profile for this contact section.');
  });
  const visible=resume.sections.filter(s=>s&&s.enabled!==false&&s.type!=='contact').length;
  if(visible<1||visible>12)fail('sections','keep between 1 and 12 enabled sections so every island has room.');
  return errors;
}

function matchesTechnology(technology,skill) {
  const normalize=value=>value.toLowerCase().replace(/[^a-z0-9+]/g,'');
  return technology.split(/\s*\/\s*/).some(name=>normalize(name)===normalize(skill));
}

export function getSkillEvidence(skill,sections) {
  const evidence=[];
  for(const section of sections.filter(s=>s.type==='experience'&&s.enabled!==false)){
    (section.items||[]).forEach((item,roleIndex)=>{
      const stories=(item.stories||[]).filter(story=>story.technologies?.some(tech=>matchesTechnology(tech,skill)));
      const reference={sectionId:section.id,roleId:item.id,roleIndex};
      if(stories.length)for(const story of stories)evidence.push({company:item.company,title:story.title,description:story.work,metric:story.metric,reference:{...reference,storyId:story.id}});
      else if(item.technologies?.some(tech=>matchesTechnology(tech,skill)))evidence.push({company:item.company,title:item.role,description:item.overview||item.highlights?.[0]||item.team||item.role,reference});
    });
  }
  return evidence;
}

export async function loadResume() {
  const response=await fetch(new URL('./content/resume.yml',import.meta.url),{cache:'no-store'});
  if(!response.ok)throw new Error(`Could not load content/resume.yml (HTTP ${response.status}).`);
  return parseResume(await response.text());
}

function element(tag,className,text) {
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=text;
  return el;
}
function paragraph(parent,text,className='resume-copy') {if(text)parent.append(element('p',className,text));}
function chips(parent,items) {
  if(!items?.length)return;
  const list=element('ul','resume-tags');
  for(const text of items)list.append(element('li','',text));
  parent.append(list);
}
function highlights(parent,items) {
  if(!items?.length)return;
  const list=element('ul','resume-highlights');
  for(const text of items)list.append(element('li','',text));
  parent.append(list);
}
function link(parent,label,url) {
  const a=element('a','resume-link',label);a.href=url;
  if(/^https?:/.test(url)){a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',`${label} (opens in a new tab)`);}
  a.append(element('span','','↗'));parent.append(a);
}

function companyBadge(item) {
  const badge=element('div',`company-logo company-logo--${item.logo_background||'light'}`);
  const initials=element('span','company-initials',item.company.split(/\s+/).slice(0,2).map(word=>word[0]).join(''));
  initials.setAttribute('aria-hidden','true');badge.append(initials);
  if(item.logo){
    const image=element('img','');image.alt=`${item.company} logo`;image.decoding='async';image.referrerPolicy='no-referrer';
    image.addEventListener('load',()=>{initials.hidden=true;});
    image.addEventListener('error',()=>{image.remove();initials.hidden=false;});
    image.src=item.logo;badge.append(image);
  }
  return badge;
}

function contributionExplorer(parent,items,id) {
  if(!items?.length)return;
  const explorer=element('section','contribution-explorer');
  const toolbar=element('div','contribution-toolbar');
  toolbar.append(element('h4','resume-category','Inside the role'));
  const toggle=element('button','contribution-mode','View all contributions');toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',id+'-all');
  toolbar.append(toggle);explorer.append(toolbar);
  const viewer=element('div','contribution-viewer');
  const copy=element('p','contribution-copy');copy.setAttribute('aria-live','polite');copy.setAttribute('aria-atomic','true');
  const controls=element('div','contribution-controls'),counter=element('span','contribution-count');
  const previous=element('button','contribution-arrow','←'),next=element('button','contribution-arrow','→');
  previous.type=next.type='button';previous.setAttribute('aria-label','Previous contribution');next.setAttribute('aria-label','Next contribution');
  let active=0;
  function update(){copy.textContent=items[active];counter.textContent=`${String(active+1).padStart(2,'0')} / ${String(items.length).padStart(2,'0')}`;previous.disabled=active===0;next.disabled=active===items.length-1;}
  previous.addEventListener('click',()=>{if(active>0){active--;update();}});next.addEventListener('click',()=>{if(active<items.length-1){active++;update();}});
  controls.append(previous,counter,next);viewer.append(copy,controls);explorer.append(viewer);
  const all=element('div','contribution-all');all.id=id+'-all';all.hidden=true;highlights(all,items);explorer.append(all);
  toggle.addEventListener('click',()=>{const expanded=all.hidden;all.hidden=!expanded;viewer.hidden=expanded;toggle.textContent=expanded?'Explore one at a time':'View all contributions';toggle.setAttribute('aria-expanded',String(expanded));});
  update();parent.append(explorer);
}

function tabKeys(event,index,count,select){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();
  select(event.key==='Home'?0:event.key==='End'?count-1:(index+(event.key==='ArrowRight'?1:-1)+count)%count,true);
}

function exploreWork(parent,reference,context,label='Explore this work'){
  if(!context.onExplore)return;
  const button=element('button','story-link',label);button.type='button';button.append(element('span','','↗'));
  button.addEventListener('click',()=>context.onExplore(reference));parent.append(button);
}

function renderStories(parent,item,id,selectedStory){
  const wrapper=element('section','case-explorer'),picker=element('div','case-picker');
  const select=element('select','case-select');select.id=id+'-story';select.setAttribute('aria-label',`Choose a ${item.company} case study`);
  const label=element('label','case-picker-label','Selected work');label.htmlFor=select.id;
  item.stories.forEach(story=>{const option=element('option','',story.label||story.title);option.value=story.id;select.append(option);});
  picker.append(label,select);wrapper.append(picker);
  const card=element('div','case-card');wrapper.append(card);
  function showStory(story){
    select.value=story.id;card.replaceChildren();card.dataset.story=story.id;
    if(story.metric){const metric=element('div','case-metric');metric.append(element('span','case-metric-value',story.metric.value),element('span','case-metric-label',story.metric.label));card.append(metric);}
    card.append(element('h3','case-title',story.title));paragraph(card,story.summary,'case-summary');
    const tabs=element('div','case-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Explore this case study');
    const panels=element('div','case-detail-panels'),buttons=[],details=[];
    function selectDetail(index,focus=false){buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;details[i].hidden=i!==index;});if(focus)buttons[index].focus({preventScroll:true});}
    [['challenge','The challenge'],['work','My contribution'],['result','The impact']].forEach(([key,title],i)=>{
      const detailId=`${id}-${story.id}-${key}`,button=element('button','case-tab',title);button.type='button';button.id=detailId+'-tab';button.setAttribute('role','tab');button.setAttribute('aria-controls',detailId);
      button.addEventListener('click',()=>selectDetail(i));button.addEventListener('keydown',event=>tabKeys(event,i,3,selectDetail));tabs.append(button);buttons.push(button);
      const detail=element('section','case-detail');detail.id=detailId;detail.setAttribute('role','tabpanel');detail.setAttribute('aria-labelledby',button.id);detail.tabIndex=0;paragraph(detail,story[key],'case-copy');panels.append(detail);details.push(detail);
    });
    card.append(tabs,panels);selectDetail(0);
  }
  select.addEventListener('change',()=>showStory(item.stories.find(story=>story.id===select.value)));
  showStory(item.stories.find(story=>story.id===selectedStory)||item.stories[0]);parent.append(wrapper);
}

function renderCareerPath(parent,context,sectionId){
  const roles=(context.resume?.sections||[]).filter(s=>s.type==='experience'&&s.enabled!==false).flatMap(s=>s.items.map((item,roleIndex)=>({item,reference:{sectionId:s.id,roleId:item.id,roleIndex}}))).reverse();
  if(!roles.length)return;
  const path=element('section','story-path');path.append(element('h4','resume-category','Where I’ve worked'));
  const tabs=element('div','story-path-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Explore my career');
  const panel=element('div','story-path-panel');panel.id=sectionId+'-career';panel.setAttribute('role','tabpanel');panel.tabIndex=0;
  const buttons=[];
  function select(index,focus=false){
    const {item,reference}=roles[index];buttons.forEach((b,i)=>{b.setAttribute('aria-selected',String(i===index));b.tabIndex=i===index?0:-1;});
    panel.replaceChildren();panel.setAttribute('aria-labelledby',buttons[index].id);
    panel.append(element('div','resume-period',item.period));paragraph(panel,item.overview||item.role,'story-path-copy');exploreWork(panel,reference,context);
    if(focus)buttons[index].focus({preventScroll:true});
  }
  roles.forEach(({item},i)=>{
    const button=element('button','story-path-tab');button.type='button';button.id=`${sectionId}-career-${i}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-label',item.company);
    button.append(element('span','story-path-field',item.focus||item.role),element('span','story-path-company',item.company));button.addEventListener('click',()=>select(i));button.addEventListener('keydown',event=>tabKeys(event,i,roles.length,select));tabs.append(button);buttons.push(button);
  });
  path.append(tabs,panel);parent.append(path);select(roles.length-1);
}

function renderSkills(parent,section,context){
  const allSkills=[...new Set(section.groups.flatMap(group=>group.items))],evidence=new Map(allSkills.map(skill=>[skill,getSkillEvidence(skill,context.resume?.sections||[])]));
  if(!allSkills.some(skill=>evidence.get(skill).length)){
    for(const group of section.groups){const block=element('section','resume-skill-group');block.append(element('h3','resume-category',group.category));chips(block,group.items);parent.append(block);}return;
  }
  const buttons=new Map(),additional=[];
  const result=element('section','skill-evidence'),status=element('p','skill-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  function select(skill){
    buttons.forEach((button,name)=>button.setAttribute('aria-pressed',String(skill===name)));
    const examples=evidence.get(skill);result.replaceChildren();status.textContent=`${skill} · ${examples.length} ${examples.length===1?'example':'examples'} from my work`;
    result.append(element('h3','skill-evidence-title',skill));
    for(const example of examples){
      const card=element('article','skill-evidence-card');card.append(element('div','evidence-company',example.company),element('h4','evidence-title',example.title));
      if(example.metric){const metric=element('p','evidence-metric');metric.append(element('strong','',example.metric.value),document.createTextNode(' '+example.metric.label));card.append(metric);}
      paragraph(card,example.description,'evidence-copy');exploreWork(card,example.reference,context,example.reference.storyId?'Open this case study':'Explore this role');result.append(card);
    }
  }
  for(const group of section.groups){
    const block=element('section','resume-skill-group'),tags=element('div','skill-buttons');block.append(element('h3','resume-category',group.category));
    for(const skill of group.items){
      if(!evidence.get(skill).length){additional.push(skill);continue;}
      if(buttons.has(skill))continue;
      const button=element('button','skill-button',skill);button.type='button';button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>select(skill));tags.append(button);buttons.set(skill,button);
    }
    if(tags.childElementCount){block.append(tags);parent.append(block);}
  }
  parent.append(status,result);
  if(additional.length){const block=element('section','additional-skills');block.append(element('h4','resume-category','Also in my toolkit'));chips(block,[...new Set(additional)]);parent.append(block);}
  select(buttons.has(section.featured)?section.featured:buttons.keys().next().value);
}

function renderExperience(parent,section,context) {
  const tabs=element('div','career-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Choose a company');
  const panels=element('div','career-panels'),buttons=[],articles=[];
  function select(index,focus=false){
    buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;articles[i].hidden=i!==index;});
    parent.scrollTop=0;if(focus)buttons[index].focus({preventScroll:true});
  }
  section.items.forEach((item,i)=>{
    const id=`${section.id}-company-${i}`,button=element('button','career-tab');button.type='button';button.id=id+'-tab';button.setAttribute('role','tab');button.setAttribute('aria-controls',id);button.setAttribute('aria-label',item.company);
    button.append(companyBadge(item),element('span','career-company-name',item.company));
    button.addEventListener('click',()=>select(i));
    button.addEventListener('keydown',event=>{
      const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;select(next,true);
    });tabs.append(button);buttons.push(button);
    const article=element('article','resume-entry career-panel');article.id=id;article.setAttribute('role','tabpanel');article.setAttribute('aria-labelledby',button.id);article.tabIndex=0;
    article.append(element('div','resume-period',item.period));paragraph(article,item.role,'resume-role');
    if(item.stories?.length){
      renderStories(article,item,id,context.focus?.storyId);
      const more=element('details','resume-more');more.append(element('summary','','Full role details'));paragraph(more,[item.team,item.location].filter(Boolean).join(' · '),'resume-subtitle');highlights(more,item.highlights);chips(more,item.technologies);article.append(more);
    }else{
      article.prepend(element('h3','resume-entry-title',item.company));paragraph(article,[item.team,item.location].filter(Boolean).join(' · '),'resume-subtitle');
      contributionExplorer(article,item.highlights,id);chips(article,item.technologies);
    }
    if(item.url)link(article,'Learn more',item.url);
    panels.append(article);articles.push(article);
  });
  parent.append(tabs,panels);
  const focused=context.focus?.roleId?section.items.findIndex(item=>item.id===context.focus.roleId):context.focus?.roleIndex??0;
  select(focused>=0&&focused<section.items.length?focused:0);
}

export function renderSection(parent,section,profile,context={}) {
  parent.replaceChildren();parent.scrollTop=0;parent.dataset.kind=section.type;
  paragraph(parent,section.intro,'resume-intro');
  if(section.type==='about'){
    parent.append(element('h3',section.story_title?'story-lead':'resume-name',section.story_title||profile.name));
    paragraph(parent,profile.summary);
    renderCareerPath(parent,context,section.id);
    if(section.paragraphs?.length){const details=element('details','resume-more about-focus');details.append(element('summary','','Where I focus'));for(const text of section.paragraphs)paragraph(details,text);parent.append(details);}
    if(profile.education?.length){
      const education=element('section','story-education');education.append(element('h4','resume-category','My foundation'));
      for(const item of profile.education){education.append(element('h5','education-degree',item.degree));paragraph(education,item.institution,'education-school');paragraph(education,[item.location,item.period].filter(Boolean).join(' · '),'resume-subtitle');}
      parent.append(education);
    }
  }
  if(section.type==='experience')renderExperience(parent,section,context);
  if(['projects','education'].includes(section.type)){
    for(const item of section.items){
      const article=element('article','resume-entry');
      if(item.period)article.append(element('div','resume-period',item.period));
      article.append(element('h3','resume-entry-title',item.name||item.degree));
      paragraph(article,item.institution,'resume-role');
      paragraph(article,[item.team,item.location].filter(Boolean).join(' · '),'resume-subtitle');
      paragraph(article,item.description);highlights(article,item.highlights);chips(article,item.technologies);
      if(item.url)link(article,section.type==='projects'?'Explore project':'Learn more',item.url);
      parent.append(article);
    }
  }
  if(section.type==='skills')renderSkills(parent,section,context);
  if(section.type==='contact'){
    parent.append(element('h3','resume-name',profile.name));
    paragraph(parent,[profile.headline,profile.location].filter(Boolean).join(' · '),'resume-subtitle');
    const links=element('div','resume-links');
    if(profile.email)link(links,profile.email,`mailto:${profile.email}`);
    if(profile.phone)link(links,profile.phone,`tel:${profile.phone.replace(/[ ()\-.]/g,'')}`);
    for(const entry of profile.links||[])link(links,entry.label,entry.url);
    parent.append(links);
  }
  if(section.type==='text'){
    for(const text of section.paragraphs)paragraph(parent,text);
    for(const entry of section.links||[])link(parent,entry.label,entry.url);
  }
}
