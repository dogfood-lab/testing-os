try {
  process.send?.({ ready: true });
} catch (error) {
  throw new Error(`worker could not report: ${error.message}`);
}
