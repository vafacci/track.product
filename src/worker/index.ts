// Background worker: runs scheduled price checks (filled in at a later build step).
// It must keep running: `npm start` stops the web server if the worker exits.
console.log("[worker] started, waiting for jobs (scheduler not built yet)");

const keepAlive = setInterval(() => {}, 60_000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(keepAlive);
    process.exit(0);
  });
}
