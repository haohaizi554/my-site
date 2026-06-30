// Reserved worker entry for future protected-bank isolation.
// Static deployments still keep recoverable key material in frontend assets;
// moving decryption here only reduces accidental leakage until a backend key
// service is introduced.

self.addEventListener('message', (event) => {
  const message = event.data || {};

  if (message.type === 'quiz-bank-worker:ping') {
    self.postMessage({
      type: 'quiz-bank-worker:pong',
      ok: true,
    });
  }
});
