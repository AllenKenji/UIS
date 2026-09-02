import { useEffect, useRef, useState } from "react";
import "./camera-capture.css";

/**
 * Live in-browser camera capture (laptop webcam or mobile camera) via
 * getUserMedia — not just a native file-picker "capture" hint, which desktop
 * browsers ignore. Falls back to a plain file upload if the camera can't be
 * reached (permission denied, no camera, insecure context, etc).
 */
export default function CameraCapture({ onCapture, facingMode = "user", label = "Use Camera" }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  };

  useEffect(() => stopCamera, []); // stop the stream if the component unmounts

  // The <video> element is always mounted (hidden via CSS until active) so the
  // ref exists the moment getUserMedia resolves — attaching srcObject only
  // after `active` flips true races the video element into existing at all.
  useEffect(() => {
    if (active && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((err) => console.warn("Camera preview play() failed:", err));
    }
  }, [active]);

  const startCamera = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access isn't available in this browser. Please upload a photo instead.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      streamRef.current = stream;
      setActive(true);
    } catch (err) {
      console.error("Camera access failed:", err);
      setError("Could not access the camera (permission denied or unavailable). Please upload a photo instead.");
    } finally {
      setStarting(false);
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture(file);
      stopCamera();
    }, "image/jpeg", 0.9);
  };

  return (
    <div className="camera-capture">
      {!active && (
        <button type="button" onClick={startCamera} disabled={starting}>
          {starting ? "Starting camera..." : `📷 ${label}`}
        </button>
      )}
      <div className="camera-live" style={{ display: active ? "flex" : "none" }}>
        <video ref={videoRef} playsInline muted className="camera-preview" />
        <div className="camera-actions">
          <button type="button" onClick={capture}>📸 Capture</button>
          <button type="button" onClick={stopCamera}>Cancel</button>
        </div>
      </div>
      {error && <p className="public-error">{error}</p>}
    </div>
  );
}
