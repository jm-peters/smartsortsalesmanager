/**
 * Barcode Scanner Modal using Device Camera & Web BarcodeDetector API
 * Supports continuous real-time camera scanning for high-speed checkout,
 * Web Audio beep & haptic feedback on success, live cart tally,
 * manual barcode entry fallback, and instant product lookup.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Barcode, AlertCircle, Check, Zap, ShoppingBag, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { formatKES, type KES } from '../lib/money';
import type { Language } from '../lib/i18n';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
  language?: Language;
  continuous?: boolean;
  cartItemCount?: number;
  cartTotalKES?: KES | number;
  lastScannedMessage?: string | null;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onBarcodeScanned,
  language = 'en',
  continuous = true,
  cartItemCount = 0,
  cartTotalKES = 0,
  lastScannedMessage,
}) => {
  const isEn = language === 'en';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState<string>('');
  const [isContinuous, setIsContinuous] = useState<boolean>(continuous);
  const [recentFlash, setRecentFlash] = useState<{ text: string; time: number } | null>(null);
  const scanIntervalRef = useRef<any>(null);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  // Audio Beep Generator
  const playBeep = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 beep
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(80);
      }
    } catch {
      // ignore audio context restrictions
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCameraError(null);
      setManualBarcode('');
      setRecentFlash(null);
      lastScannedCodeRef.current = null;
      lastScannedTimeRef.current = 0;
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          isEn
            ? 'Camera API not supported in this browser. Use manual entry or test buttons below.'
            : 'Kamera haitumiki kwenye kivinjari hiki. Tumia uandajaji wa kawaida.'
        );
        return;
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Start BarcodeDetector scan loop if supported
      startBarcodeDetectionLoop();
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError(
        isEn
          ? 'Could not access camera. Please allow camera permissions or enter barcode manually.'
          : 'Imeshindwa kufungua kamera. Ruhusu matumizi ya kamera au andika nambari.'
      );
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const startBarcodeDetectionLoop = () => {
    if (typeof window === 'undefined') return;

    const hasBarcodeDetector = 'BarcodeDetector' in window;
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
        return;
      }

      if (hasBarcodeDetector) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'upc_e', 'qr_code'],
          });
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (code) {
              handleDetectedCode(code);
            }
          }
        } catch {
          // fallback scan loop
        }
      }
    }, 250);
  };

  const handleDetectedCode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    const now = Date.now();
    // Throttle: 1400ms for same barcode, 600ms for different barcode
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 1400) {
      return;
    }
    if (now - lastScannedTimeRef.current < 500) {
      return;
    }

    lastScannedCodeRef.current = code;
    lastScannedTimeRef.current = now;

    playBeep();
    setRecentFlash({ text: code, time: now });

    onBarcodeScanned(code);

    if (!isContinuous) {
      stopCamera();
      onClose();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    const code = manualBarcode.trim();
    setManualBarcode('');
    playBeep();
    setRecentFlash({ text: code, time: Date.now() });
    onBarcodeScanned(code);

    if (!isContinuous) {
      stopCamera();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <Camera className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black">
                  {isEn ? 'Continuous Scanner' : 'Skani Mfululizo'}
                </h3>
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" />
                  {isContinuous ? (isEn ? 'Fast Multi-Scan' : 'Skani Haraka') : (isEn ? 'Single' : 'Moja')}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {isEn
                  ? 'Keep scanning items continuously without closing'
                  : 'Skani bidhaa mfululizo bila kufunga kamera'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Cart Banner & Continuous Switch */}
        <div className="bg-slate-800 text-slate-200 px-4 py-2 flex items-center justify-between text-xs border-b border-slate-700">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-400" />
            <span className="font-bold">
              {isEn ? 'Cart:' : 'Mkokoteni:'}{' '}
              <strong className="text-white text-sm tabular-nums">{cartItemCount}</strong> {isEn ? 'items' : 'vitu'} ·{' '}
              <strong className="text-emerald-400 text-sm tabular-nums">{formatKES(cartTotalKES)}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsContinuous(!isContinuous)}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
              isContinuous
                ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                : 'bg-slate-700 border-slate-600 text-slate-300'
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${isContinuous ? 'text-emerald-400' : ''}`} />
            <span>{isContinuous ? (isEn ? 'Continuous: ON' : 'Mfululizo: NDIO') : (isEn ? 'Continuous: OFF' : 'Mfululizo: HAPANA')}</span>
          </button>
        </div>

        {/* Camera Viewfinder */}
        <div className="relative bg-black aspect-[4/3] w-full overflow-hidden flex items-center justify-center">
          {cameraError ? (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center text-white bg-slate-900 space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Reticle Viewport */}
              <div className="absolute inset-0 border-[28px] sm:border-[36px] border-black/50 flex items-center justify-center pointer-events-none">
                <div
                  className={`w-64 h-32 rounded-2xl relative shadow-lg flex items-center justify-center transition-all duration-150 ${
                    recentFlash && Date.now() - recentFlash.time < 500
                      ? 'border-4 border-emerald-400 bg-emerald-500/20 scale-105 shadow-[0_0_25px_#10b981]'
                      : 'border-2 border-emerald-400 animate-pulse'
                  }`}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399]" />
                  <span className="text-[10px] font-bold text-emerald-300 bg-slate-950/85 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                    {isEn ? 'Point at Barcode' : 'Elekeza kwenye Msimbo'}
                  </span>
                </div>
              </div>

              {/* Real-time Feedback Overlay Banner */}
              {(lastScannedMessage || (recentFlash && Date.now() - recentFlash.time < 2000)) && (
                <div className="absolute bottom-3 left-3 right-3 bg-slate-950/90 backdrop-blur-md text-white px-3 py-2 rounded-xl border border-emerald-500/50 flex items-center gap-2 shadow-lg animate-in slide-in-from-bottom-2 duration-150">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                    ✓
                  </div>
                  <div className="text-[11px] font-bold text-emerald-300 truncate">
                    {lastScannedMessage || `Scanned: ${recentFlash?.text}`}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Action Controls & Manual Input */}
        <div className="p-3.5 sm:p-4 space-y-3 bg-slate-50 overflow-y-auto">
          {/* Done / View Cart Primary Action */}
          <Button
            variant="gradient"
            size="md"
            fullWidth
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="font-bold flex items-center justify-center gap-2 text-xs py-3 shadow-md cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isEn ? `Done Scanning (${cartItemCount} in Cart)` : `Nimemaliza (${cartItemCount} Kwenye Mkokoteni)`}</span>
          </Button>

          {/* Quick Demo Scan Buttons */}
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              {isEn ? 'Quick Scan Test:' : 'Jaribio la Haraka:'}
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { name: 'Supa Loaf 400g', code: '6161101000123' },
                { name: 'Tuzo Milk 500ml', code: '6161102000456' },
                { name: 'Jogoo Maize Meal 2kg', code: '6161103000789' },
              ].map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    handleDetectedCode(item.code);
                  }}
                  className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-[11px] font-bold text-slate-800 transition shrink-0 cursor-pointer flex items-center gap-1 shadow-2xs active:scale-95"
                >
                  <Barcode className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Input Form */}
          <form onSubmit={handleManualSubmit} className="flex gap-2 pt-1">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder={isEn ? 'Type barcode digits...' : 'Au andika nambari ya msimbo...'}
                className="w-full h-10 pl-9 pr-3 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              size="md"
              disabled={!manualBarcode.trim()}
              className="font-bold shrink-0 border-slate-300"
            >
              {isEn ? 'Add' : 'Ongeza'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
