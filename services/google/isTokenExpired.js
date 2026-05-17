export const isTokenExpired = (expiryDate) => {
  return Date.now() >= expiryDate - 2 * 60 * 1000; // 2 min buffer
};
