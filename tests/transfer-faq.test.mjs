import {test} from 'node:test';
import assert from 'node:assert/strict';
import {faqItems,faqLabels,languageNames,faqCopy,matchingFaqs} from '../transfer-faq-data.js';
import {copyFaqAnswer,faqReturnLinks} from '../transfer-faq.js';

test('every question and control has a complete translation in every offered language',()=>{
 const langs=Object.keys(languageNames);assert.equal(langs.length,8);assert.equal(faqItems.length,6);assert.equal(new Set(faqItems.map(item=>item.id)).size,6);
 for(const lang of langs){assert.deepEqual(Object.keys(faqLabels[lang]),Object.keys(faqLabels.en));for(const text of Object.values(faqLabels[lang]))assert.ok(text.trim());for(const item of faqItems){assert.ok(item.translations[lang].question.trim());assert.ok(item.translations[lang].answer.trim());if(lang!=='en')assert.notEqual(item.translations[lang].answer,item.translations.en.answer);}}
});
test('copy takes the selected answer language and only copies the answer as plain text',async()=>{
 for(const lang of Object.keys(languageNames)){let copied;assert.equal(await copyFaqAnswer('seat-approval',lang,{writeText:async text=>{copied=text;},manual(){assert.fail('Clipboard should succeed');}}),true);assert.equal(copied,faqItems[0].translations[lang].answer);assert.doesNotMatch(copied,/<[^>]+>/);assert.ok(!copied.includes(faqItems[0].translations[lang].question));}
});
test('clipboard denial and missing clipboard expose the exact selected translation for manual copy',async()=>{
 for(const writeText of [undefined,async()=>{throw Error('Denied');}]){let fallback;assert.equal(await copyFaqAnswer('group-together','ar',{writeText,manual:(text,lang)=>fallback={text,lang}}),false);assert.equal(fallback.text,faqCopy('group-together','ar'));assert.equal(fallback.lang,'ar');}
});
test('search respects category and page language, including accents and empty results',()=>{
 assert.equal(matchingFaqs('','all','en').length,6);assert.equal(matchingFaqs('','seats','fr').length,2);assert.equal(matchingFaqs('CONFIRMACION','applications','es').length,2);assert.equal(matchingFaqs('join1616.com','applications','ko')[0].id,'application-status');assert.equal(matchingFaqs('nonexistentword','all','en').length,0);assert.equal(matchingFaqs('','alliances','ar').length,2);
});
test('unknown IDs never copy and unsupported language safely falls back to English',async()=>{
 assert.equal(faqCopy('seat-approval','xx'),faqCopy('seat-approval','en'));assert.equal(await copyFaqAnswer('missing','en',{writeText:()=>assert.fail(),manual:()=>assert.fail()}),false);
});

test('return navigation uses only the two workspace destinations',()=>{
 const [org,other]=faqReturnLinks('organization');assert.equal(org.href,'./live.html#organization');assert.equal(other.href,'./seat-confirmations.html');
 for(const source of [null,'seats','https://untrusted.example/']){const [primary,secondary]=faqReturnLinks(source);assert.equal(primary.href,'./seat-confirmations.html');assert.equal(secondary.href,'./live.html#organization');}
});
