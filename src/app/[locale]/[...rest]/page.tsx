import { notFound } from 'next/navigation';

// Unbekannte Pfade innerhalb einer Sprache -> lokalisierte 404-Seite
export default function CatchAllPage() {
  notFound();
}
