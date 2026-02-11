const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const customTemplatePath = path.join(projectRoot, 'build', 'msi-template.xml');
const targetTemplatePath = path.join(projectRoot, 'node_modules', 'app-builder-lib', 'templates', 'msi', 'template.xml');

console.log(`Copying custom MSI template from ${customTemplatePath} to ${targetTemplatePath}...`);

try {
    fs.copyFileSync(customTemplatePath, targetTemplatePath);
    console.log('Successfully updated MSI template.');
} catch (error) {
    console.error('Error updating MSI template:', error);
    process.exit(1);
}
