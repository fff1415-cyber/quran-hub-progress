"use client";

import { QRCodeSVG } from "qrcode.react";

interface FixedQRCodeProps {
  url: string;
  label?: string;
}

export default function FixedQRCode({ url, label = "امسح للانضمام" }: FixedQRCodeProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-2 rounded-2xl bg-white/95 p-4 shadow-xl backdrop-blur-sm">
      <QRCodeSVG value={url} size={100} level="M" includeMargin />
      <span className="text-xs font-medium text-primary">{label}</span>
    </div>
  );
}
