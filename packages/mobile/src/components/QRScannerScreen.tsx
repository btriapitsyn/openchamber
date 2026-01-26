import React, { useCallback, useEffect, useState } from 'react';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useRemoteConnectionStore } from '../stores/useRemoteConnectionStore';

interface QRScannerScreenProps {
  onConnected: () => void;
}

export const QRScannerScreen: React.FC<QRScannerScreenProps> = ({ onConnected }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  
  const {
    connect,
    isConnecting,
    connectionError,
    recentConnections,
    setConnectionError,
  } = useRemoteConnectionStore();

  // Check camera permission on mount
  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    try {
      const { camera } = await BarcodeScanner.checkPermissions();
      setHasPermission(camera === 'granted');
    } catch {
      setHasPermission(false);
    }
  };

  const requestPermission = async () => {
    try {
      const { camera } = await BarcodeScanner.requestPermissions();
      setHasPermission(camera === 'granted');
      if (camera === 'granted') {
        startScanning();
      }
    } catch (error) {
      console.error('Permission request failed:', error);
      setHasPermission(false);
    }
  };

  const startScanning = useCallback(async () => {
    // Prevent duplicate listener registration
    if (isScanning) return;

    setIsScanning(true);
    setConnectionError(null);

    try {
      // Remove any existing listeners before adding new one to prevent duplicates
      await BarcodeScanner.removeAllListeners();

      // Add scanner listener for barcodes
      await BarcodeScanner.addListener('barcodesScanned', async (result) => {
        // Get first barcode from results
        const barcode = result.barcodes?.[0];
        const scannedValue = barcode?.rawValue;

        if (scannedValue) {
          // Haptic feedback on successful scan
          try {
            await Haptics.impact({ style: ImpactStyle.Heavy });
          } catch {
            // Ignore haptics errors
          }

          // Stop scanning
          await BarcodeScanner.stopScan();
          setIsScanning(false);

          // Try to connect
          const success = await connect(scannedValue);
          if (success) {
            onConnected();
          }
        }
      });

      // Start scanning
      await BarcodeScanner.startScan({
        formats: [BarcodeFormat.QrCode],
      });
    } catch (error) {
      console.error('Scanning failed:', error);
      setIsScanning(false);
      setConnectionError('Failed to start camera');
    }
  }, [isScanning, connect, onConnected, setConnectionError]);

  const stopScanning = useCallback(async () => {
    try {
      await BarcodeScanner.stopScan();
      await BarcodeScanner.removeAllListeners();
    } catch {
      // Ignore errors
    }
    setIsScanning(false);
  }, []);

  const handleManualConnect = async () => {
    if (!manualUrl.trim()) return;
    
    const success = await connect(manualUrl.trim());
    if (success) {
      onConnected();
    }
  };

  const handleRecentConnection = async (url: string, token?: string) => {
    // Pass token separately to avoid exposing it in URL logs/history
    const success = token ? await connect(url, token) : await connect(url);
    if (success) {
      onConnected();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="safe-area-top bg-background">
        <div className="px-4 py-4 flex items-center justify-center">
          <h1 className="text-xl font-semibold text-foreground">OpenChamber</h1>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Scanner area */}
        {isScanning ? (
          <div className="relative w-full max-w-xs aspect-square">
            {/* Scanner overlay */}
            <div className="absolute inset-0 border-2 border-primary rounded-2xl overflow-hidden">
              <div className="absolute inset-0 bg-black/50">
                {/* Cutout for scanner */}
                <div className="absolute inset-4 border-2 border-white rounded-lg" />
              </div>
            </div>
            
            {/* Scanning animation */}
            <div className="absolute inset-4 overflow-hidden rounded-lg">
              <div className="absolute inset-x-0 h-0.5 bg-primary animate-scan" />
            </div>
            
            {/* Stop button */}
            <button
              onClick={stopScanning}
              className="absolute -bottom-16 left-1/2 -translate-x-1/2 px-6 py-3 bg-muted text-foreground rounded-full"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="w-full max-w-sm space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center">
                <svg className="w-12 h-12 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Connect to Session</h2>
              <p className="text-muted-foreground">
                Scan the QR code from OpenChamber running with Cloudflare Tunnel
              </p>
              <p className="text-xs text-muted-foreground/70">
                Run: openchamber --try-cf-tunnel --tunnel-qr
              </p>
            </div>

            {/* Error message */}
            {connectionError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive text-center">{connectionError}</p>
              </div>
            )}

            {/* Scan button */}
            {hasPermission === false ? (
              <button
                onClick={requestPermission}
                className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-medium"
              >
                Grant Camera Permission
              </button>
            ) : (
              <button
                onClick={hasPermission ? startScanning : requestPermission}
                disabled={isConnecting}
                className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-medium disabled:opacity-50"
              >
                {isConnecting ? 'Connecting...' : 'Scan QR Code'}
              </button>
            )}

            {/* Manual input toggle */}
            <button
              onClick={() => setShowManualInput(!showManualInput)}
              className="w-full text-center text-sm text-muted-foreground"
            >
              {showManualInput ? 'Hide manual input' : 'Enter URL manually'}
            </button>

            {/* Manual URL input */}
            {showManualInput && (
              <div className="space-y-3">
                <input
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://xxx.trycloudflare.com"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={handleManualConnect}
                  disabled={!manualUrl.trim() || isConnecting}
                  className="w-full py-3 bg-secondary text-secondary-foreground rounded-xl font-medium disabled:opacity-50"
                >
                  Connect
                </button>
              </div>
            )}

            {/* Recent connections */}
            {recentConnections.length > 0 && !showManualInput && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">Recent connections</p>
                <div className="space-y-2">
                  {recentConnections.slice(0, 3).map((connection, index) => (
                    <button
                      key={`${connection.url}-${index}`}
                      onClick={() => handleRecentConnection(connection.url, connection.token)}
                      disabled={isConnecting}
                      className="w-full px-4 py-3 bg-muted/50 border border-border rounded-xl text-left disabled:opacity-50"
                    >
                      <p className="text-sm font-medium text-foreground truncate">
                        {connection.label || connection.url}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(connection.connectedAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Safe area bottom */}
      <div className="safe-area-bottom" />
      
      <style>{`
        .safe-area-top {
          padding-top: env(safe-area-inset-top);
        }
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom);
        }
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: calc(100% - 2px); }
        }
        .animate-scan {
          animation: scan 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};
