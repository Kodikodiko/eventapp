
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import costAnalysis from '../../../../COST_ANALYSIS.md?raw';
import deployment from '../../../../DEPLOYMENT.md?raw';
import homelabDeployment from '../../../../HOMELAB_DEPLOYMENT.md?raw';
import readme from '../../../../README.md?raw';
import specification from '../../../../SPECIFICATION.md?raw';

const files = [
  { name: 'COST_ANALYSIS.md', content: costAnalysis },
  { name: 'DEPLOYMENT.md', content: deployment },
  { name: 'HOMELAB_DEPLOYMENT.md', content: homelabDeployment },
  { name: 'README.md', content: readme },
  { name: 'SPECIFICATION.md', content: specification },
];

export default function DownloadsPage() {

  const handleDownload = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
       <div>
        <h1 className="text-2xl font-bold tracking-tight">Downloads</h1>
        <p className="text-muted-foreground">Download project documentation and specification files.</p>
      </div>
      <Card>
        <CardHeader>
            <CardTitle>Markdown Documents</CardTitle>
            <CardDescription>
                Here are all the markdown files available in your project.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <ul className="space-y-2">
                {files.map(file => (
                    <li key={file.name} className="flex items-center justify-between p-3 bg-muted rounded-md">
                        <span className="font-mono text-sm">{file.name}</span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(file.content, file.name)}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                        </Button>
                    </li>
                ))}
            </ul>
        </CardContent>
      </Card>
    </div>
  );
}
