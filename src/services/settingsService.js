export const STORAGE_KEY = 'qmetry_settings';

export const getQMetrySettings = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }
  return null;
};

export const saveQMetrySettings = (settings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};
