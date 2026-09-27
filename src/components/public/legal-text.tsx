/** Rechtstexte als Absätze anzeigen (Leerzeile trennt Absätze, Zeilen beginnend mit „# “ sind Überschriften). */
export function LegalText({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((b, i) =>
        b.startsWith('# ') ? (
          <h2 key={i} className="pt-2 text-lg font-semibold">
            {b.slice(2)}
          </h2>
        ) : (
          <p key={i} className="whitespace-pre-line">
            {b}
          </p>
        )
      )}
    </div>
  );
}
