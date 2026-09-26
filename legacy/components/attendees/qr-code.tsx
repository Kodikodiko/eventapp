"use client"
// A simple SVG to represent a QR code
export function QrCode({ value }: { value: string }) {
  // A real implementation would use a library like 'qrcode.react'
  // For this scaffold, we'll use a placeholder SVG
  return (
    <svg width="160" height="160" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="rounded-lg">
      <rect width="40" height="40" fill="white"/>
      <rect x="4" y="4" width="8" height="8" fill="black"/>
      <rect x="5" y="5" width="6" height="6" fill="white"/>
      <rect x="6" y="6" width="4" height="4" fill="black"/>
      <rect x="28" y="4" width="8" height="8" fill="black"/>
      <rect x="29" y="5" width="6" height="6" fill="white"/>
      <rect x="30" y="6" width="4" height="4" fill="black"/>
      <rect x="4" y="28" width="8" height="8" fill="black"/>
      <rect x="5" y="29" width="6" height="6" fill="white"/>
      <rect x="6" y="30" width="4" height="4" fill="black"/>
      <rect x="14" y="4" width="2" height="2" fill="black"/>
      <rect x="18" y="4" width="2" height="2" fill="black"/>
      <rect x="22" y="4" width="2" height="2" fill="black"/>
      <rect x="26" y="4" width="2" height="2" fill="black"/>
      <rect x="4" y="14" width="2" height="2" fill="black"/>
      <rect x="10" y="14" width="2" height="2" fill="black"/>
      <rect x="4" y="18" width="2" height="2" fill="black"/>
      <rect x="4" y="22" width="2" height="2" fill="black"/>
      <rect x="4" y="26" width="2" height="2" fill="black"/>
      <rect x="14" y="28" width="2" height="2" fill="black"/>
      <rect x="18" y="28" width="2" height="2" fill="black"/>
      <rect x="22" y="28" width="2" height="2" fill="black"/>
      <rect x="26" y="28" width="2" height="2" fill="black"/>
      <rect x="28" y="14" width="2" height="2" fill="black"/>
      <rect x="34" y="14" width="2" height="2" fill="black"/>
      <rect x="28" y="18" width="2" height="2" fill="black"/>
      <rect x="28" y="22" width="2" height="2" fill="black"/>
      <rect x="28" y="26" width="2" height="2" fill="black"/>
      <rect x="16" y="16" width="8" height="8" fill="black"/>
      <rect x="17" y="17" width="6" height="6" fill="white"/>
      <rect x="18" y="18" width="4" height="4" fill="black"/>
      <rect x="14" y="10" width="2" height="2" fill="black"/>
      <rect x="20" y="10" width="2" height="2" fill="black"/>
      <rect x="14" y="22" width="2" height="2" fill="black"/>
      <rect x="24" y="14" width="2" height="2" fill="black"/>
    </svg>
  );
}
