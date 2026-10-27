import React, { useEffect, useState, useSyncExternalStore } from 'react';

let runtimeLogoDataUrl: string | null = null;
const brandLogoListeners = new Set<() => void>();

export function setRuntimeBrandLogo(nextLogoUrl: string | null) {
  const normalized =
    typeof nextLogoUrl === 'string' && nextLogoUrl.trim().length > 0
      ? nextLogoUrl.trim()
      : null;
  if (runtimeLogoDataUrl === normalized) return;
  runtimeLogoDataUrl = normalized;
  brandLogoListeners.forEach((listener) => listener());
}

function subscribeBrandLogo(listener: () => void) {
  brandLogoListeners.add(listener);
  return () => {
    brandLogoListeners.delete(listener);
  };
}

function getBrandLogoSnapshot() {
  return runtimeLogoDataUrl;
}

export function DefaultQaagaLogoSvg({
  className = 'w-8 h-8',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="#059669" />
      <path
        d="M20 7.5L30.8 13.75V26.25L20 32.5L9.2 26.25V13.75L20 7.5Z"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <rect
        x="15.5"
        y="15.5"
        width="9"
        height="9"
        rx="2.5"
        transform="rotate(45 20 20)"
        fill="#A7F3D0"
      />
      <path
        d="M23.5 23.5L29.5 29.5"
        stroke="#ECFDF5"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * QAAGA AGENT Brand Mark — Automatically renders Administrator-configured
 * custom Logo Icon when set, or falls back to the built-in Geometric Q-Monogram.
 */
export function QaagaLogo({
  className = 'w-8 h-8',
  overrideSrc,
}: {
  className?: string;
  overrideSrc?: string | null;
}) {
  const globalLogo = useSyncExternalStore(
    subscribeBrandLogo,
    getBrandLogoSnapshot,
    getBrandLogoSnapshot
  );
  const effectiveSrc =
    overrideSrc !== undefined ? overrideSrc : globalLogo;
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [effectiveSrc]);

  if (effectiveSrc && !imgFailed) {
    return (
      <img
        src={effectiveSrc}
        alt="QAAGA AGENT Logo"
        onError={() => setImgFailed(true)}
        className={`${className} object-contain rounded-lg shrink-0 select-none`}
      />
    );
  }

  return <DefaultQaagaLogoSvg className={className} />;
}

export function BkashIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FDF2F8" />
      <path d="M8 9.5L19.5 13.2L15.2 22.5L8 9.5Z" fill="#E2136E" />
      <path d="M19.5 13.2L25 10.8L21.4 18.8L15.2 22.5L19.5 13.2Z" fill="#C0105D" />
      <path d="M15.2 22.5L21.4 18.8L24.5 21.5L15.2 22.5Z" fill="#F43F5E" />
    </svg>
  );
}

export function NagadIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FFF7ED" />
      <circle cx="16" cy="16.5" r="7.5" stroke="#EA580C" strokeWidth="2.5" />
      <path
        d="M16 7.5C17.8 9.5 19.2 11.2 19.2 13.2C19.2 15 17.8 16.5 16 16.5C14.2 16.5 12.8 15 12.8 13.2C12.8 11.2 14.2 9.5 16 7.5Z"
        fill="#F97316"
      />
      <circle cx="16" cy="18" r="2.2" fill="#DC2626" />
    </svg>
  );
}

export function RocketIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FAF5FF" />
      <path
        d="M21.8 10.2C18.5 10.5 14.4 12.8 12.2 16.2L9.5 16.8L11.8 19.1L12.9 20.2L15.2 22.5L15.8 19.8C19.2 17.6 21.5 13.5 21.8 10.2Z"
        fill="#7E22CE"
      />
      <circle cx="17.8" cy="14.2" r="1.6" fill="#F3E8FF" />
      <path d="M9.8 22.2L12.2 19.8" stroke="#A855F7" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function UserAvatarBadge({
  name,
  role,
  className = 'w-8 h-8',
}: {
  name: string;
  role?: string;
  className?: string;
}) {
  const initials = (name || 'QA')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`${className} rounded-full flex items-center justify-center font-heading font-bold text-xs shrink-0 select-none ${
        role === 'admin'
          ? 'bg-emerald-600 text-white'
          : 'bg-slate-800 text-emerald-300 dark:bg-slate-700'
      }`}
      title={name}
    >
      {initials}
    </div>
  );
}
