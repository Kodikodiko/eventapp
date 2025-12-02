
import { promises as fs } from 'fs';
import path from 'path';
import { DownloadsClientPage } from './client-page';

const fileNames = [
  'COST_ANALYSIS.md',
  'DEPLOYMENT.md',
  'HOMELAB_DEPLOYMENT.md',
  'README.md',
  'SPECIFICATION.md',
];

async function getFileContent() {
  const files = await Promise.all(
    fileNames.map(async (fileName) => {
      // Navigate from src/app/(app)/downloads up to the project root
      const filePath = path.join(process.cwd(), fileName);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return { name: fileName, content };
      } catch (error) {
        console.error(`Error reading ${fileName}:`, error);
        return { name: fileName, content: `Error: Could not load file.` };
      }
    })
  );
  return files;
}

export default async function DownloadsPage() {
  const files = await getFileContent();

  return <DownloadsClientPage files={files} />;
}
