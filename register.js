if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('Service Worker registrado con scope:', reg.scope);
      })
      .catch(err => {
        console.error('Error registrando Service Worker:', err);
      });
  });
} else {
  console.warn('Service Worker no soportado en este navegador.');
}
