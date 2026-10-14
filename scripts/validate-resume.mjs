import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseResume } from '../dist/resume-data.js';

const path=process.argv[2]?resolve(process.argv[2]):fileURLToPath(new URL('../dist/content/resume.yml',import.meta.url));
try{
  const resume=parseResume(await readFile(path,'utf8'));
  if(resume.profile.resume_pdf){
    try{await access(new URL('../dist/'+resume.profile.resume_pdf,import.meta.url));}
    catch{throw new Error(`profile.resume_pdf: file not found: dist/${resume.profile.resume_pdf}`);}
  }
  for(const section of resume.sections){
    for(const item of section.items||[]){
      if(item.logo&&!/^https?:\/\//i.test(item.logo)){
        try{await access(new URL('../dist/'+item.logo,import.meta.url));}
        catch{throw new Error(`${section.id}: logo file not found: dist/${item.logo}`);}
      }
    }
  }
  const sections=resume.sections.filter(s=>s.enabled!==false);
  console.log(`Valid resume: ${resume.profile.name}`);
  console.log(`${sections.length} islands: ${sections.map(s=>s.title).join(' → ')}`);
}catch(error){
  console.error(`Resume needs a correction:\n${error.message}`);
  process.exitCode=1;
}
