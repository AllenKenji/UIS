export const fetchBarangays = async (cityCode = "137607000") => {
  const res = await fetch(`https://psgc.cloud/api/barangays/city-municipality/${cityCode}`);
  if (!res.ok) throw new Error("Failed to fetch barangays");
  const barangays = await res.json();
  return barangays.map(b => b.name);
};
