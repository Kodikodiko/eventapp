
'use client';

import type { Session } from '@/lib/data';

const getTagStyles = (tag: Session['tag']) => {
  switch (tag) {
    case 'talk': return 'background-color: #e0f2fe; color: #0c4a6e;'; // sky-100, sky-800
    case 'workshop': return 'background-color: #fef3c7; color: #92400e;'; // amber-100, amber-800
    case 'break': return 'background-color: #f1f5f9; color: #334155;'; // slate-100, slate-800
    case 'general': return 'background-color: #ede9fe; color: #5b21b6;'; // violet-100, violet-800
    default: return 'background-color: #f3f4f6; color: #374151;'; // gray-100, gray-800
  }
};

const generateHtml = (sessions: Session[]): string => {
  // Group sessions by time
  const groupedSessions: Record<string, Session[]> = sessions.reduce((acc, session) => {
    if (!acc[session.from]) {
      acc[session.from] = [];
    }
    acc[session.from].push(session);
    return acc;
  }, {} as Record<string, Session[]>);

  let scheduleHtml = '';

  for (const time in groupedSessions) {
    const timeSlots = groupedSessions[time];
    const isSingleColumn = timeSlots.length === 1;

    scheduleHtml += `
      <div class="time-block">
        <div class="time-marker">${time}</div>
        <div class="session-group ${isSingleColumn ? 'single-column' : ''}">
    `;

    timeSlots.forEach(session => {
      scheduleHtml += `
        <div class="session-card ${isSingleColumn ? 'full-span' : ''}">
          <div class="session-header">
            <h3 class="session-title">${session.title}</h3>
            <span class="session-tag" style="${getTagStyles(session.tag)}">${session.tag}</span>
          </div>
          <div class="session-body">
            <p><strong>Time:</strong> ${session.from} - ${session.to}</p>
            ${session.speaker ? `<p><strong>Speaker:</strong> ${session.speaker}</p>` : ''}
            <p><strong>Location:</strong> ${session.location}</p>
          </div>
        </div>
      `;
    });

    scheduleHtml += `
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Event Schedule</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        body {
          font-family: 'Inter', sans-serif;
          background-color: #f9fafb;
          color: #1f2937;
          margin: 0;
          padding: 2rem;
        }
        .container {
          max-width: 1100px;
          margin: auto;
          background-color: white;
          padding: 2.5rem;
          border-radius: 12px;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
        }
        .header {
          text-align: center;
          border-bottom: 2px solid #e5e7eb;
          padding-bottom: 1.5rem;
          margin-bottom: 2.5rem;
        }
        .header h1 {
          font-size: 2.5rem;
          font-weight: 700;
          color: #4f46e5; /* Primary color */
        }
        .time-block {
          display: flex;
          gap: 2rem;
          margin-bottom: 2rem;
          page-break-inside: avoid;
        }
        .time-marker {
          font-size: 1.25rem;
          font-weight: 700;
          color: #4f46e5;
          width: 5rem;
          text-align: right;
          flex-shrink: 0;
          padding-top: 0.5rem;
        }
        .session-group {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
          border-left: 2px dashed #d1d5db;
          padding-left: 2rem;
        }
        .session-group.single-column {
            grid-template-columns: 1fr;
        }
        .session-card {
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          border-left: 5px solid #6366f1;
          border-radius: 8px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px 0 rgba(0,0,0,0.06);
          grid-column: span 2 / span 2;
        }
        .session-card.full-span {
            grid-column: span 4 / span 4;
        }
        .session-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }
        .session-title {
          font-size: 1.1rem;
          font-weight: 600;
          margin: 0;
        }
        .session-tag {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.25rem 0.6rem;
          border-radius: 9999px;
          text-transform: capitalize;
        }
        .session-body p {
          font-size: 0.9rem;
          color: #4b5563;
          margin: 0.25rem 0;
        }
        @page {
          size: A4;
          margin: 1.5cm;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Event Schedule</h1>
          <p>Tech Conference 2024</p>
        </div>
        ${scheduleHtml}
      </div>
    </body>
    </html>
  `;
};

export function printSchedule(sessions: Session[]) {
  const printableContent = generateHtml(sessions);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printableContent);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500); // Wait for styles to apply
  }
}
