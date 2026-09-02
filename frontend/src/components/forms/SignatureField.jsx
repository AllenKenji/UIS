import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import './signature-field.css';

const SignatureField = ({ label = "Signature", onChange, onEmptyCheck }) => {
  const sigCanvas = useRef(null);
  const [signatureUrl, setSignatureUrl] = useState('');

  // Check if pad is empty on mount
  useEffect(() => {
    if (onEmptyCheck) {
      onEmptyCheck(sigCanvas.current?.isEmpty());
    }
  }, [onEmptyCheck]);

  const clearSignature = () => {
    sigCanvas.current.clear();
    setSignatureUrl('');
    onChange?.('');
    onEmptyCheck?.(true); // pad is empty
  };

  const saveSignature = () => {
    if (!sigCanvas.current.isEmpty()) {
      const canvas = sigCanvas.current.getCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      setSignatureUrl(dataUrl);
      onChange?.(dataUrl);
      onEmptyCheck?.(false); // pad has content
    } else {
      setSignatureUrl('');
      onChange?.(null);
      onEmptyCheck?.(true);
    }
  };

  // Attach scroll prevention only for touch devices
  useEffect(() => {
    const canvasEl = sigCanvas.current?.getCanvas();
    if (!canvasEl) return;

    const preventScroll = (e) => e.preventDefault();

    if ('ontouchstart' in window) {
      // Intentionally non-passive: prevent page scroll while signing on touch devices
      canvasEl.addEventListener('touchstart', preventScroll, { passive: false });
      canvasEl.addEventListener('touchmove', preventScroll, { passive: false });

      return () => {
        canvasEl.removeEventListener('touchstart', preventScroll);
        canvasEl.removeEventListener('touchmove', preventScroll);
      };
    }
  }, []);

  return (
    <div className="signature-field">
      <label>{label}</label>
      <SignatureCanvas
        ref={sigCanvas}
        penColor="black"
        canvasProps={{ width: 400, height: 150, className: 'signature-canvas' }}
      />
      <div className="signature-actions">
        <button type="button" onClick={clearSignature}>Clear</button>
        <button type="button" onClick={saveSignature}>Save</button>
      </div>

      {signatureUrl && (
        <div className="signature-preview">
          <img src={signatureUrl} alt="Signature preview" />
        </div>
      )}
    </div>
  );
};

export default SignatureField;
