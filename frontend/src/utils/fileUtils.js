import { api, API_BASE_URL } from "../services/api";

/**
 * ✅ Generate safe file reference
 */
export const generateSafeFileRef = (uid, path, fileName) => {
  const safeFileName = encodeURIComponent(fileName);
  return `residents/${uid}/${path}/${safeFileName}`;
};

/**
 * ✅ Resize image to square thumbnail (default 192px)
 */
export const resizeImage = (file, size = 192) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, size, size);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Resize failed"))),
        "image/jpeg",
        0.9
      );
    };

    img.onerror = () => reject(new Error("Invalid image file"));
  });

/**
 * ✅ Upload blob with type-safe extension
 */
export const uploadBlobToStorage = async (uid, blob, path, fileName) => {
  const contentType = blob.type || "image/png";

  console.log("📂 Uploading to:", path);
  console.log("📦 Blob type:", contentType);
  console.log("📦 Blob size:", blob.size);

  const formData = new FormData();
  formData.append("uid", uid);
  formData.append("path", path);
  formData.append("file", blob, fileName);
  const response = await api.post("/api/storage/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  const url = response.data?.url;
  return url?.startsWith("/") ? `${API_BASE_URL}${url}` : url;
};

export const uploadLocalFile = async (uid, file, path, fileName = file.name) => {
  const response = await api.post("/api/storage/upload", (() => {
    const formData = new FormData();
    formData.append("uid", uid);
    formData.append("path", path);
    formData.append("file", file, fileName);
    return formData;
  })(), { headers: { "Content-Type": "multipart/form-data" } });
  const url = response.data?.url;
  return { url: url?.startsWith("/") ? `${API_BASE_URL}${url}` : url, path: response.data?.path };
};

/**
 * ✅ Normalize extension based on MIME type
 */
const getExtensionFromMime = (mime) => {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
      return "png";
    default:
      return "png";
  }
};

/**
 * ✅ Upload file (with optional resize)
 */
export const uploadFile = async (uid, file, path, resize = false) => {
  try {
    const timestamp = Date.now();
    const blob = resize ? await resizeImage(file) : file;

    if (!blob || blob.size === 0) throw new Error(`${path} blob is empty`);

    const ext = getExtensionFromMime(blob.type);
    const fileName = `${path}_${timestamp}.${ext}`;

    return await uploadBlobToStorage(uid, blob, path, fileName);
  } catch (err) {
    console.error(`❌ uploadFile error for ${path}:`, err);
    throw err;
  }
};

/**
 * ✅ Upload base64 image (e.g. signature pad)
 */
export const uploadBase64Image = async (uid, dataUrl, path) => {
  if (!dataUrl?.startsWith("data:image"))
    throw new Error("Malformed signature data URL");

  const response = await fetch(dataUrl);
  const blob = await response.blob();

  if (!blob || blob.size === 0) throw new Error("Signature blob is empty");

  const timestamp = Date.now();
  const ext = getExtensionFromMime(blob.type);
  const fileName = `${path}_${timestamp}.${ext}`;

  return await uploadBlobToStorage(uid, blob, path, fileName);
};

/**
 * ✅ Upload thumbprint (left/right)
 */
export const uploadThumbprint = async (uid, file, hand) => {
  if (!["left", "right"].includes(hand)) {
    throw new Error("Invalid thumb orientation. Must be 'left' or 'right'.");
  }
  return await uploadFile(uid, file, `fingerprints/${hand}`, true);
};
