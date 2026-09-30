/**
 * Barcode Scanner Modal using Device Camera & WebAuthn / BarcodeDetector API
 * Supports real-time camera scanning, Web Audio beep on success,
 * manual barcode entry fallback, and instant product lookup.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Barcode, Sparkles, AlertCircle, Check, Zap } from 'lucide-react';
import { Button } from './Button';
import type { Language } from '../lib/i18n';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
  language?: Language;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onBarcodeScanned,
  language = 'en',
}) => {
  const isEn = language === 'en';
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState<string>('');
  const [isScanningActive, setIsScanningActive] = useState<boolean>(false);
  const scanIntervalRef = useRef<any>(null);

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
    } catch {
      // ignore audio context restrictions
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCameraError(null);
      setManualBarcode('');
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setIsScanningActive(true);
    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          isEn
            ? 'Camera API not supported in this browser. Use manual entry or test buttons below.'
            : 'Kamera haitumiki kwenye kivinjari hiki. Tumia uandajaji wa kawaida.'
        );
        setIsScanningActive(false);
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
          : 'Imeshindwa kufungua kamera. Ruhusu matumizi ya kamera auandike nambari.'
      );
      setIsScanningActive(false);
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
    setIsScanningActive(false);
  };

  const startBarcodeDetectionLoop = () => {
    if (typeof window === 'undefined') return;

    // Check if BarcodeDetector is supported natively in browser
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
    }, 400);
  };

  const handleDetectedCode = (code: string) => {
    if (!code) return;
    playBeep();
    stopCamera();
    onBarcodeScanned(code.trim());
    onClose();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualBarcode.trim()) return;
    playBeep();
    stopCamera();
    onBarcodeScanned(manualBarcode.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 select-none">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
              <Camera className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-black">
                {isEn ? 'Scan Product Barcode' : 'Skania Msimbo wa Bidhaa'}
              </h3>
              <p className="text-[10px] text-slate-400">
                {isEn ? 'Point camera at product barcode' : 'Elekeza kamera kwenye msimbo'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
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
              {/* Scan Reticle Overlay */}
              <div className="absolute inset-0 border-[32px] border-black/40 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-32 border-2 border-emerald-400 rounded-2xl relative animate-pulse shadow-lg flex items-center justify-center">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-0.5 bg-emerald-400 shadow-[0_0_12px_#34d399]" />
                  <span className="text-[10px] font-bold text-emerald-300 bg-slate-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
                    {isEn ? 'Align Barcode Here' : 'Weka Msimbo Hapa'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick Test / Demo Barcodes & Manual Entry */}
        <div className="p-4 space-y-3 bg-slate-50">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              {isEn ? 'Quick Test / Demo Scans:' : 'Jaribio la Haraka:'}
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { name: 'Supa Loaf 400g', code: '6161101000123' },
                { name: 'Tuzo Milk 500ml', code: '6161102000456' },
                { name: 'Jogoo Maize Meal 2kg', code: '6161103000789' },
              ].map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    playBeep();
                    stopCamera();
                    onBarcodeScanned(item.code);
                    onClose();
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-[11px] font-bold text-slate-800 transition shrink-0 cursor-pointer flex items-center gap-1 shadow-2xs"
                >
                  <Barcode className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2 pt-1">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder={isEn ? 'Or type barcode digits...' : 'Au andika nambari ya msimbo...'}
                className="w-full h-10 pl-9 pr-3 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <Button
              type="submit"
              variant="gradient"
              size="md"
              disabled={!manualBarcode.trim()}
              className="font-bold shrink-0"
            >
              {isEn ? 'Scan' : 'Skania'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};
