
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

type FileContent = {
  name: string;
  content: string;
};

type DownloadsClientPageProps = {
  files: FileContent[];
};

export function DownloadsClientPage({ files }: DownloadsClientPageProps) {

  const handleDownload = (content: string, fileName: string) => {
    const fileType = fileName.endsWith('.txt') ? 'text/plain' : 'text/markdown';
    const blob = new Blob([content], { type: `${fileType};charset=utf-8;` });
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
        <p className="text-muted-foreground">Download project documentation, specifications, and changelogs.</p>
      </div>
      <Card>
        <CardHeader>
            <CardTitle>Project Documents</CardTitle>
            <CardDescription>
                Here are all the documentation files available in your project.
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
                            disabled={file.content.startsWith('Error:')}
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
