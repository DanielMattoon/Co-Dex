import type { Badge } from './badges';

/**
 * Canvas-rendered certificate export (PRD 12.4) — a shareable PNG for the
 * higher-tier badges, generated entirely client-side, no server involved.
 */
export function renderCertificate(badge: Badge, trainerName: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const gradient = ctx.createLinearGradient(0, 0, 1000, 700);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1000, 700);

  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, 952, 652);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, 920, 620);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fbbf24';
  ctx.font = '28px monospace';
  ctx.fillText('CO-DEX CERTIFICATE OF ACHIEVEMENT', 500, 140);

  ctx.fillStyle = '#22d3ee';
  ctx.font = 'bold 52px monospace';
  ctx.fillText(badge.name, 500, 250);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '24px monospace';
  ctx.fillText(badge.description, 500, 310);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '20px monospace';
  ctx.fillText('Awarded to', 500, 400);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 40px monospace';
  ctx.fillText(trainerName, 500, 450);

  ctx.fillStyle = '#64748b';
  ctx.font = '18px monospace';
  ctx.fillText(new Date().toLocaleDateString(), 500, 560);

  ctx.font = '40px monospace';
  ctx.fillText('✦ ★ ✦', 500, 610);

  return canvas.toDataURL('image/png');
}

export function downloadCertificate(dataUrl: string, badgeId: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `codex-certificate-${badgeId}.png`;
  a.click();
}
