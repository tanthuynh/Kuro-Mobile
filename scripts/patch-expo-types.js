const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../node_modules/expo/types/index.d.ts');
if (fs.existsSync(indexPath)) {
  let content = fs.readFileSync(indexPath, 'utf8');
  if (content.includes('react-native-web')) {
    content = content
      .replace('/// <reference types="./react-native-web" />', '')
      .replace("import './react-native-web';", '');
    fs.writeFileSync(indexPath, content);
    console.log('[patch-expo-types] Successfully patched expo/types/index.d.ts.');
  }
}
