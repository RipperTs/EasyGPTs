// Test script to check moduleTemplatesFlat
import { moduleTemplatesFlat } from '../packages/global/core/workflow/template/constants';

console.log('moduleTemplatesFlat IDs:');
moduleTemplatesFlat.forEach(template => {
  console.log(`- ${template.id}`);
});

const toolsTemplate = moduleTemplatesFlat.find(t => t.id === 'tools');
console.log('\nTools template found:', toolsTemplate ? 'YES' : 'NO');
if (toolsTemplate) {
  console.log('Tools template:', toolsTemplate);
}